import { cache } from '../redis/pubsubClient.js';
import config from '../config/index.js';
import axios from 'axios';

/**
 * Calculate ETA using Google Maps Directions API
 * @param {object} from - Origin location {lat, lng}
 * @param {object} to - Destination location {lat, lng}
 * @param {number} engagementId - Engagement identifier for caching
 * @returns {Promise<object|null>} ETA result
 */
export async function calculateETA(from, to, engagementId) {
  try {
    // Check cache first (TTL: 2 minutes)
    const cacheKey = `eta:${engagementId}`;
    const cached = await cache.get(cacheKey);
    
    if (cached) {
      const cachedETA = JSON.parse(cached);
      console.log(`📍 Using cached ETA for engagement ${engagementId}`);
      return cachedETA;
    }
    
    // Check if Google Maps API key is configured
    if (!config.googleMaps.apiKey) {
      console.warn('Google Maps API key not configured, using fallback calculation');
      return calculateStraightLineETA(from, to, engagementId);
    }
    
    // Call Google Maps Directions API
    const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params: {
        origin: `${from.lat},${from.lng}`,
        destination: `${to.lat},${to.lng}`,
        mode: 'driving',
        departure_time: 'now',
        traffic_model: 'best_guess',
        key: config.googleMaps.apiKey,
      },
      timeout: 5000,
    });
    
    if (response.data.status !== 'OK' || !response.data.routes || response.data.routes.length === 0) {
      console.error('Google Maps API error:', response.data.status);
      return calculateStraightLineETA(from, to, engagementId);
    }
    
    const route = response.data.routes[0];
    const leg = route.legs[0];
    
    // Calculate ETA range (±20% for uncertainty)
    const durationSeconds = leg.duration_in_traffic?.value || leg.duration.value;
    const minSeconds = Math.floor(durationSeconds * 0.8);
    const maxSeconds = Math.ceil(durationSeconds * 1.2);
    
    const etaResult = {
      engagement_id: engagementId,
      distance_meters: leg.distance.value,
      duration_seconds: durationSeconds,
      eta_range: {
        min_seconds: minSeconds,
        max_seconds: maxSeconds,
      },
      traffic_aware: !!leg.duration_in_traffic,
      calculated_at: Date.now(),
      confidence: calculateConfidence(leg),
      route_polyline: route.overview_polyline?.points || null,
    };
    
    // Cache for 2 minutes
    await cache.set(cacheKey, JSON.stringify(etaResult), config.eta.cacheTTL);
    
    console.log(`📍 Calculated ETA for engagement ${engagementId}: ${Math.round(durationSeconds / 60)}min`);
    
    return etaResult;
  } catch (error) {
    console.error('Error calculating ETA:', error.message);
    // Fallback to straight-line calculation
    return calculateStraightLineETA(from, to, engagementId);
  }
}

/**
 * Fallback ETA calculation using straight-line distance
 * @param {object} from - Origin location
 * @param {object} to - Destination location
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<object>} ETA result
 */
export async function calculateStraightLineETA(from, to, engagementId) {
  try {
    const distance = haversineDistance(from, to);
    const avgSpeed = 30 * 1000 / 3600; // 30 km/h in m/s (conservative urban estimate)
    const durationSeconds = Math.ceil(distance / avgSpeed);
    const minSeconds = Math.floor(durationSeconds * 0.7);
    const maxSeconds = Math.ceil(durationSeconds * 1.3);
    
    const etaResult = {
      engagement_id: engagementId,
      distance_meters: Math.round(distance),
      duration_seconds: durationSeconds,
      eta_range: {
        min_seconds: minSeconds,
        max_seconds: maxSeconds,
      },
      traffic_aware: false,
      calculated_at: Date.now(),
      confidence: 'low',
      route_polyline: null,
    };
    
    // Cache for 2 minutes
    const cacheKey = `eta:${engagementId}`;
    await cache.set(cacheKey, JSON.stringify(etaResult), config.eta.cacheTTL);
    
    return etaResult;
  } catch (error) {
    console.error('Error calculating straight-line ETA:', error);
    return null;
  }
}

/**
 * Calculate confidence level based on route leg data
 * @param {object} leg - Google Maps route leg
 * @returns {string} Confidence level: high, medium, low
 */
function calculateConfidence(leg) {
  if (leg.duration_in_traffic && leg.distance.value < 10000) {
    return 'high'; // Traffic data + short distance
  } else if (leg.duration_in_traffic) {
    return 'medium'; // Traffic data but longer distance
  } else {
    return 'low'; // No traffic data
  }
}

/**
 * Haversine formula for distance between two coordinates
 * @param {object} coord1 - First coordinate {lat, lng}
 * @param {object} coord2 - Second coordinate {lat, lng}
 * @returns {number} Distance in meters
 */
function haversineDistance(coord1, coord2) {
  const R = 6371000; // Earth's radius in meters
  const lat1 = coord1.lat * Math.PI / 180;
  const lat2 = coord2.lat * Math.PI / 180;
  const deltaLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const deltaLng = (coord2.lng - coord1.lng) * Math.PI / 180;
  
  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Get ETA for an engagement (from cache or calculate new)
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<object|null>} ETA data
 */
export async function getETA(engagementId) {
  try {
    // Try to get from cache
    const cacheKey = `eta:${engagementId}`;
    const cached = await cache.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    // If not in cache, we need current location and destination
    // This would require fetching from location service
    // For now, return null indicating ETA needs to be calculated
    return null;
  } catch (error) {
    console.error('Error getting ETA:', error);
    return null;
  }
}

/**
 * Update ETA locally (client-side countdown simulation)
 * @param {object} currentETA - Current ETA object
 * @param {number} elapsedSeconds - Seconds elapsed since calculation
 * @returns {object} Updated ETA
 */
export function updateETALocally(currentETA, elapsedSeconds) {
  const remainingSeconds = Math.max(0, currentETA.duration_seconds - elapsedSeconds);
  
  return {
    ...currentETA,
    duration_seconds: remainingSeconds,
    eta_range: {
      min_seconds: Math.max(0, currentETA.eta_range.min_seconds - elapsedSeconds),
      max_seconds: Math.max(0, currentETA.eta_range.max_seconds - elapsedSeconds),
    },
  };
}

/**
 * Format ETA for display
 * @param {number} seconds - ETA in seconds
 * @returns {string} Formatted ETA string
 */
export function formatETA(seconds) {
  if (seconds < 120) {
    return `${Math.ceil(seconds / 60)} min`;
  } else if (seconds < 3600) {
    const min = Math.ceil(seconds / 60);
    return `${min} min`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

export default {
  calculateETA,
  calculateStraightLineETA,
  getETA,
  updateETALocally,
  formatETA,
  haversineDistance,
};
