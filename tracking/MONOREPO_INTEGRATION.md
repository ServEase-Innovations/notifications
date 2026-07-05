# Tracking Service - Monorepo Integration

## Overview

The tracking service is now fully integrated into the Serveaso monorepo with:
- ✅ Centralized database migrations
- ✅ Shared Postgres connection configuration
- ✅ Monitoring and observability integration
- ✅ Render auto-deployment (notifications repo)

**Note:** The notifications service (containing tracking) deploys **separately from the main monorepo**. It has its own GitHub repository and Render auto-deploy configuration.

---

## Deployment Architecture

### Notifications Service (Separate Repo)
- **Repository:** `ServEase-Innovations/notifications`
- **Contains:** Mail service + Tracking service
- **Deployment:** Render auto-deploy (connected to notifications repo)
- **Configuration:** `render.yaml` in notifications repo root

### Other Services (Monorepo)
- **Repository:** `ServEase-Innovations/Serveaso` (monorepo)
- **Services:** payments, providers, coupons, utils, reviews, tickets, chat, image-uploader
- **Deployment:** GitHub Actions workflow → Render deploy hooks
- **Configuration:** `.github/workflows/deploy-backend.yml`

---

## Database Migrations

### Migration File

**Location:** `database/sql/108_tracking_sessions.sql`

This migration creates the `tracking_sessions` table and is managed by the monorepo's centralized migration system.

### Running Migrations Locally

```bash
# From monorepo root
npm run db:migrate
```

This will:
1. Apply all pending SQL migrations (including 108_tracking_sessions.sql)
2. Run Prisma migrations for services that need them

### Running Migrations in CI/CD

Migrations run automatically in the GitHub Actions deployment workflow when `run_migrations: true` (default).

---

## Deployment

### Automatic Deployment (Render)

The notifications service (which includes tracking) is deployed **automatically by Render** when you push to the notifications repository.

**How it works:**
1. Push changes to `ServEase-Innovations/notifications` repository
2. Render detects the push and auto-deploys
3. Uses `render.yaml` configuration in the repo root
4. Builds and starts both Mail and Tracking services

**Current Setup:**
- Service URL: `https://notifications-mjdp.onrender.com`
- Auto-deploy: ✅ Enabled (connected to notifications repo)
- Build Command: `cd tracking && npm install`
- Start Command: `cd tracking && npm start`

### Manual Deployment

You can also trigger manual deploys from the Render dashboard:
1. Go to Render dashboard → `notifications` service
2. Click **"Manual Deploy"** → **"Deploy latest commit"**
3. Watch logs for deployment progress

---

### Environment Variables (Render)

These need to be configured in the Render dashboard for the notifications service:

### Environment Variables (Render)

These need to be configured in the Render dashboard for the notifications service:

```bash
NODE_ENV=production
PORT=5007

# Use your existing Postgres (same as other services)
POSTGRES_HOST=<your-postgres-host>
POSTGRES_PORT=5432
POSTGRES_DATABASE=serveaso
POSTGRES_USER=<your-postgres-user>
POSTGRES_PASSWORD=<your-postgres-password>

# Redis (your Redis Cloud instance)
REDIS_HOST=painstaking-turn-practical-89123.db.redis.io
REDIS_PORT=18399
REDIS_PASSWORD=<your-redis-password>

# Google Maps API
GOOGLE_MAPS_API_KEY=<your-google-maps-api-key>

# Security
JWT_SECRET=<generate with: openssl rand -base64 32>
ENCRYPTION_KEY=<generate with: openssl rand -hex 16>

# Optional
CORS_ORIGIN=https://your-web-app.com
```

---

## Monitoring & Observability

The tracking service is integrated into the monorepo's monitoring system:

### Metrics Endpoint
- **URL:** `https://notifications-mjdp.onrender.com/metrics`
- **Format:** Prometheus text exposition
- **Metrics:** CPU, memory, uptime, HTTP requests

### Integration Tests
Location: `tests/integration/metrics.test.mjs`
- Automatically tests `/metrics` endpoint
- Runs in CI/CD pipeline
- Part of deployment verification

### Deployment Verification
Location: `.github/scripts/observability-smoke.sh`
- Runs after deployments
- Checks service health
- Included in email notifications

---

## Not Part of deploy-backend Workflow

⚠️ **Important:** The tracking service is **NOT** deployed via the monorepo's `.github/workflows/deploy-backend.yml` workflow.

**Why?**
- The notifications repo is a separate repository
- Render auto-deploys from the notifications repo directly
- No GitHub Actions workflow needed for notifications/tracking

**To deploy tracking:**
1. Make changes in `services/notifications/tracking/`
2. Commit to notifications submodule
3. Push notifications submodule: `cd services/notifications && git push`
4. Render automatically deploys
5. Update monorepo submodule reference (optional): `cd ../.. && git add services/notifications && git commit && git push`

---

## Environment Variables

### Database

The tracking service uses the **monorepo Postgres connection** (same database as other services).

