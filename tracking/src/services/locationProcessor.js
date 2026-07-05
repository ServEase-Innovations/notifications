import { cache, publishLocationUpdate } from '../redis/pubsubClient.js';
import { updateSessionTimestamp } from './sessionService.js';
import { rateLimitLocationUpdate } from '../middleware/rateLimit.js';
import config from '../config/index.js';

/**
 * Validate location update payload
 * @param {object} update - Location update data
 * @returns {object} Validation result
 */
function validateLocationUpdate(update) {
  const required = ['provider_id', 'engagement_id', 'latitude', 'longitude', 'accuracy', 'timestamp'];
  const missing = required.filter(field => update[field] === undefined || update[field] === null);
  
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required fields: ${missing.join(', ')}`,
    };
  }
  
  // Validate latitude range
  if (update.latitude < -90 || update.latitude > 90) {
    return {
      valid: false,
      error: 'Latitude must be between -90 and 90',
    };
  }
  
  // Validate longitude range
  if (update.longitude < -180 || update.longitude > 180) {
    return {
      valid: false,
      error: 'Longitude must be between -180 and 180',
    };
  }
  
  // Validate accuracy
  if (update.accuracy < 0) {
    return {
      valid: false,
      error: 'Accuracy must be a positive number',
    };
  }
  
  // Validate timestamp (not too old or in future)
  const now = Date.now();
  const age = now - update.timestamp;
  
  if (age > 300000) { // 5 minutes
    return {
      valid: false,
      error: 'Location update is too old (>5 minutes)',
    };
  }
  
  if (age < -60000) { // 1 minute in future
    return {
      valid: false,
      error: 'Location timestamp is in the future',
    };
  }
  
  return { valid: true };
}

/**
 * Process and store location update
 * @param {object} locationUpdate - Location update from provider
 * @returns {Promise<object>} Processing result
 */
export async function processLocationUpdate(locationUpdate) {
  try {
    // Validate the update
    const validation = validateLocationUpdate(locationUpdate);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }
    
    // Check rate limit
    const rateCheck = await rateLimitLocationUpdate(locationUpdate.provider_id);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        retry_after: rateCheck.retry_after,
      };
    }
    
    const { engagement_id } = locationUpdate;
    
    // Store in Redis list (keep last N updates)
    const historyKey = `location_history:${engagement_id}`;
    await cache.lpush(historyKey, JSON.stringify(locationUpdate));
    await cache.ltrim(historyKey, 0, config.location.historySize - 1);
    await cache.expire(historyKey, config.location.cacheTTL);
    
    // Store as latest location
    const latestKey = `location_latest:${engagement_id}`;
    await cache.set(latestKey, JSON.stringify(locationUpdate), config.location.cacheTTL);
    
    // Publish to Redis Pub/Sub for real-time delivery
    await publishLocationUpdate(engagement_id, locationUpdate);
    
    // Update session timestamp
    // Note: This assumes we can find the session by engagement_id
    // In practice, you might need to query active sessions first
    
    console.log(`✅ Processed location update for engagement ${engagement_id}`);
    
    return {
      success: true,
      timestamp: locationUpdate.timestamp,
    };
  } catch (error) {
    console.error('Error processing location update:', error);
    return {
      success: false,
      error: 'Failed to process location update',
    };
  }
}

/**
 * Get latest location update for an engagement
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<object|null>} Latest location data
 */
export async function getLocationUpdate(engagementId) {
  try {
    const latestKey = `location_latest:${engagementId}`;
    const data = await cache.get(latestKey);
    
    if (!data) {
      return null;
    }
    
    const location = JSON.parse(data);
    
    // Calculate if location is stale (no update in last 60 seconds = potentially offline)
    const age = Date.now() - location.timestamp;
    const isStale = age > 60000;
    
    return {
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        bearing: location.bearing || null,
        speed: location.speed || null,
        timestamp: location.timestamp,
      },
      eta: null, // Will be populated by ETA service
      status: isStale ? 'offline_estimated' : 'active',
      is_estimated: false,
      last_update_age: age,
    };
  } catch (error) {
    console.error('Error getting location update:', error);
    return null;
  }
}

/**
 * Get location history for an engagement
 * @param {number} engagementId - Engagement identifier
 * @param {number} limit - Number of updates to retrieve
 * @returns {Promise<Array>} Array of location updates
 */
export async function getLocationHistory(engagementId, limit = 10) {
  try {
    const historyKey = `location_history:${engagementId}`;
    const history = await cache.lrange(historyKey, 0, limit - 1);
    
    return history.map(item => JSON.parse(item));
  } catch (error) {
    console.error('Error getting location history:', error);
    return [];
  }
}

/**
 * Clear location data for an engagement (privacy/data purging)
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<boolean>} Success status
 */
export async function clearLocationData(engagementId) {
  try {
    await cache.del(`location_latest:${engagementId}`);
    await cache.del(`location_history:${engagementId}`);
    
    console.log(`🗑️  Cleared location data for engagement ${engagementId}`);
    return true;
  } catch (error) {
    console.error('Error clearing location data:', error);
    return false;
  }
}

/**
 * Detect if provider is offline and estimate position
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<object|null>} Estimated position or null
 */
export async function checkProviderOffline(engagementId) {
  try {
    const latestKey = `location_latest:${engagementId}`;
    const data = await cache.get(latestKey);
    
    if (!data) {
      return null;
    }
    
    const location = JSON.parse(data);
    const age = Date.now() - location.timestamp;
    
    // Consider offline if no update for 60+ seconds
    if (age < 60000) {
      return null; // Still online
    }
    
    // Provider is offline - calculate estimated position
    const { estimatePosition } = await import('./positionEstimator.js');
    const estimated = estimatePosition(location, Math.floor(age / 1000));
    
    return {
      offline: true,
      last_update_at: location.timestamp,
      seconds_since_update: Math.floor(age / 1000),
      estimated_position: estimated,
    };
  } catch (error) {
    console.error('Error checking provider offline status:', error);
    return null;
  }
}

export default {
  processLocationUpdate,
  getLocationUpdate,
  getLocationHistory,
  clearLocationData,
  checkProviderOffline,
};
