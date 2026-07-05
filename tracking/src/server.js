import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import config from './config/index.js';
import trackingRoutes from './routes/trackingRoutes.js';
import { initializeWebSocketServer } from './websocket/trackingServer.js';
import { closeConnections as closeRedis } from './redis/pubsubClient.js';
import { closePool as closeDatabase } from './database/connection.js';
import { scheduleAutoPurge } from './services/dataPurgeService.js';
import {
  securityHeaders,
  validateRequest,
  sanitizeInput,
  ipRateLimit,
  requestId,
} from './middleware/securityHeaders.js';

// Create Express app
const app = express();

// Trust proxy (for IP address when behind load balancer)
app.set('trust proxy', 1);

// Security middleware (apply first)
app.use(requestId);
app.use(securityHeaders);
app.use(ipRateLimit);
app.use(validateRequest);
app.use(sanitizeInput);

// CORS
app.use(cors(config.cors));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/tracking', trackingRoutes);

// Import and use provider routes
import providerTrackingRoutes from './routes/providerTrackingRoutes.js';
app.use('/api/tracking/provider', providerTrackingRoutes);

// Import and use admin routes
import adminRoutes from './routes/adminRoutes.js';
app.use('/api/admin/tracking', adminRoutes);

// Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  
  // Basic Prometheus text format
  const metrics = [
    '# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds',
    '# TYPE process_cpu_user_seconds_total counter',
    `process_cpu_user_seconds_total ${process.cpuUsage().user / 1000000}`,
    '',
    '# HELP process_cpu_system_seconds_total Total system CPU time spent in seconds',
    '# TYPE process_cpu_system_seconds_total counter',
    `process_cpu_system_seconds_total ${process.cpuUsage().system / 1000000}`,
    '',
    '# HELP nodejs_heap_size_total_bytes Process heap size from Node.js in bytes',
    '# TYPE nodejs_heap_size_total_bytes gauge',
    `nodejs_heap_size_total_bytes ${memUsage.heapTotal}`,
    '',
    '# HELP nodejs_heap_size_used_bytes Process heap size used from Node.js in bytes',
    '# TYPE nodejs_heap_size_used_bytes gauge',
    `nodejs_heap_size_used_bytes ${memUsage.heapUsed}`,
    '',
    '# HELP nodejs_external_memory_bytes Node.js external memory size in bytes',
    '# TYPE nodejs_external_memory_bytes gauge',
    `nodejs_external_memory_bytes ${memUsage.external}`,
    '',
    '# HELP process_uptime_seconds Number of seconds the process has been running',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${uptime}`,
    '',
    '# HELP http_requests_total Total HTTP requests',
    '# TYPE http_requests_total counter',
    `http_requests_total{service="tracking",method="GET",status="200"} ${app.get('requestCount') || 0}`,
    '',
  ].join('\n');
  
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics);
});

// Request counter middleware (for metrics)
app.use((req, res, next) => {
  const count = app.get('requestCount') || 0;
  app.set('requestCount', count + 1);
  next();
});

// Root health check
app.get('/', (req, res) => {
  res.json({
    service: 'tracking',
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
});

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket server
const io = initializeWebSocketServer(httpServer);

// Attach io to app for access in routes if needed
app.set('io', io);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  // Stop auto-purge scheduler
  const purgeInterval = app.get('purgeInterval');
  if (purgeInterval) {
    clearInterval(purgeInterval);
    console.log('⏰ Auto-purge scheduler stopped');
  }
  
  // Close HTTP server
  httpServer.close(async () => {
    console.log('HTTP server closed');
    
    // Close WebSocket connections
    io.close(() => {
      console.log('WebSocket server closed');
    });
    
    // Close database connections
    await closeDatabase();
    
    // Close Redis connections
    await closeRedis();
    
    console.log('Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after 10 seconds');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
const PORT = config.port;
httpServer.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Tracking Service Started');
  console.log('='.repeat(60));
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`HTTP Server: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/api/tracking/health`);
  console.log('='.repeat(60));
  
  // Start automatic data purging (runs every hour)
  console.log('⏰ Starting automatic data purge scheduler...');
  const purgeInterval = scheduleAutoPurge(1); // Every 1 hour
  
  // Store interval for cleanup on shutdown
  app.set('purgeInterval', purgeInterval);
  
  console.log('✅ Security middleware enabled');
  console.log('✅ Auto-purge scheduler started');
  console.log('='.repeat(60));
});

export { app, httpServer, io };
