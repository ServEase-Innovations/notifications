# Quick Start Guide - Tracking Service

Get the tracking service running in 5 minutes!

## Prerequisites

- ✅ Node.js 20+ installed
- ✅ PostgreSQL running
- ✅ Redis running
- ✅ Git repository cloned

## Step-by-Step Setup

### 1. Navigate to Service Directory
```bash
cd services/notifications/tracking
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit with your credentials
nano .env  # or use your favorite editor
```

**Minimum Required Configuration:**
```env
PORT=5007
DB_HOST=localhost
DB_PORT=5432
DB_NAME=serveaso
DB_USER=postgres
DB_PASSWORD=your_password
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_secret_key_here
```

**Optional but Recommended:**
```env
GOOGLE_MAPS_API_KEY=your_google_maps_api_key  # For accurate ETA
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

### 4. Create Database Table
```bash
# Connect to your PostgreSQL database
psql -U postgres -d serveaso

# Run the migration
\i database/migrations/001_create_tracking_sessions.sql

# Exit psql
\q
```

**Or in one command:**
```bash
psql -U postgres -d serveaso -f database/migrations/001_create_tracking_sessions.sql
```

### 5. Start the Service
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### 6. Verify It's Running
```bash
# Check health endpoint
curl http://localhost:5007/api/tracking/health

# Expected output:
# {"status":"ok","service":"tracking","timestamp":"2026-07-05T..."}
```

## 🎉 Success!

Your tracking service is now running on **http://localhost:5007**

## Quick Test

### Test Availability Endpoint (Requires Auth)
```bash
# You'll need a valid JWT token from your auth system
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:5007/api/tracking/availability/353
```

### Test WebSocket Connection
```javascript
// In browser console or Node.js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5007', {
  auth: { token: 'YOUR_SESSION_TOKEN' }
});

socket.on('connect', () => console.log('Connected!'));
socket.on('location_update', (data) => console.log('Location:', data));
```

## Common Issues

### Issue: "Database connection failed"
**Solution**: 
- Check PostgreSQL is running: `pg_isready`
- Verify credentials in `.env`
- Ensure database exists: `psql -U postgres -l`

### Issue: "Redis connection failed"
**Solution**:
- Check Redis is running: `redis-cli ping` (should return PONG)
- Start Redis: `redis-server`
- Check Redis port: default is 6379

### Issue: "Port 5007 already in use"
**Solution**:
- Change PORT in `.env` to another port (e.g., 5008)
- Or kill the process using port 5007: `lsof -ti:5007 | xargs kill`

### Issue: "JWT secret not configured"
**Solution**:
- Set JWT_SECRET in `.env`
- Generate a secure secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Next Steps

1. **Integrate with Frontend**: See `TRACKING_WAVE2_COMPLETE.md` for API examples
2. **Test Location Updates**: Implement provider app location sharing
3. **Monitor Logs**: Watch console for connection and update events
4. **Configure Google Maps**: Add API key for accurate ETA calculations

## API Documentation

Full API documentation available at:
- **README.md** - Service overview
- **TRACKING_WAVE2_COMPLETE.md** - Implementation details and API examples

## Need Help?

Check the main documentation files:
- `README.md` - Service features and architecture
- `TRACKING_WAVE2_COMPLETE.md` - Complete implementation guide
- `.kiro/specs/provider-live-tracking/` - Full feature specification

---

**Service URL**: http://localhost:5007  
**Health Check**: http://localhost:5007/api/tracking/health  
**WebSocket**: ws://localhost:5007
