import { query } from '../database/connection.js';

/**
 * Tracking status values for provider journey
 */
export const TRACKING_STATUS = {
  NOT_STARTED: 'not_started',
  EN_ROUTE: 'en_route',
  ARRIVED: 'arrived',
  SERVICE_STARTED: 'service_started',
  SERVICE_COMPLETED: 'service_completed',
};

/**
 * Get or create tracking status for an engagement
 * @param {number} engagementId - Engagement identifier
 * @param {number} providerId - Provider identifier
 * @returns {Promise<object>} Tracking status record
 */
export async function getOrCreateTrackingStatus(engagementId, providerId) {
  try {
    // Try to get existing record
    const result = await query(
      `SELECT * FROM engagement_tracking_status WHERE engagement_id = $1`,
      [engagementId]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Create new record
    const insertResult = await query(
      `INSERT INTO engagement_tracking_status (engagement_id, provider_id, tracking_status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [engagementId, providerId, TRACKING_STATUS.NOT_STARTED]
    );
    
    return insertResult.rows[0];
  } catch (error) {
    console.error('Error getting/creating tracking status:', error);
    throw error;
  }
}

/**
 * Update tracking status for an engagement
 * @param {number} engagementId - Engagement identifier
 * @param {string} newStatus - New tracking status
 * @param {object} additionalFields - Additional fields to update (latitude, longitude, etc.)
 * @returns {Promise<object>} Updated tracking status record
 */
export async function updateTrackingStatus(engagementId, newStatus, additionalFields = {}) {
  try {
    // Build dynamic update query based on status
    const timestampField = getTimestampFieldForStatus(newStatus);
    const fields = ['tracking_status = $2'];
    const values = [engagementId, newStatus];
    let paramIndex = 3;
    
    // Add timestamp for this status transition
    if (timestampField) {
      fields.push(`${timestampField} = NOW()`);
    }
    
    // Add optional location data
    if (additionalFields.latitude !== undefined) {
      fields.push(`latitude = $${paramIndex}`);
      values.push(additionalFields.latitude);
      paramIndex++;
    }
    
    if (additionalFields.longitude !== undefined) {
      fields.push(`longitude = $${paramIndex}`);
      values.push(additionalFields.longitude);
      paramIndex++;
    }
    
    if (additionalFields.latitude !== undefined || additionalFields.longitude !== undefined) {
      fields.push('last_location_update = NOW()');
    }
    
    const updateQuery = `
      UPDATE engagement_tracking_status
      SET ${fields.join(', ')}
      WHERE engagement_id = $1
      RETURNING *
    `;
    
    const result = await query(updateQuery, values);
    
    if (result.rows.length === 0) {
      throw new Error('Tracking status record not found');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error updating tracking status:', error);
    throw error;
  }
}

/**
 * Get timestamp field name for a given status
 * @param {string} status - Tracking status
 * @returns {string|null} Timestamp field name
 */
function getTimestampFieldForStatus(status) {
  switch (status) {
    case TRACKING_STATUS.EN_ROUTE:
      return 'journey_started_at';
    case TRACKING_STATUS.ARRIVED:
      return 'arrived_at';
    case TRACKING_STATUS.SERVICE_STARTED:
      return 'service_started_at';
    case TRACKING_STATUS.SERVICE_COMPLETED:
      return 'service_completed_at';
    default:
      return null;
  }
}

/**
 * Start provider journey (enable tracking)
 * @param {number} engagementId - Engagement identifier
 * @param {number} providerId - Provider identifier
 * @param {object} location - Current location { latitude, longitude }
 * @returns {Promise<object>} Updated tracking status
 */
export async function startJourney(engagementId, providerId, location = {}) {
  try {
    // Ensure tracking status record exists
    await getOrCreateTrackingStatus(engagementId, providerId);
    
    // Update to en_route with location
    const result = await updateTrackingStatus(
      engagementId,
      TRACKING_STATUS.EN_ROUTE,
      location
    );
    
    console.log(`✅ Journey started for engagement ${engagementId}`);
    return result;
  } catch (error) {
    console.error('Error starting journey:', error);
    throw error;
  }
}

/**
 * Mark provider as arrived
 * @param {number} engagementId - Engagement identifier
 * @param {object} location - Current location { latitude, longitude }
 * @returns {Promise<object>} Updated tracking status
 */
export async function markArrived(engagementId, location = {}) {
  try {
    const result = await updateTrackingStatus(
      engagementId,
      TRACKING_STATUS.ARRIVED,
      location
    );
    
    console.log(`✅ Provider arrived for engagement ${engagementId}`);
    return result;
  } catch (error) {
    console.error('Error marking arrived:', error);
    throw error;
  }
}

/**
 * Mark service as started
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<object>} Updated tracking status
 */
export async function markServiceStarted(engagementId) {
  try {
    const result = await updateTrackingStatus(
      engagementId,
      TRACKING_STATUS.SERVICE_STARTED
    );
    
    console.log(`✅ Service started for engagement ${engagementId}`);
    return result;
  } catch (error) {
    console.error('Error marking service started:', error);
    throw error;
  }
}

/**
 * Mark service as completed
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<object>} Updated tracking status
 */
export async function markServiceCompleted(engagementId) {
  try {
    const result = await updateTrackingStatus(
      engagementId,
      TRACKING_STATUS.SERVICE_COMPLETED
    );
    
    console.log(`✅ Service completed for engagement ${engagementId}`);
    return result;
  } catch (error) {
    console.error('Error marking service completed:', error);
    throw error;
  }
}

/**
 * Get tracking status for an engagement
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<object|null>} Tracking status record or null
 */
export async function getTrackingStatus(engagementId) {
  try {
    const result = await query(
      `SELECT * FROM engagement_tracking_status WHERE engagement_id = $1`,
      [engagementId]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error getting tracking status:', error);
    return null;
  }
}

export default {
  TRACKING_STATUS,
  getOrCreateTrackingStatus,
  updateTrackingStatus,
  startJourney,
  markArrived,
  markServiceStarted,
  markServiceCompleted,
  getTrackingStatus,
};
