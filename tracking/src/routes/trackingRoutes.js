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
 */
router.post('/session/start', authenticateToken, rateLimitSession, asyncHandler(async (req, res) => {
  const { engagement_id, customer_id } = req.body;
  
  // Validate request
  if (!engagement_id || !customer_id) {
    return res.status(400).json({
      error: 'Missing required fields: engagement_id, customer_id',
    });
  }
  
  // Check if customer matches authenticated user
  if (req.user.id !== customer_id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'You can only track your own engagements',
    });
  }
  
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
 */
router.post('/session/stop', authenticateToken, asyncHandler(async (req, res) => {
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
  
  // Verify customer owns this session
  if (session.customer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'You can only stop your own tracking sessions',
    });
  }
  
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
 */
router.get('/location/:engagementId', authenticateToken, asyncHandler(async (req, res) => {
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
 * GET /api/tracking/eta/:engagementId
 * Get current ETA calculation
 */
router.get('/eta/:engagementId', authenticateToken, asyncHandler(async (req, res) => {
  const { engagementId } = req.params;
  
  if (!engagementId || isNaN(engagementId)) {
    return res.status(400).json({
      error: 'Invalid engagement ID',
    });
  }
  
  // Get ETA from cache or calculate new
  const eta = await getETA(parseInt(engagementId));
  
  if (!eta) {
    return res.status(404).json({
      error: 'ETA not available',
      message: 'Unable to calculate ETA at this time',
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