**Supported formats:**
```bash
# Primary (monorepo standard)
POSTGRES_HOST=...
POSTGRES_PORT=5432
POSTGRES_DATABASE=serveaso
POSTGRES_USER=...
POSTGRES_PASSWORD=...

# Alternative (legacy compatibility)
DB_HOST=...
DB_PORT=5432
DB_NAME=serveaso
DB_USER=...
DB_PASSWORD=...
```

### Redis

Required for real-time location streaming:

```bash
REDIS_HOST=painstaking-turn-practical-89123.db.redis.io
REDIS_PORT=18399
REDIS_PASSWORD=your-password
```

### Google Maps

Required for ETA calculation:

```bash
GOOGLE_MAPS_API_KEY=your-key
```

**APIs to enable:**
- Maps JavaScript API
- Directions API (requires billing enabled)

### Security

```bash
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 16)
```

---

## Local Development

### Prerequisites

1. PostgreSQL with `serveaso` database
2. Redis running locally or Redis Cloud
3. Google Maps API key

### Setup

```bash
# From monorepo root
cd services/notifications/tracking

# Copy and configure environment
cp .env.example .env
# Edit .env with your values

# Install dependencies
npm install

# Run migrations (from monorepo root)
cd ../../..
npm run db:migrate

# Start tracking service
cd services/notifications/tracking
npm start
```

### Test

```bash
# Health check
curl http://localhost:5007/api/tracking/health

# Should return:
# {"status":"ok","service":"tracking","timestamp":"..."}
```

---

## Service Configuration

The tracking service is **NOT** in `.github/deploy/services.json` because it deploys separately from the notifications repository.

### Monitoring Integration Only

The tracking service **was added to** these monorepo files for monitoring purposes:
- `tests/integration/lib/config.mjs` - Service URL for integration tests
- `tests/integration/metrics.test.mjs` - Metrics endpoint testing
- `.github/scripts/observability-smoke.sh` - Deployment health checks

These files enable the monorepo to monitor the tracking service even though it deploys separately.

---

## Migration Strategy

### Initial Deploy (Fresh Start)

If deploying for the first time:

1. Run migrations first (creates `tracking_sessions` table)
2. Deploy tracking service
3. Test with health endpoint

### Existing Database

If `tracking_sessions` table doesn't exist:

```bash
# The migration system will automatically apply 108_tracking_sessions.sql
npm run db:migrate
```

The migration is idempotent (uses `CREATE TABLE IF NOT EXISTS`).

---

## Troubleshooting

### Database Connection Fails

**Check environment variables:**
```bash
# Service expects either POSTGRES_* or DB_* prefix
echo $POSTGRES_HOST $POSTGRES_DATABASE
# OR
echo $DB_HOST $DB_NAME
```

**Verify table exists:**
```sql
SELECT * FROM information_schema.tables 
WHERE table_name = 'tracking_sessions';
```

### Redis Connection Fails

**Check Redis is reachable:**
```bash
# Test connection
redis-cli -h painstaking-turn-practical-89123.db.redis.io -p 18399 -a <password> PING
```

**Ensure host doesn't include port:**
```bash
# ❌ WRONG
REDIS_HOST=painstaking-turn-practical-89123.db.redis.io:18399

# ✅ CORRECT
REDIS_HOST=painstaking-turn-practical-89123.db.redis.io
REDIS_PORT=18399
```

### Google Maps ETA Fails

**Check API key is valid:**
```bash
curl "https://maps.googleapis.com/maps/api/directions/json?origin=New+York&destination=Boston&key=${GOOGLE_MAPS_API_KEY}"
```

**Verify billing is enabled** (Directions API requires it)

---

## Architecture

### Database Schema

**Table:** `tracking_sessions`
- Primary key: `session_id` (VARCHAR)
- Foreign key: `engagement_id` → `engagements.id`
- Indexes on: `customer_id`, `provider_id`, `status`, `started_at`

### Redis Channels

Real-time updates use Redis Pub/Sub:
- `tracking:location:{engagementId}` - Location updates
- `tracking:status:{engagementId}` - Status changes
- `tracking:connection_lost:{engagementId}` - Offline notifications

### API Endpoints

```
GET  /api/tracking/health
POST /api/tracking/start
POST /api/tracking/location
GET  /api/tracking/session/:sessionId
POST /api/tracking/stop
GET  /api/tracking/eta/:sessionId
```

**WebSocket:** `ws://localhost:5007` (or wss:// in production)

---

## Next Steps

1. ✅ Add database migration to `database/sql/108_tracking_sessions.sql`
2. ✅ Add tracking to `.github/deploy/services.json`
3. ✅ Update deployment workflow
4. ✅ Configure tracking service to use monorepo Postgres
5. ⏳ Set up Render service with environment variables
6. ⏳ Add GitHub secrets for deployment
7. ⏳ Run initial migration: `npm run db:migrate`
8. ⏳ Deploy via GitHub Actions
9. ⏳ Test end-to-end tracking flow

---

## Related Documentation

- Main tracking README: `services/notifications/tracking/README.md`
- API Documentation: `services/notifications/tracking/README.md#api-endpoints`
- Monorepo migrations: `database/README.md`
- Deployment guide: `docs/DEPLOYMENT.md`
- Spec design: `.kiro/specs/provider-live-tracking/design.md`
