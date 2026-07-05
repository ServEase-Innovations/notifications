import jwt from 'jsonwebtoken';
import config from '../config/index.js';

/**
 * Authenticate JWT token from request
 * Supports both Bearer token in header and query parameter
 */
export function authenticateToken(req, res, next) {
  // Try to get token from Authorization header
  let token = req.headers.authorization?.replace('Bearer ', '');
  
  // Fallback to query parameter (useful for WebSocket connections)
  if (!token) {
    token = req.query.token;
  }
  
  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid token',
    });
  }
  
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Attach user info to request
    req.user = {
      id: decoded.userId || decoded.id || decoded.customer_id,
      role: decoded.role || 'customer',
      ...decoded,
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please log in again',
      });
    }
    
    return res.status(403).json({
      error: 'Invalid token',
      message: 'Please provide a valid authentication token',
    });
  }
}

/**
 * Verify session token for WebSocket connections
 */
export function verifySessionToken(token) {
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    return {
      valid: true,
      data: decoded,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
    };
  }
}

/**
 * Optional authentication - continues even if no token
 * Useful for endpoints that work both authenticated and unauthenticated
 */
export function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  
  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      req.user = {
        id: decoded.userId || decoded.id || decoded.customer_id,
        role: decoded.role || 'customer',
        ...decoded,
      };
    } catch (error) {
      // Continue without user if token is invalid
      req.user = null;
    }
  } else {
    req.user = null;
  }
  
  next();
}

/**
 * Require admin role
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
    });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
    });
  }
  
  next();
}

export default {
  authenticateToken,
  verifySessionToken,
  optionalAuth,
  requireAdmin,
};
