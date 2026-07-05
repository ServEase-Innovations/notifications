import { query } from '../database/connection.js';

/**
 * Provider states for tracking availability
 */
export const PROVIDER_STATUS = {
  NOT_STARTED: 'not_started',
  EN_ROUTE: 'en_route',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/**
 * Check if tracking is available for an engagement
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<object>} Availability status and reason
 */
export async function checkAvailability(engagementId) {
  try {
    // Query engagement basic data
    const result = await query(
      `SELECT 
        engagement_id,
        task_status as engagement_status,
        serviceproviderid as provider_id,
        customerid as customer_id,
        address as service_address,
        start_date as service_date,
        booking_type
      FROM engagements 
      WHERE engagement_id = $1`,
      [engagementId]
    );
    
    if (result.rows.length === 0) {
      return {
        available: false,
        provider_status: null,
        reason: 'Engagement not found',
        is_team: false,
        team_data: null,
      };
    }
    
    const engagement = result.rows[0];
    
    // Check tracking-specific status (separate from task_status)
    const trackingResult = await query(
      `SELECT tracking_status, journey_started_at, arrived_at 
       FROM engagement_tracking_status 
       WHERE engagement_id = $1`,
      [engagementId]
    );
    
    // Determine provider status based on tracking status (if exists) or engagement state
    let providerStatus;
    if (trackingResult.rows.length > 0) {
      // Use dedicated tracking status
      providerStatus = trackingResult.rows[0].tracking_status;
    } else {
      // Fall back to deriving from task_status
      providerStatus = determineProviderStatus(engagement);
    }
    
    // Tracking is only available when provider is en route
    const isAvailable = providerStatus === PROVIDER_STATUS.EN_ROUTE;
    
    // Note: Team tracking feature not yet implemented in schema
    // is_team and team_members columns don't exist in engagements table
    
    return {
      available: isAvailable,
      provider_status: providerStatus,
      reason: isAvailable ? null : getUnavailableReason(providerStatus),
      is_team: false, // Not yet supported in schema
      team_data: null,
      engagement_details: {
        id: engagement.engagement_id,
        provider_id: engagement.provider_id,
        customer_id: engagement.customer_id,
        service_address: engagement.service_address,
      },
    };
  } catch (error) {
    console.error('Error checking tracking availability:', error);
    throw new Error('Failed to check tracking availability');
  }
}

/**
 * Determine provider status from engagement data
 * @param {object} engagement - Engagement data from database
 * @returns {string} Provider status
 */
function determineProviderStatus(engagement) {
  const status = engagement.engagement_status?.toLowerCase();
  
  // Map engagement status to provider tracking status
  // Adjust these mappings based on your actual status values
  switch (status) {
    case 'scheduled':
    case 'pending':
    case 'confirmed':
      return PROVIDER_STATUS.NOT_STARTED;
    
    case 'provider_on_the_way':
    case 'en_route':
    case 'traveling':
      return PROVIDER_STATUS.EN_ROUTE;
    
    case 'provider_arrived':
    case 'arrived':
    case 'checked_in':
      return PROVIDER_STATUS.ARRIVED;
    
    case 'in_progress':
    case 'ongoing':
    case 'started':
      return PROVIDER_STATUS.IN_PROGRESS;
    
    case 'completed':
    case 'finished':
      return PROVIDER_STATUS.COMPLETED;
    
    case 'cancelled':
    case 'canceled':
      return PROVIDER_STATUS.CANCELLED;
    
    default:
      return PROVIDER_STATUS.NOT_STARTED;
  }
}

/**
 * Get human-readable reason for tracking unavailability
 * @param {string} providerStatus - Provider status
 * @returns {string} Reason message
 */
function getUnavailableReason(providerStatus) {
  switch (providerStatus) {
    case PROVIDER_STATUS.NOT_STARTED:
      return "Provider hasn't started the journey yet";
    
    case PROVIDER_STATUS.ARRIVED:
      return 'Provider has already arrived at the location';
    
    case PROVIDER_STATUS.IN_PROGRESS:
      return 'Service is currently in progress';
    
    case PROVIDER_STATUS.COMPLETED:
      return 'Service has been completed';
    
    case PROVIDER_STATUS.CANCELLED:
      return 'Service has been cancelled';
    
    default:
      return 'Tracking is not available at this time';
  }
}

/**
 * Update provider status in the database
 * @param {number} engagementId - Engagement identifier
 * @param {string} newStatus - New provider status
 * @returns {Promise<boolean>} Success status
 */
export async function updateProviderStatus(engagementId, newStatus) {
  try {
    await query(
      `UPDATE engagements 
       SET task_status = $1, updated_at = NOW() 
       WHERE engagement_id = $2`,
      [newStatus, engagementId]
    );
    return true;
  } catch (error) {
    console.error('Error updating provider status:', error);
    return false;
  }
}

/**
 * Get team details for an engagement
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<object|null>} Team details or null
 */
export async function getTeamDetails(engagementId) {
  // Team tracking not yet implemented in schema
  // is_team and team_members columns don't exist in engagements table
  console.log('Team tracking not yet supported - schema migration needed');
  return null;
}

export default {
  checkAvailability,
  updateProviderStatus,
  getTeamDetails,
  PROVIDER_STATUS,
};
