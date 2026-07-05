# Tracking Service

Real-time service provider location tracking service with WebSocket support for live updates.

## Features

- ✅ Real-time location tracking via WebSocket
- ✅ ETA calculation with traffic awareness
- ✅ Position estimation for offline providers
- ✅ Team service tracking (lead provider)
- ✅ In-app messaging integration
- ✅ Redis Pub/Sub for scalability
- ✅ PostgreSQL for persistent data
- ✅ Cross-platform (Web + iOS)

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **WebSocket**: Socket.io
- **Database**: PostgreSQL
- **Cache**: Redis
- **External API**: Google Maps Directions API

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Redis server
- Google Maps API key

### Installation

```bash
# Navigate to tracking service
cd services/notifications/tracking

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env

# Run database migrations
psql -U your_user -d serveaso -f database/migrations/001_create_tracking_sessions.sql
```

### Environment Variables

See `.env.example` for all required configuration. Key variables:

- `PORT` - Server port (default: 5007)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - PostgreSQL connection
- `REDIS_HOST`, `REDIS_PORT` - Redis connection
- `GOOGLE_MAPS_API_KEY` - Google Maps API key for ETA calculation
- `JWT_SECRET` - JWT secret for authentication

## Development

```bash
# Start development server with hot reload
npm run dev

# Start production server
npm start

# Run tests
npm test
```

## API Endpoints

### REST API

#### GET `/api/tracking/availability/:engagementId`
Check if tracking is available for an engagement.

**Response:**
```json
{
  "available": true,
  "provider_status": "en_route",
  "reason": null,
  "is_team": false,
  "team_data": null
}
```

#### POST `/api/tracking/session/start`
Start a tracking session.

**Request:**
```json
{
  "engagement_id": 353,
  "customer_id": 1
}
```

**Response:**
```json
{
  "session_id": "sess_abc123",
  "websocket_url": "ws://localhost:5007",
  "polling_url": "/api/tracking/location/353",
  "session_token": "eyJhbGc..."
}
```

#### POST `/api/tracking/session/stop`
Stop a tracking session.

**Request:**
```json
{
  "session_id": "sess_abc123"
}
```

#### GET `/api/tracking/location/:engagementId`
Polling endpoint for location updates (WebSocket fallback).

#### GET `/api/tracking/eta/:engagementId`
Get current ETA calculation.

### WebSocket Protocol

Connect to: `ws://localhost:5007?token=<session_token>`

**Client → Server:**

Subscribe to engagement:
```json
{
  "type": "subscribe",
  "engagement_id": 353
}
```

Heartbeat:
```json
{
  "type": "ping"
}
```

**Server → Client:**

Location update:
```json
{
  "type": "location_update",
  "engagement_id": 353,
  "location": {
    "latitude": 28.5355,
    "longitude": 77.3910,
    "accuracy": 15,
    "bearing": 180,
    "speed": 8.5,
    "timestamp": 1704715200000
  },
  "eta": {
    "duration_seconds": 420,
    "eta_range": { "min_seconds": 360, "max_seconds": 480 }
  }
}
```

Status change:
```json
{
  "type": "status_change",
  "engagement_id": 353,
  "old_status": "en_route",
  "new_status": "arrived"
}
```

Connection lost:
```json
{
  "type": "connection_lost",
  "engagement_id": 353,
  "last_update_at": 1704715200000,
  "estimated_position": {
    "latitude": 28.5360,
    "longitude": 77.3915,
    "confidence": 0.8,
    "seconds_since_update": 90
  }
}
```

## Architecture

```
Client (Web/iOS)
    ↓
WebSocket/REST API
    ↓
Tracking Service (Express + Socket.io)
    ↓
├── Redis Pub/Sub (Location updates)
├── PostgreSQL (Tracking sessions)
└── Google Maps API (ETA calculation)
```

## Implementation Status

### Completed (Wave 0-1)
- ✅ Task 1.1: Directory structure created
- ✅ Task 1.2: Redis Pub/Sub client implemented
- ✅ Task 1.3: Database schema created
- ✅ Task 1.4: Tracking availability service implemented

### In Progress (Wave 2-3)
- 🔄 Task 1.5: REST API endpoints
- 🔄 Task 2.1: WebSocket server setup
- 🔄 Task 3.1: Location processor
- 🔄 Task 3.2: Google Maps integration
- 🔄 Task 3.3: ETA calculator
- 🔄 Task 3.4: Position estimator
- 🔄 Task 3.5: Team tracking logic

### Pending
- ⏳ Security & privacy implementation
- ⏳ Web frontend components
- ⏳ iOS frontend components
- ⏳ Testing suite
- ⏳ Deployment configuration

## Next Steps

1. Complete REST API endpoint implementation (Task 1.5)
2. Set up WebSocket server with Socket.io (Task 2.1-2.4)
3. Implement location processing and ETA calculation (Task 3.1-3.5)
4. Add authentication and security middleware (Task 4.1-4.3)
5. Begin frontend implementation (Wave 5+)

## Location

This service is located under `services/notifications/tracking/` to maintain organizational structure alongside the Mail notification service.

## License

ISC
