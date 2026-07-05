import express from 'express';
import asyncHandler from 'express-async-handler';
import {
  startJourney,
  markArrived,
  markServiceStarted,
  markServiceCompleted,
  getTrackingStatus,
  TRACKING_STATUS,
} from '../services/engagementTrackingStatusService.js';
import { processLocationUpdate } from '../services/locationProcessor.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/tracking/provider/start-journey
 * Provider starts journey to customer location (enables tracking)
 * NOTE: Authentication temporarily disabled for testing
 */
router.post('/start-journey', asyncHandler(async (req, res) => {
  const { engagement_id, latitude, longitude, provider_id } = req.body;
  
  // For testing: accept provider_id from body or use mock
  const providerId = provider_id || req.user?.id || 1;
  
  if (!engagement_id) {
    return res.status(400).json({
      error: 'Missing required field: engagement_id',
    });
  }
  
  // Optional location data
  const location = {};
  if (latitude !== undefined && longitude !== undefined) {
    location.latitude = parseFloat(latitude);
    location.longitude = parseFloat(longitude);
  }
  
  try {
    const status = await startJourney(engagement_id, providerId, location);
    
    res.json({
      message: 'Journey started - tracking enabled',
      engagement_id,
      tracking_status: status.tracking_status,
      journey_started_at: status.journey_started_at,
    });
  } catch (error) {
    console.error('Error starting journey:', error);
    res.status(500).json({
      error: 'Failed to start journey',
      message: error.message,
    });
  }
}));

/**
 * POST /api/tracking/provider/arrived
 * Provider has arrived at customer location
 * NOTE: Authentication temporarily disabled for testing
 */
router.post('/arrived', asyncHandler(async (req, res) => {
  const { engagement_id, latitude, longitude } = req.body;
  
  if (!engagement_id) {
    return res.status(400).json({
      error: 'Missing required field: engagement_id',
    });
  }
  
  // Optional location data
  const location = {};
  if (latitude !== undefined && longitude !== undefined) {
    location.latitude = parseFloat(latitude);
    location.longitude = parseFloat(longitude);
  }
  
  try {
    const status = await markArrived(engagement_id, location);
    
    res.json({
      message: 'Arrival confirmed',
      engagement_id,
      tracking_status: status.tracking_status,
      arrived_at: status.arrived_at,
    });
  } catch (error) {
    console.error('Error marking arrived:', error);
    res.status(500).json({
      error: 'Failed to mark arrival',
      message: error.message,
    });
  }
}));

/**
 * POST /api/tracking/provider/start-service
 * Provider has started the service work
 */
router.post('/start-service', authenticateToken, asyncHandler(async (req, res) => {
  const { engagement_id } = req.body;
  
  if (!engagement_id) {
    return res.status(400).json({
      error: 'Missing required field: engagement_id',
    });
  }
  
  try {
    const status = await markServiceStarted(engagement_id);
    
    res.json({
      message: 'Service started',
      engagement_id,
      tracking_status: status.tracking_status,
      service_started_at: status.service_started_at,
    });
  } catch (error) {
    console.error('Error marking service started:', error);
    res.status(500).json({
      error: 'Failed to mark service started',
      message: error.message,
    });
  }
}));

/**
 * POST /api/tracking/provider/complete-service
 * Provider has completed the service
 */
router.post('/complete-service', authenticateToken, asyncHandler(async (req, res) => {
  const { engagement_id } = req.body;
  
  if (!engagement_id) {
    return res.status(400).json({
      error: 'Missing required field: engagement_id',
    });
  }
  
  try {
    const status = await markServiceCompleted(engagement_id);
    
    res.json({
      message: 'Service completed',
      engagement_id,
      tracking_status: status.tracking_status,
      service_completed_at: status.service_completed_at,
    });
  } catch (error) {
    console.error('Error marking service completed:', error);
    res.status(500).json({
      error: 'Failed to mark service completed',
      message: error.message,
    });
  }
}));

/**
 * GET /api/tracking/provider/status/:engagementId
 * Get current tracking status for an engagement
 * NOTE: Authentication temporarily disabled for testing
 */
router.get('/status/:engagementId', asyncHandler(async (req, res) => {
  const { engagementId } = req.params;
  
  if (!engagementId || isNaN(engagementId)) {
    return res.status(400).json({
      error: 'Invalid engagement ID',
    });
  }
  
  try {
    const status = await getTrackingStatus(parseInt(engagementId));
    
    if (!status) {
      return res.json({
        engagement_id: parseInt(engagementId),
        tracking_status: TRACKING_STATUS.NOT_STARTED,
        message: 'No tracking status found - journey not started',
      });
    }
    
    res.json(status);
  } catch (error) {
    console.error('Error getting tracking status:', error);
    res.status(500).json({
      error: 'Failed to get tracking status',
      message: error.message,
    });
  }
}));

/**
 * POST /api/tracking/provider/location
 * Provider publishes their current location during journey
 * NOTE: Authentication temporarily disabled for testing
 */
router.post('/location', asyncHandler(async (req, res) => {
  const { engagement_id, provider_id, latitude, longitude, accuracy, speed, bearing } = req.body;
  
  // For testing: accept provider_id from body or use mock
  const providerId = provider_id || req.user?.id || 1;
  
  if (!engagement_id) {
    return res.status(400).json({
      error: 'Missing required field: engagement_id',
    });
  }
  
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      error: 'Missing required fields: latitude, longitude',
    });
  }
  
  // Check if provider is en_route for this engagement
  const status = await getTrackingStatus(engagement_id);
  if (!status || status.tracking_status !== TRACKING_STATUS.EN_ROUTE) {
    return res.status(400).json({
      error: 'Cannot publish location',
      message: 'Journey not started or already completed',
      current_status: status?.tracking_status || 'not_started',
    });
  }
  
  // Process and publish location update
  const locationUpdate = {
    provider_id: providerId,
    engagement_id: parseInt(engagement_id),
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    accuracy: accuracy !== undefined ? parseFloat(accuracy) : 10,
    speed: speed !== undefined ? parseFloat(speed) : null,
    bearing: bearing !== undefined ? parseFloat(bearing) : null,
    timestamp: Date.now(),
  };
  
  const result = await processLocationUpdate(locationUpdate);
  
  if (!result.success) {
    return res.status(400).json({
      error: 'Failed to process location update',
      message: result.error,
    });
  }
  
  res.json({
    message: 'Location updated successfully',
    timestamp: result.timestamp,
  });
}));

export default router;
