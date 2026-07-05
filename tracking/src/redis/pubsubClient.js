import Redis from 'ioredis';
import config from '../config/index.js';

// Create separate Redis clients for pub and sub
const publisherClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  retryStrategy: config.redis.retryStrategy,
});

const subscriberClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  retryStrategy: config.redis.retryStrategy,
});

// General Redis client for cache operations
const cacheClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  retryStrategy: config.redis.retryStrategy,
});

// Connection event handlers
publisherClient.on('connect', () => {
  console.log('✅ Redis Publisher connected');
});

publisherClient.on('error', (err) => {
  console.error('❌ Redis Publisher error:', err);
});

subscriberClient.on('connect', () => {
  console.log('✅ Redis Subscriber connected');
});

subscriberClient.on('error', (err) => {
  console.error('❌ Redis Subscriber error:', err);
});

cacheClient.on('connect', () => {
  console.log('✅ Redis Cache client connected');
});

cacheClient.on('error', (err) => {
  console.error('❌ Redis Cache client error:', err);
});

/**
 * Channel naming conventions
 */
const CHANNELS = {
  LOCATION_UPDATE: (engagementId) => `tracking:location:${engagementId}`,
  STATUS_CHANGE: (engagementId) => `tracking:status:${engagementId}`,
  CONNECTION_LOST: (engagementId) => `tracking:connection_lost:${engagementId}`,
};

/**
 * Publish location update to a specific engagement channel
 * @param {number} engagementId - Engagement identifier
 * @param {object} locationData - Location update data
 * @returns {Promise<number>} Number of subscribers that received the message
 */
export async function publishLocationUpdate(engagementId, locationData) {
  try {
    const channel = CHANNELS.LOCATION_UPDATE(engagementId);
    const message = JSON.stringify({
      type: 'location_update',
      engagement_id: engagementId,
      data: locationData,
      timestamp: Date.now(),
    });
    
    const result = await publisherClient.publish(channel, message);
    return result;
  } catch (error) {
    console.error(`Failed to publish location update for engagement ${engagementId}:`, error);
    throw error;
  }
}

/**
 * Publish status change event
 * @param {number} engagementId - Engagement identifier
 * @param {object} statusData - Status change data
 * @returns {Promise<number>} Number of subscribers that received the message
 */
export async function publishStatusChange(engagementId, statusData) {
  try {
    const channel = CHANNELS.STATUS_CHANGE(engagementId);
    const message = JSON.stringify({
      type: 'status_change',
      engagement_id: engagementId,
      data: statusData,
      timestamp: Date.now(),
    });
    
    const result = await publisherClient.publish(channel, message);
    return result;
  } catch (error) {
    console.error(`Failed to publish status change for engagement ${engagementId}:`, error);
    throw error;
  }
}

/**
 * Publish connection lost event
 * @param {number} engagementId - Engagement identifier
 * @param {object} estimatedPosition - Estimated position data
 * @returns {Promise<number>} Number of subscribers that received the message
 */
export async function publishConnectionLost(engagementId, estimatedPosition) {
  try {
    const channel = CHANNELS.CONNECTION_LOST(engagementId);
    const message = JSON.stringify({
      type: 'connection_lost',
      engagement_id: engagementId,
      data: estimatedPosition,
      timestamp: Date.now(),
    });
    
    const result = await publisherClient.publish(channel, message);
    return result;
  } catch (error) {
    console.error(`Failed to publish connection lost for engagement ${engagementId}:`, error);
    throw error;
  }
}

/**
 * Subscribe to engagement location updates
 * @param {number} engagementId - Engagement identifier
 * @param {function} callback - Callback function to handle messages
 * @returns {Promise<void>}
 */
