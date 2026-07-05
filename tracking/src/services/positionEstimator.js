import config from '../config/index.js';

/**
 * Estimate provider position when offline based on last known data
 * Uses linear projection along last known bearing and speed
 * 
 * @param {object} lastLocation - Last known location update
 * @param {number} elapsedSeconds - Seconds since last update
 * @returns {object} Estimated position with confidence
 */
export function estimatePosition(lastLocation, elapsedSeconds) {
  const MAX_ESTIMATION_TIME = config.estimation.maxTime; // 600 seconds = 10 minutes
  
  // If too much time has passed, just return last known location
  if (elapsedSeconds > MAX_ESTIMATION_TIME) {
    return {
      latitude: lastLocation.latitude,
      longitude: lastLocation.longitude,
      estimated: true,
      confidence: 0,
      based_on_update_at: lastLocation.timestamp,
      seconds_since_update: elapsedSeconds,
      estimation_method: 'last_known',
    };
  }
  
  // If no speed or bearing data, return last known location
  if (!lastLocation.speed || lastLocation.speed === 0 || lastLocation.bearing === undefined) {
    return {
      latitude: lastLocation.latitude,
      longitude: lastLocation.longitude,
      estimated: true,
      confidence: Math.max(0, 1 - (elapsedSeconds / MAX_ESTIMATION_TIME)),
      based_on_update_at: lastLocation.timestamp,
      seconds_since_update: elapsedSeconds,
      estimation_method: 'last_known',
    };
  }
  
  // Calculate distance traveled based on speed and time
  const distanceMeters = lastLocation.speed * elapsedSeconds;
  
  // Convert bearing to radians (0 degrees = North)
  const bearingRad = (lastLocation.bearing * Math.PI) / 180;
  
  // Earth's radius in meters
  const EARTH_RADIUS = 6371000;
  
  // Convert current position to radians
  const lat1 = (lastLocation.latitude * Math.PI) / 180;
  const lon1 = (lastLocation.longitude * Math.PI) / 180;
  
  // Calculate new position using haversine formula
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / EARTH_RADIUS) +
    Math.cos(lat1) * Math.sin(distanceMeters / EARTH_RADIUS) * Math.cos(bearingRad)
  );
  
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(distanceMeters / EARTH_RADIUS) * Math.cos(lat1),
    Math.cos(distanceMeters / EARTH_RADIUS) - Math.sin(lat1) * Math.sin(lat2)
  );
  
  // Confidence decreases over time
  const confidence = Math.max(0, 1 - (elapsedSeconds / MAX_ESTIMATION_TIME));
  
  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (lon2 * 180) / Math.PI,
    estimated: true,
    confidence: parseFloat(confidence.toFixed(2)),
    based_on_update_at: lastLocation.timestamp,
    seconds_since_update: elapsedSeconds,
    estimation_method: 'linear_projection',
    estimated_distance_traveled: Math.round(distanceMeters),
  };
}

/**
 * Calculate confidence level category
 * @param {number} confidence - Confidence value (0-1)
 * @returns {string} Confidence category
 */
export function getConfidenceCategory(confidence) {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

/**
 * Get user-friendly message about estimated position
 * @param {number} secondsSinceUpdate - Seconds since last real update
 * @param {number} confidence - Confidence value
 * @returns {string} User message
 */
export function getEstimationMessage(secondsSinceUpdate, confidence) {
  const minutes = Math.floor(secondsSinceUpdate / 60);
  
  if (confidence >= 0.8) {
    return `Last updated ${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (confidence >= 0.5) {
    return `Approximate location - last updated ${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else {
    return `Connection lost - showing last known location from ${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Check if estimation should be shown or just last known location
 * @param {number} elapsedSeconds - Seconds since last update
 * @returns {boolean} Whether to show estimation
 */
export function shouldShowEstimation(elapsedSeconds) {
  return elapsedSeconds <= config.estimation.maxTime;
}

/**
 * Calculate estimated arrival based on current estimation
 * This is very rough and should be used with caution
 * @param {object} estimatedPosition - Estimated position data
 * @param {object} destination - Destination coordinates
 * @param {number} avgSpeed - Average speed in m/s
 * @returns {object} Estimated arrival data
 */
export function estimateArrival(estimatedPosition, destination, avgSpeed = 8.33) {
  if (!avgSpeed || avgSpeed === 0) {
    avgSpeed = 8.33; // Default: 30 km/h = 8.33 m/s
  }
  
  // Calculate straight-line distance to destination
  const R = 6371000; // Earth radius in meters
  const lat1 = estimatedPosition.latitude * Math.PI / 180;
  const lat2 = destination.lat * Math.PI / 180;
  const deltaLat = (destination.lat - estimatedPosition.latitude) * Math.PI / 180;
  const deltaLon = (destination.lng - estimatedPosition.longitude) * Math.PI / 180;
  
  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  // Estimate time to arrival
  const estimatedSeconds = Math.ceil(distance / avgSpeed);
  
  return {
    distance_meters: Math.round(distance),
    estimated_seconds: estimatedSeconds,
    confidence: estimatedPosition.confidence * 0.7, // Lower confidence for arrival
    warning: 'This is a rough estimate based on straight-line distance',
  };
}

export default {
  estimatePosition,
  getConfidenceCategory,
  getEstimationMessage,
  shouldShowEstimation,
  estimateArrival,
};
