import { cache } from '../redis/pubsubClient.js';
import config from '../config/index.js';

/**
 * Rate limiter for session creation
 * Limits: 5 requests per minute per customer
 */
export async function rateLimitSession(req, res, next) {
  const customerId = req.body.customer_id || req.user?.id;
  
  if (!customerId) {
    return next();
  }
  
  const key = `ratelimit:session:${customerId}`;
  const windowMs = config.rateLimit.windowMs;
  const maxRequests = config.rateLimit.maxRequests;
  
  try {
    // Get current count
    const current = await cache.get(key);
    const count = current ? parseInt(current) : 0;
    
    if (count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Please wait a moment before trying again',
        retry_after: Math.ceil(windowMs / 1000),
      });
    }
    
    // Increment count
    if (count === 0) {
      await cache.set(key, '1', Math.ceil(windowMs / 1000));
    } else {
      await cache.set(key, String(count + 1), Math.ceil(windowMs / 1000));
    }
    
    next();
  } catch (error) {
    console.error('Rate limit error:', error);
    // Don't block request if rate limiting fails
    next();
  }
}

/**
 * Rate limiter for location updates from providers
 * Limits: 1 update per 15 seconds per provider
 */
export async function rateLimitLocationUpdate(providerId) {
  const key = `ratelimit:location:${providerId}`;
  const limitMs = config.rateLimit.locationUpdateLimit;
  
  try {
    const lastUpdate = await cache.get(key);
    
    if (lastUpdate) {
      const timeSinceLastUpdate = Date.now() - parseInt(lastUpdate);
      
      if (timeSinceLastUpdate < limitMs) {
        return {
          allowed: false,
          retry_after: Math.ceil((limitMs - timeSinceLastUpdate) / 1000),
        };
      }
    }
    
    // Update timestamp
    await cache.set(key, String(Date.now()), Math.ceil(limitMs / 1000));
    
    return {
      allowed: true,
    };
  } catch (error) {
    console.error('Location rate limit error:', error);
    // Allow update if rate limiting fails
    return {
      allowed: true,
    };
  }
}

/**
 * General rate limiter middleware
 */
export function createRateLimiter(options = {}) {
  const {
    windowMs = 60000,
    maxRequests = 10,
    keyGenerator = (req) => req.ip,
    message = 'Too many requests, please try again later',
  } = options;
  
  return async (req, res, next) => {
    const key = `ratelimit:general:${keyGenerator(req)}`;
    
    try {
      const current = await cache.get(key);
      const count = current ? parseInt(current) : 0;
      
      if (count >= maxRequests) {
        return res.status(429).json({
          error: 'Too many requests',
          message,
          retry_after: Math.ceil(windowMs / 1000),
        });
      }
      
      if (count === 0) {
        await cache.set(key, '1', Math.ceil(windowMs / 1000));
      } else {
        await cache.set(key, String(count + 1), Math.ceil(windowMs / 1000));
      }
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - count - 1);
      res.setHeader('X-RateLimit-Reset', Date.now() + windowMs);
      
      next();
    } catch (error) {
      console.error('Rate limit error:', error);
      next();
    }
  };
}

export default {
  rateLimitSession,
  rateLimitLocationUpdate,
  createRateLimiter,
};
