# Render Deployment Guide for Notification Services

## Overview

The `services/notifications` repository contains two independent services:
1. **Mail Service** - Sends email notifications
2. **Tracking Service** - Real-time provider location tracking (NEW)

## Deployment Options

### Option 1: Deploy as Separate Services (Recommended)

Create two separate Render web services:

#### Service 1: Mail Service

**Settings:**
- **Name:** `serveaso-mail`
- **Build Command:** `cd Mail && npm ci`
- **Start Command:** `cd Mail && npm start`
- **Auto-Deploy:** Yes

**Environment Variables:**
```
NODE_ENV=production
PORT=3000
SENDGRID_API_KEY=<your-key>
MONGODB_URI=<your-mongo-uri>
# ... other Mail service env vars
```

---

#### Service 2: Tracking Service (NEW)

**Settings:**
- **Name:** `serveaso-tracking`
- **Build Command:** `cd tracking && npm ci`
- **Start Command:** `cd tracking && npm start`
- **Auto-Deploy:** Yes

**Environment Variables:**
```
NODE_ENV=production
PORT=5007

# Redis (for Pub/Sub and caching)
REDIS_HOST=<your-redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=<your-redis-password>

# PostgreSQL (for tracking sessions)
DATABASE_HOST=<your-postgres-host>
DATABASE_PORT=5432
DATABASE_NAME=serveaso
DATABASE_USER=<your-db-user>
DATABASE_PASSWORD=<your-db-password>

# Google Maps API (for ETA calculation)
GOOGLE_MAPS_API_KEY=<your-google-maps-api-key>

# Security
JWT_SECRET=<your-jwt-secret>
ENCRYPTION_KEY=<your-32-character-encryption-key>
```

---

### Option 2: Use render.yaml (Automatic)

1. Import `render.yaml` in your Render dashboard
2. Render will automatically create both services
3. Add environment variables via Render UI for secrets

---

## Required External Services

### For Tracking Service:

#### 1. Redis (Required)
**Option A: Render Redis**
- Create a new Redis instance in Render
- Use the internal connection URL
- Free tier available

**Option B: External Redis**
- Use Redis Cloud (free tier)
- Or any other Redis hosting

#### 2. PostgreSQL (Required)
**Option A: Render PostgreSQL**
- Create a new PostgreSQL database in Render
- Use the internal connection URL
- Free tier available (expires after 90 days)

**Option B: External PostgreSQL**
- Use Supabase, Neon, or other Postgres hosting

#### 3. Run Database Migration
After PostgreSQL is set up:
```bash
# Connect to your database
psql <your-database-url>

# Run the migration
\i services/notifications/tracking/database/migrations/001_create_tracking_sessions.sql
```

Or use Render Shell:
```bash
cd tracking
npm install -g pg
psql $DATABASE_URL < database/migrations/001_create_tracking_sessions.sql
```

---

## Testing Deployment

### Test Mail Service:
```bash
curl https://serveaso-mail.onrender.com/health
```

### Test Tracking Service:
```bash
# Health check
curl https://serveaso-tracking.onrender.com/api/tracking/health

# Should return:
# {"status":"ok","service":"tracking","timestamp":"2024-..."}
```

---

## Environment Setup Checklist

### Mail Service
- [ ] NODE_ENV=production
- [ ] PORT configured
- [ ] SENDGRID_API_KEY added
- [ ] MONGODB_URI added
- [ ] All other Mail env vars configured

### Tracking Service
- [ ] NODE_ENV=production
- [ ] PORT=5007
- [ ] Redis instance created
- [ ] REDIS_HOST, REDIS_PORT, REDIS_PASSWORD configured
- [ ] PostgreSQL database created
- [ ] DATABASE_* variables configured
- [ ] Database migration run
- [ ] Google Maps API key generated with Maps JS + Directions API enabled
- [ ] GOOGLE_MAPS_API_KEY configured
- [ ] JWT_SECRET generated (use: `openssl rand -base64 32`)
- [ ] ENCRYPTION_KEY generated (32 characters)

---

## Web App Configuration

Update your web app's environment variables to point to the tracking service:

```env
# For production (Render)
REACT_APP_TRACKING_API_URL=https://serveaso-tracking.onrender.com/api/tracking
REACT_APP_GOOGLE_MAPS_API_KEY=<your-google-maps-api-key>
```

---

## Scaling Considerations

### Tracking Service:
- **CPU/Memory:** Start with basic (0.5 CPU, 512 MB)
- **Auto-scaling:** Enable if you expect high concurrent tracking sessions
- **Redis:** Essential for multi-instance scaling (Pub/Sub distributes location updates)
- **Database:** Connection pooling configured (max 20 connections)

### Mail Service:
- **CPU/Memory:** Basic tier sufficient for most use cases
- **Queue:** Consider adding a job queue (Bull, BullMQ) for high-volume emails

---

## Monitoring

### Logs to Watch:
```bash
# Render Shell or Logs tab
tail -f /var/log/app.log

# Look for:
- "Tracking service listening on port 5007"
- "Redis connected"
- "PostgreSQL connected"
- "WebSocket client connected"
- "Location update received"
```

### Metrics:
- Active tracking sessions
- WebSocket connections
- Redis operations/sec
- Database queries/sec
- ETA API calls (Google Maps quota)

---

## Troubleshooting

### Tracking Service Won't Start

**Check:**
1. Redis connection: `telnet $REDIS_HOST $REDIS_PORT`
2. PostgreSQL connection: `psql $DATABASE_URL`
3. Environment variables set correctly
4. Logs: "Error connecting to Redis" or "Error connecting to PostgreSQL"

### WebSocket Not Connecting

**Check:**
1. Port 5007 is exposed
2. CORS configured correctly
3. Render allows WebSocket connections (should by default)
4. Client using WSS:// for HTTPS, WS:// for HTTP

### ETA Not Calculating

**Check:**
1. Google Maps API key is valid
2. Directions API is enabled
3. Billing is enabled on Google Cloud (required for Directions API)
4. API key not restricted to wrong domains

---

## Cost Estimates (Render)

### Free Tier:
- Mail Service: Free
- Tracking Service: Free
- Redis: Free (limited)
- PostgreSQL: Free for 90 days

### Paid Tier (Recommended for Production):
- Mail Service: $7/month (Starter)
- Tracking Service: $7/month (Starter)
- Redis: $10/month (Managed Redis)
- PostgreSQL: $7/month (Starter)

**Total: ~$31/month** for basic production setup

---

## Quick Deploy Commands

### Mail Only:
```bash
cd Mail && npm ci && npm start
```

### Tracking Only:
```bash
cd tracking && npm ci && npm start
```

### Both (if using monorepo manager):
```bash
npm run start:mail  # or
npm run start:tracking
```

---

## Next Steps

1. ✅ Push code to GitHub (DONE)
2. Create Render services (Mail + Tracking)
3. Add environment variables
4. Set up Redis and PostgreSQL
5. Run database migration
6. Test health endpoints
7. Update web app env vars
8. Deploy web app
9. Test end-to-end tracking flow

---

**Questions?** Check:
- `tracking/README.md` - Full API documentation
- `tracking/QUICKSTART.md` - Local development guide
- `tracking/.env.example` - All required env vars
