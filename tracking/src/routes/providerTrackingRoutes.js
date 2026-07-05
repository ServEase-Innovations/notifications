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
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/tracking/provider/start-journey
 * Provider starts journey to customer location (enables tracking)
 */
router.post('/start-journey', authenticateToken, asyncHandler(async (req, res) => {
  const { engagement_id, latitude, longitude } = req.body;
  const providerId = req.user.id;
  
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
 */
router.post('/arrived', authenticateToken, asyncHandler(async (req, res) => {
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
 */
router.get('/status/:engagementId', authenticateToken, asyncHandler(async (req, res) => {
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

export default router;
