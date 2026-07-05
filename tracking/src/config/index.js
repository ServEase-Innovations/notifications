import dotenv from 'dotenv';

dotenv.config();

const config = {
  // Server
  port: process.env.PORT || 5007,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'serveaso',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
  
  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  },
  
  // Google Maps
  googleMaps: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY,
  },
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  
  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  
  // WebSocket
  websocket: {
    pingInterval: parseInt(process.env.WS_PING_INTERVAL) || 30000,
    maxReconnectAttempts: parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS) || 5,
  },
  
  // Location
  location: {
    updateInterval: parseInt(process.env.LOCATION_UPDATE_INTERVAL) || 30000,
    historySize: parseInt(process.env.LOCATION_HISTORY_SIZE) || 10,
    cacheTTL: parseInt(process.env.LOCATION_CACHE_TTL) || 3600,
  },
  
  // ETA
  eta: {
    cacheTTL: parseInt(process.env.ETA_CACHE_TTL) || 120,
    calculationInterval: parseInt(process.env.ETA_CALCULATION_INTERVAL) || 120000,
  },
  
  // Position Estimation
  estimation: {
    maxTime: parseInt(process.env.MAX_ESTIMATION_TIME) || 600, // 10 minutes
    confidenceDecay: parseFloat(process.env.ESTIMATION_CONFIDENCE_DECAY) || 0.1,
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 5,
    locationUpdateLimit: parseInt(process.env.LOCATION_UPDATE_RATE_LIMIT) || 15000,
  },
  
  // Monitoring
  metrics: {
    port: parseInt(process.env.METRICS_PORT) || 9090,
  },
};

export default config;
