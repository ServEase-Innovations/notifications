import crypto from 'crypto';
import config from '../config/index.js';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Derive encryption key from secret
 * Uses PBKDF2 for key derivation
 */
function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(
    secret,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha512'
  );
}

/**
 * Encrypt sensitive data
 * @param {string} text - Plain text to encrypt
 * @param {string} secret - Encryption secret (optional, uses config if not provided)
 * @returns {string} Encrypted data in format: salt:iv:tag:encrypted
 */
export function encrypt(text, secret = null) {
  if (!text) {
    return null;
  }
  
  try {
    const encryptionSecret = secret || config.jwt.secret;
    
    if (!encryptionSecret) {
      console.warn('No encryption secret configured, storing data unencrypted');
      return text;
    }
    
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key from secret
    const key = deriveKey(encryptionSecret, salt);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt data
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Return format: salt:iv:tag:encrypted
    return [
      salt.toString('hex'),
      iv.toString('hex'),
      tag.toString('hex'),
      encrypted,
    ].join(':');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted data in format: salt:iv:tag:encrypted
 * @param {string} secret - Encryption secret (optional, uses config if not provided)
 * @returns {string} Decrypted plain text
 */
export function decrypt(encryptedData, secret = null) {
  if (!encryptedData) {
    return null;
  }
  
  try {
    const encryptionSecret = secret || config.jwt.secret;
    
    if (!encryptionSecret) {
      console.warn('No encryption secret configured, returning data as-is');
      return encryptedData;
    }
    
    // Check if data is in encrypted format
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      // Data is not encrypted, return as-is
      console.warn('Data does not appear to be encrypted');
      return encryptedData;
    }
    
    const [saltHex, ivHex, tagHex, encrypted] = parts;
    
    // Convert from hex
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    // Derive key
    const key = deriveKey(encryptionSecret, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash sensitive data (one-way)
 * Useful for tokens, passwords, etc.
 */
export function hash(text) {
  if (!text) {
    return null;
  }
  
  return crypto
    .createHash('sha256')
    .update(text)
    .digest('hex');
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Encrypt location data for storage
 * Encrypts sensitive fields while keeping structure
 */
export function encryptLocationData(locationData) {
  if (!locationData) {
    return null;
  }
  
  try {
    // Only encrypt precise coordinates, keep other data readable
    return {
      ...locationData,
      latitude: encrypt(locationData.latitude.toString()),
      longitude: encrypt(locationData.longitude.toString()),
      // Keep metadata unencrypted for querying
      timestamp: locationData.timestamp,
      accuracy: locationData.accuracy,
      provider_id: locationData.provider_id,
      engagement_id: locationData.engagement_id,
    };
  } catch (error) {
    console.error('Error encrypting location data:', error);
    return locationData;
  }
}

/**
 * Decrypt location data
 */
export function decryptLocationData(encryptedData) {
  if (!encryptedData) {
    return null;
  }
  
  try {
    return {
      ...encryptedData,
      latitude: parseFloat(decrypt(encryptedData.latitude)),
      longitude: parseFloat(decrypt(encryptedData.longitude)),
    };
  } catch (error) {
    console.error('Error decrypting location data:', error);
    return encryptedData;
  }
}

/**
 * Sanitize data for logging (remove sensitive fields)
 */
export function sanitizeForLogging(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sanitized = { ...data };
  
  // Remove or mask sensitive fields
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'api_key',
    'latitude',
    'longitude',
    'location',
    'coordinates',
  ];
  
  for (const field of sensitiveFields) {
    if (sanitized[field] !== undefined) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Compare timing-safe strings
 * Prevents timing attacks
 */
export function timingSafeCompare(a, b) {
  if (!a || !b) {
    return false;
  }
  
  try {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    
    if (bufferA.length !== bufferB.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch (error) {
    return false;
  }
}

export default {
  encrypt,
  decrypt,
  hash,
  generateSecureToken,
  encryptLocationData,
  decryptLocationData,
  sanitizeForLogging,
  timingSafeCompare,
};
