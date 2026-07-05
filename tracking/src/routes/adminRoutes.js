import express from 'express';
import asyncHandler from 'express-async-handler';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import {
  purgeCompletedSessions,
  purgeStaleLocationData,
  generatePrivacyReport,
  onServiceCompleted,
} from '../services/dataPurgeService.js';
import { getActiveConnectionsCount } from '../websocket/trackingServer.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/admin/tracking/privacy-report
 * Generate privacy compliance report
 */
router.get('/privacy-report', asyncHandler(async (req, res) => {
  const report = await generatePrivacyReport();
  
  res.json(report);
}));

/**
 * POST /api/admin/tracking/purge-completed
 * Manually trigger purge of completed sessions
 */
router.post('/purge-completed', asyncHandler(async (req, res) => {
  const { hours_old = 24 } = req.body;
  
  const result = await purgeCompletedSessions(hours_old);
  
  res.json({
    message: 'Purge completed',
    ...result,
  });
}));

/**
 * POST /api/admin/tracking/purge-stale
 * Manually trigger purge of stale location data
 */
router.post('/purge-stale', asyncHandler(async (req, res) => {
  const { hours_old = 2 } = req.body;
  
  const result = await purgeStaleLocationData(hours_old);
  
  res.json({
    message: 'Stale data purge completed',
    ...result,
  });
}));

/**
 * POST /api/admin/tracking/purge-engagement/:engagementId
 * Manually purge data for specific engagement
 */
router.post('/purge-engagement/:engagementId', asyncHandler(async (req, res) => {
  const { engagementId } = req.params;
  
  if (!engagementId || isNaN(engagementId)) {
    return res.status(400).json({
      error: 'Invalid engagement ID',
    });
  }
  
  const success = await onServiceCompleted(parseInt(engagementId));
  
  if (success) {
    res.json({
      message: 'Data purged successfully',
      engagement_id: parseInt(engagementId),
    });
  } else {
    res.status(500).json({
      error: 'Failed to purge data',
      engagement_id: parseInt(engagementId),
    });
  }
}));

/**
 * GET /api/admin/tracking/stats
 * Get tracking service statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const activeConnections = getActiveConnectionsCount();
  const privacyReport = await generatePrivacyReport();
  
  res.json({
    service: 'tracking',
    active_websocket_connections: activeConnections,
    ...privacyReport,
  });
}));

/**
 * GET /api/admin/tracking/health-detailed
 * Detailed health check with component status
 */
router.get('/health-detailed', asyncHandler(async (req, res) => {
  const { query } = await import('../database/connection.js');
  const { cache } = await import('../redis/pubsubClient.js');
  
  // Check database
  let dbStatus = 'unknown';
  try {
    await query('SELECT 1');
    dbStatus = 'healthy';
  } catch (error) {
    dbStatus = 'unhealthy';
  }
  
  // Check Redis
  let redisStatus = 'unknown';
  try {
    await cache.set('health_check', '1', 10);
    const value = await cache.get('health_check');
    redisStatus = value === '1' ? 'healthy' : 'unhealthy';
  } catch (error) {
    redisStatus = 'unhealthy';
  }
  
  const overallStatus = dbStatus === 'healthy' && redisStatus === 'healthy' ? 'healthy' : 'degraded';
  
  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    components: {
      database: dbStatus,
      redis: redisStatus,
      websocket: 'healthy', // If we can respond, WS server is up
    },
    active_connections: getActiveConnectionsCount(),
  });
}));

/**
 * GET /api/admin/tracking/config
 * Get service configuration (sanitized)
 */
router.get('/config', asyncHandler(async (req, res) => {
  const config = await import('../config/index.js');
  
  // Return sanitized config (no secrets)
  res.json({
    port: config.default.port,
    node_env: config.default.nodeEnv,
    database: {
      host: config.default.database.host,
      port: config.default.database.port,
      name: config.default.database.name,
      // Don't expose credentials
    },
    redis: {
      host: config.default.redis.host,
      port: config.default.redis.port,
      // Don't expose password
    },
    websocket: config.default.websocket,
    location: config.default.location,
    eta: config.default.eta,
    estimation: config.default.estimation,
    rateLimit: config.default.rateLimit,
    google_maps_configured: !!config.default.googleMaps.apiKey,
  });
}));

export default router;