export async function subscribeToEngagement(engagementId, callback) {
  try {
    const locationChannel = CHANNELS.LOCATION_UPDATE(engagementId);
    const statusChannel = CHANNELS.STATUS_CHANGE(engagementId);
    const connectionChannel = CHANNELS.CONNECTION_LOST(engagementId);
    
    await subscriberClient.subscribe(
      locationChannel,
      statusChannel,
      connectionChannel,
      (err, count) => {
        if (err) {
          console.error(`Failed to subscribe to engagement ${engagementId}:`, err);
          return;
        }
        console.log(`✅ Subscribed to ${count} channel(s) for engagement ${engagementId}`);
      }
    );
    
    subscriberClient.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        if (data.engagement_id === engagementId) {
          callback(data);
        }
      } catch (error) {
        console.error('Failed to parse subscription message:', error);
      }
    });
  } catch (error) {
    console.error(`Failed to set up subscription for engagement ${engagementId}:`, error);
    throw error;
  }
}

/**
 * Unsubscribe from engagement channels
 * @param {number} engagementId - Engagement identifier
 * @returns {Promise<void>}
 */
export async function unsubscribeFromEngagement(engagementId) {
  try {
    const locationChannel = CHANNELS.LOCATION_UPDATE(engagementId);
    const statusChannel = CHANNELS.STATUS_CHANGE(engagementId);
    const connectionChannel = CHANNELS.CONNECTION_LOST(engagementId);
    
    await subscriberClient.unsubscribe(locationChannel, statusChannel, connectionChannel);
    console.log(`✅ Unsubscribed from engagement ${engagementId}`);
  } catch (error) {
    console.error(`Failed to unsubscribe from engagement ${engagementId}:`, error);
    throw error;
  }
}

/**
 * Cache operations
 */
export const cache = {
  /**
   * Get value from cache
   */
  async get(key) {
    try {
      return await cacheClient.get(key);
    } catch (error) {
      console.error(`Failed to get cache key ${key}:`, error);
      return null;
    }
  },
  
  /**
   * Set value in cache with optional TTL
   */
  async set(key, value, ttl = null) {
    try {
      if (ttl) {
        await cacheClient.setex(key, ttl, value);
      } else {
        await cacheClient.set(key, value);
      }
      return true;
    } catch (error) {
      console.error(`Failed to set cache key ${key}:`, error);
      return false;
    }
  },
  
  /**
   * Delete key from cache
   */
  async del(key) {
    try {
      await cacheClient.del(key);
      return true;
    } catch (error) {
      console.error(`Failed to delete cache key ${key}:`, error);
      return false;
    }
  },
  
  /**
   * Add item to list (left push)
   */
  async lpush(key, value) {
    try {
      await cacheClient.lpush(key, value);
      return true;
    } catch (error) {
      console.error(`Failed to lpush to key ${key}:`, error);
      return false;
    }
  },
  
  /**
   * Trim list to specified size
   */
  async ltrim(key, start, stop) {
    try {
      await cacheClient.ltrim(key, start, stop);
      return true;
    } catch (error) {
      console.error(`Failed to ltrim key ${key}:`, error);
      return false;
    }
  },
  
  /**
   * Get list range
   */
  async lrange(key, start, stop) {
    try {
      return await cacheClient.lrange(key, start, stop);
    } catch (error) {
      console.error(`Failed to lrange key ${key}:`, error);
      return [];
    }
  },
  
  /**
   * Set expiry on key
   */
  async expire(key, seconds) {
    try {
      await cacheClient.expire(key, seconds);
      return true;
    } catch (error) {
      console.error(`Failed to set expiry on key ${key}:`, error);
      return false;
    }
  },
};

/**
 * Graceful shutdown
 */
export async function closeConnections() {
  try {
    await publisherClient.quit();
    await subscriberClient.quit();
    await cacheClient.quit();
    console.log('✅ Redis connections closed');
  } catch (error) {
    console.error('❌ Error closing Redis connections:', error);
  }
}

export default {
  publishLocationUpdate,
  publishStatusChange,
  publishConnectionLost,
  subscribeToEngagement,
  unsubscribeFromEngagement,
  cache,
  closeConnections,
};
