import express from 'express';
import asyncHandler from 'express-async-handler';
import { checkAvailability } from '../services/trackingAvailabilityService.js';
import { 
  createTrackingSession, 
  stopTrackingSession,
  getSessionById 
} from '../services/sessionService.js';
import { getLocationUpdate } from '../services/locationProcessor.js';
import { getETA } from '../services/etaCalculator.js';
import { authenticateToken } from '../middleware/auth.js';
import { rateLimitSession } from '../middleware/rateLimit.js';
import { query } from '../database/connection.js';

const router = express.Router();

/**
 * GET /api/tracking/availability/:engagementId
 * Check if tracking is available for an engagement
 * Public endpoint - no authentication required
 */
router.get('/availability/:engagementId', asyncHandler(async (req, res) => {
  const { engagementId } = req.params;
  
  if (!engagementId || isNaN(engagementId)) {
    return res.status(400).json({
      error: 'Invalid engagement ID',
    });
  }
  
  const availability = await checkAvailability(parseInt(engagementId));
  
  res.json(availability);
}));

/**
 * POST /api/tracking/session/start
 * Start a tracking session for a customer
 * NOTE: Authentication temporarily disabled for testing
 */
router.post('/session/start', rateLimitSession, asyncHandler(async (req, res) => {
  const { engagement_id, customer_id } = req.body;
  
  // Validate request
  if (!engagement_id || !customer_id) {
    return res.status(400).json({
      error: 'Missing required fields: engagement_id, customer_id',
    });
  }
  
  // Check if customer matches authenticated user (skipped during testing)
  // if (req.user.id !== customer_id && req.user.role !== 'admin') {
  //   return res.status(403).json({
  //     error: 'You can only track your own engagements',
  //   });
  // }
  
  // Check availability first
  const availability = await checkAvailability(engagement_id);
  
  if (!availability.available) {
    return res.status(400).json({
      error: 'Tracking not available',
      reason: availability.reason,
      provider_status: availability.provider_status,
    });
  }
  
  // Create tracking session
  const session = await createTrackingSession({
    engagement_id,
    customer_id,
    provider_id: availability.engagement_details.provider_id,
    destination: availability.engagement_details.service_address,
    is_team: availability.is_team,
    team_data: availability.team_data,
  });
  
  // Return session details
  res.status(201).json({
    session_id: session.session_id,
    websocket_url: `ws://${req.get('host')}`,
    polling_url: `/api/tracking/location/${engagement_id}`,
    session_token: session.session_token,
    is_team: session.is_team,
    team_data: session.team_data,
  });
}));

/**
 * POST /api/tracking/session/stop
 * Stop a tracking session
 * NOTE: Authentication temporarily disabled for testing
 */
router.post('/session/stop', asyncHandler(async (req, res) => {
  const { session_id } = req.body;
  
  if (!session_id) {
    return res.status(400).json({
      error: 'Missing required field: session_id',
    });
  }
  
  // Get session to verify ownership
  const session = await getSessionById(session_id);
  
  if (!session) {
    return res.status(404).json({
      error: 'Session not found',
    });
  }
  
  // Verify customer owns this session (skipped during testing)
  // if (session.customer_id !== req.user.id && req.user.role !== 'admin') {
  //   return res.status(403).json({
  //     error: 'You can only stop your own tracking sessions',
  //   });
  // }
  
  // Stop the session
  const stopped = await stopTrackingSession(session_id);
  
  if (!stopped) {
    return res.status(500).json({
      error: 'Failed to stop tracking session',
    });
  }
  
  res.json({
    message: 'Tracking session stopped successfully',
    session_id,
  });
}));

/**
 * GET /api/tracking/location/:engagementId
 * Polling endpoint for location updates (WebSocket fallback)
 * NOTE: Authentication temporarily disabled for testing
 */
router.get('/location/:engagementId', asyncHandler(async (req, res) => {
  const { engagementId } = req.params;
  
  if (!engagementId || isNaN(engagementId)) {
    return res.status(400).json({
      error: 'Invalid engagement ID',
    });
  }
  
  // Get latest location update from cache
  const locationData = await getLocationUpdate(parseInt(engagementId));
  
  if (!locationData) {
    return res.status(404).json({
      error: 'No location data available',
      message: 'Provider has not started sharing location yet',
    });
  }
  
  res.json(locationData);
}));

/**
 * POST /api/tracking/calculate-eta
 * Calculate ETA for an engagement (traffic-aware route)
 * NOTE: Authentication temporarily disabled for testing
 */
router.post('/calculate-eta', asyncHandler(async (req, res) => {
  const { engagement_id } = req.body;
  
  if (!engagement_id) {
    return res.status(400).json({
      error: 'Missing required field: engagement_id',
    });
  }
  
  try {
    // Get provider's current location from Redis
    const locationData = await getLocationUpdate(engagement_id);
    
    if (!locationData || !locationData.location) {
      return res.status(404).json({
        error: 'Provider location not available',
        message: 'Provider must share location before ETA can be calculated',
      });
    }
    
    // Get destination from engagements table
    const engagementResult = await query(
      `SELECT 
        engagement_id,
        address as service_address,
        latitude,
        longitude,
        customerid as customer_id
      FROM engagements 
      WHERE engagement_id = $1`,
      [engagement_id]
    );
    
    if (engagementResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Engagement not found',
      });
    }
    
    const engagement = engagementResult.rows[0];
    
    // Use latitude and longitude from engagement table
    if (!engagement.latitude || !engagement.longitude) {
      return res.status(400).json({
        error: 'Destination coordinates not available',
        message: 'Engagement must have latitude and longitude set for ETA calculation',
        engagement_id: engagement_id,
        hint: 'Please update the engagement with booking location coordinates',
      });
    }
    
    const destinationCoords = {
      lat: parseFloat(engagement.latitude),
      lng: parseFloat(engagement.longitude),
    };
    
    // Calculate ETA using Google Maps Directions API
    const { calculateETA } = await import('../services/etaCalculator.js');
    
    const providerCoords = {
      lat: locationData.location.latitude,
      lng: locationData.location.longitude,
    };
    
    const etaResult = await calculateETA(providerCoords, destinationCoords, engagement_id);
    
    if (!etaResult) {
      return res.status(500).json({
        error: 'Failed to calculate ETA',
        message: 'Unable to calculate route at this time',
      });
    }
    
    res.json(etaResult);
  } catch (error) {
    console.error('Error calculating ETA:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}));

/**
 * GET /api/tracking/eta/:engagementId
 * Get current ETA calculation from cache
 * NOTE: Authentication temporarily disabled for testing
 */
router.get('/eta/:engagementId', asyncHandler(async (req, res) => {
  const { engagementId } = req.params;
  
  if (!engagementId || isNaN(engagementId)) {
    return res.status(400).json({
      error: 'Invalid engagement ID',
    });
  }
  
  // Get ETA from cache
  const eta = await getETA(parseInt(engagementId));
  
  if (!eta) {
    return res.status(404).json({
      error: 'ETA not available',
      message: 'ETA has not been calculated yet. Use POST /calculate-eta first.',
    });
  }
  
  res.json(eta);
}));

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tracking',
    timestamp: new Date().toISOString(),
  });
});

export default router;
