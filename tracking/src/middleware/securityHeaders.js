/**
 * Security headers middleware
 * Implements security best practices for HTTP responses
 */
export function securityHeaders(req, res, next) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Strict Transport Security (HTTPS only)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' ws: wss:; " +
    "frame-ancestors 'none'"
  );
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy (formerly Feature Policy)
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(self), ' +
    'microphone=(), ' +
    'camera=(), ' +
    'payment=(), ' +
    'usb=()'
  );
  
  next();
}

/**
 * CORS headers with security considerations
 */
export function secureCORS(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    
    next();
  };
}

/**
 * Request validation middleware
 * Validates request size and content
 */
export function validateRequest(req, res, next) {
  // Check Content-Length
  const contentLength = parseInt(req.headers['content-length'] || '0');
  const maxSize = 1024 * 1024; // 1MB
  
  if (contentLength > maxSize) {
    return res.status(413).json({
      error: 'Request too large',
      max_size: maxSize,
    });
  }
  
  // Validate Content-Type for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        expected: 'application/json',
      });
    }
  }
  
  next();
}

/**
 * Input sanitization middleware
 * Prevents common injection attacks
 */
export function sanitizeInput(req, res, next) {
  // Sanitize query parameters
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeString(req.query[key]);
      }
    }
  }
  
  // Sanitize body (only string fields)
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  
  next();
}

/**
 * Sanitize string input
 */
function sanitizeString(str) {
  if (typeof str !== 'string') {
    return str;
  }
  
  // Remove null bytes
  str = str.replace(/\0/g, '');
  
  // Trim whitespace
  str = str.trim();
  
  // Remove potential SQL injection patterns (basic)
  // Note: Parameterized queries are the real protection
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
  ];
  
  for (const pattern of sqlPatterns) {
    if (pattern.test(str)) {
      console.warn('Potential SQL injection attempt detected:', str.substring(0, 50));
    }
  }
  
  return str;
}

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj) {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = sanitizeString(obj[key]);
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

/**
 * IP-based rate limiting (additional layer)
 */
const ipRequestCounts = new Map();
const IP_WINDOW_MS = 60000; // 1 minute
const IP_MAX_REQUESTS = 100;

export function ipRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  // Get or initialize request data for this IP
  if (!ipRequestCounts.has(ip)) {
    ipRequestCounts.set(ip, { count: 0, resetTime: now + IP_WINDOW_MS });
  }
  
  const requestData = ipRequestCounts.get(ip);
  
  // Reset if window expired
  if (now > requestData.resetTime) {
    requestData.count = 0;
    requestData.resetTime = now + IP_WINDOW_MS;
  }
  
  // Increment count
  requestData.count++;
  
  // Check limit
  if (requestData.count > IP_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests from this IP',
      retry_after: Math.ceil((requestData.resetTime - now) / 1000),
    });
  }
  
  next();
}

/**
 * Clean up old IP rate limit data
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequestCounts.entries()) {
    if (now > data.resetTime + IP_WINDOW_MS) {
      ipRequestCounts.delete(ip);
    }
  }
}, 300000); // Clean up every 5 minutes

/**
 * Block suspicious user agents
 */
const BLOCKED_USER_AGENTS = [
  'bot',
  'crawler',
  'spider',
  'scraper',
];

export function blockSuspiciousAgents(req, res, next) {
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  
  for (const blocked of BLOCKED_USER_AGENTS) {
    if (userAgent.includes(blocked)) {
      console.warn(`Blocked suspicious user agent: ${userAgent}`);
      return res.status(403).json({
        error: 'Access denied',
      });
    }
  }
  
  next();
}

/**
 * Request ID middleware for tracing
 */
export function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || 
             `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  
  next();
}

export default {
  securityHeaders,
  secureCORS,
  validateRequest,
  sanitizeInput,
  ipRateLimit,
  blockSuspiciousAgents,
  requestId,
};
