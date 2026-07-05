# Provider Tracking Status System

## Overview

Separate tracking status system for provider journey tracking that doesn't interfere with the existing `task_status` workflow.

## Why Separate Status?

- **Existing `task_status`**: Used for booking lifecycle (NOT_STARTED, IN_PROGRESS, COMPLETED, CANCELLED)
- **New `tracking_status`**: Specifically for provider journey tracking (not_started, en_route, arrived, service_started, service_completed)

This keeps tracking independent from your existing workflows and prevents conflicts.

## Database Schema

### Table: `engagement_tracking_status`

```sql
CREATE TABLE engagement_tracking_status (
    engagement_id INTEGER PRIMARY KEY,
    provider_id INTEGER NOT NULL,
    tracking_status VARCHAR(50) DEFAULT 'not_started',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    last_location_update TIMESTAMP,
    journey_started_at TIMESTAMP,
    arrived_at TIMESTAMP,
    service_started_at TIMESTAMP,
    service_completed_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

## Tracking Status Values

| Status | Description | Tracking Enabled? |
|--------|-------------|-------------------|
| `not_started` | Provider hasn't begun journey | ❌ No |
| **`en_route`** | Provider is traveling to customer | ✅ **YES** |
| `arrived` | Provider reached customer location | ❌ No |
| `service_started` | Service work in progress | ❌ No |
| `service_completed` | Service finished | ❌ No |

**Note**: Customer tracking is ONLY enabled during `en_route` status.

## Provider API Endpoints

### 1. Start Journey (Enable Tracking)

```http
POST /api/tracking/provider/start-journey
Authorization: Bearer <provider_token>
Content-Type: application/json

{
  "engagement_id": 349,
  "latitude": 12.9716,    // optional
  "longitude": 77.5946    // optional
}
```

**Response**:
```json
{
  "message": "Journey started - tracking enabled",
  "engagement_id": 349,
  "tracking_status": "en_route",
  "journey_started_at": "2026-07-05T14:30:00Z"
}
```

### 2. Mark Arrived

```http
POST /api/tracking/provider/arrived
Authorization: Bearer <provider_token>
Content-Type: application/json

{
  "engagement_id": 349,
  "latitude": 12.9716,    // optional
  "longitude": 77.5946    // optional
}
```

**Response**:
```json
{
  "message": "Arrival confirmed",
  "engagement_id": 349,
  "tracking_status": "arrived",
  "arrived_at": "2026-07-05T15:00:00Z"
}
```

### 3. Start Service

```http
POST /api/tracking/provider/start-service
Authorization: Bearer <provider_token>
Content-Type: application/json

{
  "engagement_id": 349
}
```

### 4. Complete Service

```http
POST /api/tracking/provider/complete-service
Authorization: Bearer <provider_token>
Content-Type: application/json

{
  "engagement_id": 349
}
```

### 5. Get Current Status

```http
GET /api/tracking/provider/status/349
Authorization: Bearer <provider_token>
```

**Response**:
```json
{
  "engagement_id": 349,
  "provider_id": 15,
  "tracking_status": "en_route",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "last_location_update": "2026-07-05T14:45:00Z",
  "journey_started_at": "2026-07-05T14:30:00Z",
  "arrived_at": null,
  "service_started_at": null,
  "service_completed_at": null,
  "created_at": "2026-07-05T14:30:00Z",
  "updated_at": "2026-07-05T14:45:00Z"
}
```

## Customer Availability Check

The existing availability endpoint now checks tracking status:

```http
GET /api/tracking/availability/349
```

**Response when provider NOT en route**:
```json
{
  "available": false,
  "provider_status": "not_started",
  "reason": "Provider hasn't started the journey yet",
  "is_team": false,
  "team_data": null,
  "engagement_details": {
    "id": "349",
    "provider_id": "15",
    "customer_id": "1",
    "service_address": "..."
  }
}
```

**Response when provider IS en route**:
```json
{
  "available": true,
  "provider_status": "en_route",
  "reason": null,
  "is_team": false,
  "team_data": null,
  "engagement_details": {
    "id": "349",
    "provider_id": "15",
    "customer_id": "1",
    "service_address": "..."
  }
}
```

## Integration with Provider App

### Recommended Flow

1. **Provider accepts booking** → No tracking status yet (default: `not_started`)

2. **Provider starts traveling** → Call `/start-journey`
   - Creates tracking status record
   - Sets status to `en_route`
   - Customer can now track location
   - Provider app starts sending location updates via WebSocket

3. **Provider arrives** → Call `/arrived`
   - Changes status to `arrived`
   - Customer tracking stops
   - Provider can start service

4. **Provider starts work** → Call `/start-service`
   - Optional step for analytics
   - Doesn't affect tracking

5. **Provider completes work** → Call `/complete-service`
   - Final status
   - Tracking lifecycle complete

## Separation from task_status

| `task_status` (Existing) | `tracking_status` (New) | Notes |
|-------------------------|-------------------------|-------|
| NOT_STARTED | not_started | Default state |
| - | **en_route** | **Tracking enabled** |
| - | arrived | Tracking disabled |
| IN_PROGRESS | service_started | Service work |
| COMPLETED | service_completed | Final state |
| CANCELLED | - | No tracking for cancelled |

**Key Points**:
- `task_status` = Booking lifecycle management
- `tracking_status` = Provider journey/location tracking
- They can exist independently
- No conflicts with existing workflows

## Migration Path

1. ✅ Run SQL migration: `109_engagement_tracking_status.sql`
2. ✅ Deploy tracking service with new endpoints
3. ✅ Update provider app to call tracking endpoints
4. ✅ Test with a single engagement
5. ✅ Roll out to all providers

## Testing

### Local Testing

```bash
# Start journey
curl -X POST http://localhost:10000/api/tracking/provider/start-journey \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"engagement_id": 349, "latitude": 12.9716, "longitude": 77.5946}'

# Check availability (should show available: true)
curl http://localhost:10000/api/tracking/availability/349

# Mark arrived
curl -X POST http://localhost:10000/api/tracking/provider/arrived \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"engagement_id": 349}'

# Check availability (should show available: false, reason: "Provider has already arrived")
curl http://localhost:10000/api/tracking/availability/349
```

## Future Enhancements

- Auto-transition to `arrived` when provider location reaches customer address
- Notifications when provider starts journey
- ETA calculations based on location updates
- Journey analytics and reporting
