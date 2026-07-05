import { query } from '../database/connection.js';
import { cache } from '../redis/pubsubClient.js';
import { clearLocationData } from './locationProcessor.js';

/**
 * Purge completed tracking sessions and associated data
 * This is the main privacy compliance function
 */
export async function purgeCompletedSessions(hoursOld = 24) {
  console.log(`🗑️  Starting purge of sessions older than ${hoursOld} hours...`);
  
  try {
    // Find sessions to purge
    const sessionsToDelete = await query(
      `SELECT session_id, engagement_id 
       FROM tracking_sessions 
       WHERE status = 'completed' 
       AND completed_at < NOW() - INTERVAL '${hoursOld} hours'`
    );
    
    if (sessionsToDelete.rows.length === 0) {
      console.log('✅ No sessions to purge');
      return {
        success: true,
        sessions_deleted: 0,
        location_data_deleted: 0,
      };
    }
    
    console.log(`Found ${sessionsToDelete.rows.length} sessions to purge`);
    
    let locationDataDeleted = 0;
    
    // Delete location data from Redis for each session
    for (const session of sessionsToDelete.rows) {
      const deleted = await clearLocationData(session.engagement_id);
      if (deleted) {
        locationDataDeleted++;
      }
      
      // Also delete ETA cache
      await cache.del(`eta:${session.engagement_id}`);
      
      // Delete session cache
      await cache.del(`tracking_session:${session.session_id}`);
    }
    
    // Delete sessions from database
    const result = await query(
      `DELETE FROM tracking_sessions 
       WHERE status = 'completed' 
       AND completed_at < NOW() - INTERVAL '${hoursOld} hours'`
    );
    
    console.log(`✅ Purged ${result.rowCount} sessions and ${locationDataDeleted} location data sets`);
    
    return {
      success: true,
      sessions_deleted: result.rowCount,
      location_data_deleted: locationDataDeleted,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ Error during purge:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Purge data immediately when service completes
 * Called via event handler when engagement status changes to completed
 */
export async function onServiceCompleted(engagementId) {
  console.log(`🗑️  Service completed for engagement ${engagementId}, purging data...`);
  
  try {
    // Delete all location history immediately
    await clearLocationData(engagementId);
    
    // Delete ETA cache
    await cache.del(`eta:${engagementId}`);
    
    // Update session status to completed
    await query(
      `UPDATE tracking_sessions 
       SET status = 'completed', completed_at = NOW() 
       WHERE engagement_id = $1 AND status = 'active'`,
      [engagementId]
    );
    
    // Delete session cache
    const sessions = await query(
      `SELECT session_id FROM tracking_sessions WHERE engagement_id = $1`,
      [engagementId]
    );
    
    for (const session of sessions.rows) {
      await cache.del(`tracking_session:${session.session_id}`);
    }
    
    console.log(`✅ Data purged for completed engagement ${engagementId}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Error purging data for engagement ${engagementId}:`, error);
    return false;
  }
}

/**
 * Purge stale location data (no updates in X hours)
 * Helps clean up abandoned sessions
 */
export async function purgeStaleLocationData(hoursOld = 2) {
  console.log(`🗑️  Purging stale location data older than ${hoursOld} hours...`);
  
  try {
    // Find engagements with old location data
    const staleEngagements = await query(
      `SELECT DISTINCT engagement_id 
       FROM tracking_sessions 
       WHERE last_update_at < NOW() - INTERVAL '${hoursOld} hours'
       AND status = 'active'`
    );
    
    let purgedCount = 0;
    
    for (const row of staleEngagements.rows) {
      const deleted = await clearLocationData(row.engagement_id);
      if (deleted) {
        purgedCount++;
      }
    }
    
    console.log(`✅ Purged ${purgedCount} stale location data sets`);
    
    return {
      success: true,
      purged_count: purgedCount,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ Error purging stale location data:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate privacy compliance report
 */
export async function generatePrivacyReport() {
  try {
    const [activeSessions, completedSessions, oldSessions] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM tracking_sessions WHERE status = 'active'`),
      query(`SELECT COUNT(*) as count FROM tracking_sessions WHERE status = 'completed'`),
      query(`SELECT COUNT(*) as count FROM tracking_sessions 
             WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '24 hours'`),
    ]);
    
    // Get Redis key counts (approximation)
    const locationKeys = await cache.lrange('location_history:*', 0, -1);
    
    return {
      active_sessions: parseInt(activeSessions.rows[0].count),
      completed_sessions: parseInt(completedSessions.rows[0].count),
      old_sessions_pending_purge: parseInt(oldSessions.rows[0].count),
      redis_location_keys: locationKeys.length,
      next_purge_recommendation: oldSessions.rows[0].count > 0 ? 'immediate' : 'scheduled',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating privacy report:', error);
    return {
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Audit log entry for data access
 */
export async function logDataAccess(userId, engagementId, action, details = {}) {
  try {
    // Store audit log (could be in separate table or logging service)
    console.log(`📝 Audit: User ${userId} - Action: ${action} - Engagement: ${engagementId}`, details);
    
    // In production, this would write to an audit table:
    // await query(
    //   `INSERT INTO tracking_audit_logs (user_id, engagement_id, action, details, timestamp)
    //    VALUES ($1, $2, $3, $4, NOW())`,
    //   [userId, engagementId, action, JSON.stringify(details)]
    // );
    
    return true;
  } catch (error) {
    console.error('Error logging audit entry:', error);
    return false;
  }
}

/**
 * Schedule automatic purge job
 * Should be called on service startup
 */
export function scheduleAutoPurge(intervalHours = 1) {
  console.log(`⏰ Scheduling automatic purge every ${intervalHours} hour(s)`);
  
  // Run immediately on startup
  purgeCompletedSessions();
  
  // Schedule recurring purge
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const purgeInterval = setInterval(async () => {
    console.log('⏰ Running scheduled purge...');
    await purgeCompletedSessions();
    await purgeStaleLocationData();
  }, intervalMs);
  
  return purgeInterval;
}

export default {
  purgeCompletedSessions,
  onServiceCompleted,
  purgeStaleLocationData,
  generatePrivacyReport,
  logDataAccess,
  scheduleAutoPurge,
};
