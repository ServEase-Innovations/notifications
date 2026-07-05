import { query, getClient } from '../database/connection.js';
import { cache } from '../redis/pubsubClient.js';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';

/**
 * Generate unique session ID
 */
function generateSessionId() {
  return `sess_${randomBytes(16).toString('hex')}`;
}

/**
 * Generate session token (JWT)
 */
function generateSessionToken(sessionData) {
  return jwt.sign(
    {
      session_id: sessionData.session_id,
      engagement_id: sessionData.engagement_id,
      customer_id: sessionData.customer_id,
    },
    config.jwt.secret,
    { expiresIn: '24h' }
  );
}

/**
 * Create a new tracking session
 * @param {object} sessionData - Session creation data
 * @returns {Promise<object>} Created session
 */
export async function createTrackingSession(sessionData) {
  const {
    engagement_id,
    customer_id,
    provider_id,
    destination,
    is_team = false,
    team_data = null,
  } = sessionData;
  
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    // Check if active session already exists for this engagement
    const existingSession = await client.query(
      `SELECT session_id, status 
       FROM tracking_sessions 
       WHERE engagement_id = $1 AND status = 'active'
       LIMIT 1`,
      [engagement_id]
    );
    
    if (existingSession.rows.length > 0) {
      // Return existing session
      await client.query('COMMIT');
      const session = existingSession.rows[0];
      const sessionToken = generateSessionToken({
        session_id: session.session_id,
        engagement_id,
        customer_id,
      });
      
      return {
        session_id: session.session_id,
        session_token: sessionToken,
        is_team,
        team_data,
      };
    }
    
    // Create new session
    const session_id = generateSessionId();
    
    // Convert destination to proper JSON format
    let destinationJSON;
    if (typeof destination === 'string') {
      // If it's a string address, wrap it in an object
      destinationJSON = JSON.stringify({ address: destination });
    } else if (typeof destination === 'object') {
      destinationJSON = JSON.stringify(destination);
    } else {
      destinationJSON = JSON.stringify({ address: String(destination) });
    }
    
    const teamDataJSON = team_data ? JSON.stringify(team_data) : null;
    
    await client.query(
      `INSERT INTO tracking_sessions (
        session_id,
        engagement_id,
        customer_id,
        provider_id,
        status,
        started_at,
        destination,
        is_team,
        team_data
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`,
      [
        session_id,
        engagement_id,
        customer_id,
        provider_id,
        'active',
        destinationJSON,
        is_team,
        teamDataJSON,
      ]
    );
    
    await client.query('COMMIT');
    
    // Cache session data in Redis for quick access (24h TTL)
    const sessionCacheKey = `tracking_session:${session_id}`;
    await cache.set(
      sessionCacheKey,
      JSON.stringify({
        session_id,
        engagement_id,
        customer_id,
        provider_id,
        is_team,
        team_data,
      }),
      86400 // 24 hours
    );
    
    // Generate session token
    const sessionToken = generateSessionToken({
      session_id,
      engagement_id,
      customer_id,
    });
    
    console.log(`✅ Created tracking session ${session_id} for engagement ${engagement_id}`);
    
    return {
      session_id,
      session_token: sessionToken,
      is_team,
      team_data,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tracking session:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Stop a tracking session
 * @param {string} session_id - Session identifier
 * @returns {Promise<boolean>} Success status
 */
export async function stopTrackingSession(session_id) {
  try {
    const result = await query(
      `UPDATE tracking_sessions 
       SET status = 'completed', completed_at = NOW() 
       WHERE session_id = $1 AND status = 'active'`,
      [session_id]
    );
    
    if (result.rowCount === 0) {
      return false;
    }
    
    // Remove from cache
    await cache.del(`tracking_session:${session_id}`);
    
    console.log(`✅ Stopped tracking session ${session_id}`);
    return true;
  } catch (error) {
    console.error('Error stopping tracking session:', error);
    return false;
  }
}

/**
 * Get session by ID
 * @param {string} session_id - Session identifier
 * @returns {Promise<object|null>} Session data or null
 */
export async function getSessionById(session_id) {
  try {
    // Try cache first
    const cacheKey = `tracking_session:${session_id}`;
    const cached = await cache.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fallback to database
    const result = await query(
      `SELECT 
        session_id,
        engagement_id,
        customer_id,
        provider_id,
        status,
        started_at,
        last_update_at,
        destination,
        is_team,
        team_data
       FROM tracking_sessions 
       WHERE session_id = $1`,
      [session_id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const session = result.rows[0];
    
    // Cache for future requests
    if (session.status === 'active') {
      await cache.set(cacheKey, JSON.stringify(session), 3600);
    }
    
    return session;
  } catch (error) {
    console.error('Error getting session by ID:', error);
    return null;
  }
}

/**
 * Update session last update timestamp
 * @param {string} session_id - Session identifier
 * @returns {Promise<boolean>} Success status
 */
export async function updateSessionTimestamp(session_id) {
  try {
    await query(
      `UPDATE tracking_sessions 
       SET last_update_at = NOW() 
       WHERE session_id = $1`,
      [session_id]
    );
    return true;
  } catch (error) {
    console.error('Error updating session timestamp:', error);
    return false;
  }
}

/**
 * Get active sessions for an engagement
 * @param {number} engagement_id - Engagement identifier
 * @returns {Promise<Array>} Array of active sessions
 */
export async function getActiveSessionsByEngagement(engagement_id) {
  try {
    const result = await query(
      `SELECT 
        session_id,
        engagement_id,
        customer_id,
        provider_id,
        started_at,
        last_update_at
       FROM tracking_sessions 
       WHERE engagement_id = $1 AND status = 'active'`,
      [engagement_id]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error getting active sessions:', error);
    return [];
  }
}

/**
 * Clean up old completed sessions (data purging)
 * @param {number} hoursOld - Remove sessions older than this many hours
 * @returns {Promise<number>} Number of sessions deleted
 */
export async function purgeOldSessions(hoursOld = 24) {
  try {
    const result = await query(
      `DELETE FROM tracking_sessions 
       WHERE status = 'completed' 
       AND completed_at < NOW() - INTERVAL '${hoursOld} hours'`
    );
    
    if (result.rowCount > 0) {
      console.log(`🗑️  Purged ${result.rowCount} old tracking sessions`);
    }
    
    return result.rowCount;
  } catch (error) {
    console.error('Error purging old sessions:', error);
    return 0;
  }
}

export default {
  createTrackingSession,
  stopTrackingSession,
  getSessionById,
  updateSessionTimestamp,
  getActiveSessionsByEngagement,
  purgeOldSessions,
};
