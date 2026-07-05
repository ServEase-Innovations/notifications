import { Server } from 'socket.io';
import { verifySessionToken } from '../middleware/auth.js';
import { subscribeToEngagement, unsubscribeFromEngagement } from '../redis/pubsubClient.js';
import { getSessionById } from '../services/sessionService.js';
import config from '../config/index.js';

// Store active connections
const activeConnections = new Map();

/**
 * Initialize Socket.io server
 * @param {object} httpServer - HTTP server instance
 * @returns {object} Socket.io server
 */
export function initializeWebSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: config.cors,
    pingInterval: config.websocket.pingInterval,
    pingTimeout: 5000,
    transports: ['websocket', 'polling'],
  });
  
  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }
    
    const verification = verifySessionToken(token);
    
    if (!verification.valid) {
      return next(new Error(verification.error));
    }
    
    // Attach user data to socket
    socket.userId = verification.data.customer_id || verification.data.id;
    socket.sessionData = verification.data;
    
    next();
  });
  
  // Connection handler
  io.on('connection', (socket) => {
    console.log(`✅ WebSocket client connected: ${socket.id} (User: ${socket.userId})`);
    
    // Store connection
    if (!activeConnections.has(socket.userId)) {
      activeConnections.set(socket.userId, new Set());
    }
    activeConnections.get(socket.userId).add(socket.id);
    
    // Handle subscribe to engagement
    socket.on('subscribe', async (data) => {
      try {
        const { engagement_id } = data;
        
        if (!engagement_id) {
          socket.emit('error', {
            code: 'INVALID_REQUEST',
            message: 'Missing engagement_id',
          });
          return;
        }
        
        // Verify user has access to this engagement
        const session = await getSessionById(socket.sessionData.session_id);
        
        if (!session || session.engagement_id !== engagement_id) {
          socket.emit('error', {
            code: 'UNAUTHORIZED',
            message: 'You do not have access to this engagement',
          });
          return;
        }
        
        // Join Socket.io room for this engagement
        socket.join(`engagement:${engagement_id}`);
        socket.currentEngagement = engagement_id;
        
        console.log(`📍 Client ${socket.id} subscribed to engagement ${engagement_id}`);
        
        // Acknowledge subscription
        socket.emit('subscribed', {
          engagement_id,
          timestamp: Date.now(),
        });
        
        // Set up Redis subscription for this engagement (if not already)
        if (!socket.redisSubscribed) {
          subscribeToEngagement(engagement_id, (message) => {
            // Broadcast to all clients in this engagement room
            io.to(`engagement:${engagement_id}`).emit(message.type, message.data);
          });
          socket.redisSubscribed = true;
        }
      } catch (error) {
        console.error('Subscribe error:', error);
        socket.emit('error', {
          code: 'SUBSCRIBE_FAILED',
          message: 'Failed to subscribe to engagement',
        });
      }
    });
    
    // Handle unsubscribe
    socket.on('unsubscribe', async (data) => {
      try {
        const { engagement_id } = data;
        
        if (socket.currentEngagement === engagement_id) {
          socket.leave(`engagement:${engagement_id}`);
          socket.currentEngagement = null;
          
          console.log(`📍 Client ${socket.id} unsubscribed from engagement ${engagement_id}`);
          
          socket.emit('unsubscribed', {
            engagement_id,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        console.error('Unsubscribe error:', error);
      }
    });
    
    // Handle ping (heartbeat)
    socket.on('ping', () => {
      socket.emit('pong', {
        timestamp: Date.now(),
      });
    });
    
    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`❌ WebSocket client disconnected: ${socket.id} (Reason: ${reason})`);
      
      // Clean up Redis subscription if no more clients for this engagement
      if (socket.currentEngagement) {
        const room = io.sockets.adapter.rooms.get(`engagement:${socket.currentEngagement}`);
        if (!room || room.size === 0) {
          unsubscribeFromEngagement(socket.currentEngagement);
        }
      }
      
      // Remove from active connections
      if (activeConnections.has(socket.userId)) {
        activeConnections.get(socket.userId).delete(socket.id);
        if (activeConnections.get(socket.userId).size === 0) {
          activeConnections.delete(socket.userId);
        }
      }
    });
    
    // Handle errors
    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
  
  console.log('✅ WebSocket server initialized');
  
  return io;
}

/**
 * Broadcast location update to specific engagement
 * @param {object} io - Socket.io server instance
 * @param {number} engagementId - Engagement identifier
 * @param {object} locationData - Location update data
 */
export function broadcastLocationUpdate(io, engagementId, locationData) {
  io.to(`engagement:${engagementId}`).emit('location_update', {
    engagement_id: engagementId,
    location: locationData.location,
    eta: locationData.eta,
    timestamp: Date.now(),
  });
}

/**
 * Broadcast status change to specific engagement
 * @param {object} io - Socket.io server instance
 * @param {number} engagementId - Engagement identifier
 * @param {object} statusData - Status change data
 */
export function broadcastStatusChange(io, engagementId, statusData) {
  io.to(`engagement:${engagementId}`).emit('status_change', {
    engagement_id: engagementId,
    old_status: statusData.old_status,
    new_status: statusData.new_status,
    timestamp: Date.now(),
  });
}

/**
 * Broadcast connection lost event to specific engagement
 * @param {object} io - Socket.io server instance
 * @param {number} engagementId - Engagement identifier
 * @param {object} estimatedData - Estimated position data
 */
export function broadcastConnectionLost(io, engagementId, estimatedData) {
  io.to(`engagement:${engagementId}`).emit('connection_lost', {
    engagement_id: engagementId,
    last_update_at: estimatedData.last_update_at,
    estimated_position: estimatedData.estimated_position,
    timestamp: Date.now(),
  });
}

/**
 * Get active connections count
 * @returns {number} Number of active connections
 */
export function getActiveConnectionsCount() {
  let count = 0;
  for (const connections of activeConnections.values()) {
    count += connections.size;
  }
  return count;
}

/**
 * Get active connections for a user
 * @param {number} userId - User identifier
 * @returns {number} Number of connections for this user
 */
export function getUserConnectionsCount(userId) {
  return activeConnections.get(userId)?.size || 0;
}

export default {
  initializeWebSocketServer,
  broadcastLocationUpdate,
  broadcastStatusChange,
  broadcastConnectionLost,
  getActiveConnectionsCount,
  getUserConnectionsCount,
};
