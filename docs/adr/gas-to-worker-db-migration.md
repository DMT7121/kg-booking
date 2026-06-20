# Architecture Decision Record (ADR): GAS to Worker + Database Migration Roadmap

## Context & Problem Statement
The King's Grill booking ecosystem currently relies on Google Apps Script (GAS) as both the API server and database backend (persisting records directly onto Google Sheets). While this approach provides rapid prototyping with no hosting costs, it introduces major operational limits:
1. **High Latency & Cold Starts:** GAS requests can take anywhere between 1.5s to 8s depending on container instances.
2. **Rate Limits & Quotas:** Google imposes daily quotas (e.g. email limits, URL fetches) that throttle performance during peak service.
3. **Lack of Transactional Safety:** Multi-user updates on Google Sheets have high race-condition risks, leading to duplicated booking slots or overwritten reservation entries.
4. **Poor Offline Syncing:** Silent sync without robust version checks frequently corrupts sheet rows.

To address this, we are planning a gradual transition from GAS to a serverless API gateway paired with a transactional datastore.

---

## Proposed Options

### Option A: Cloudflare Worker + Cloudflare D1 (Recommended)
Cloudflare's serverless SQLite database, D1, runs natively on the Cloudflare network, close to the worker gateways.

- **Pros:**
  - Ultra-low latency query execution (usually <10ms from worker to DB).
  - SQLite transaction model provides atomic safety.
  - Zero egress fees; part of the existing Wrangler/Cloudflare Edge ecosystem.
  - Simple migrations and setup through Wrangler commands.
- **Cons:**
  - SQLite dialect restricts complex spatial indexing or massive analytical query structures (not a major constraint for King's Grill booking workloads).

### Option B: Cloudflare Worker + Supabase (PostgreSQL)
A managed Postgres instance connected via HTTP/WebSockets or connection pools.

- **Pros:**
  - Robust PostgreSQL capabilities (Row-Level Security, full text search, native JSONB).
  - Out-of-the-box admin panel UI, real-time database listener subscriptions.
- **Cons:**
  - Higher latency overhead due to connection establishment between Worker Edge nodes and centralized RDS database regions.
  - Potential pricing escalations compared to the free/cheap D1 limits.

### Decision
We will proceed with **Option A (Cloudflare D1)** for our Primary transactional database due to optimal latency performance, simpler single-platform build structure, and adequate transactional power for restaurant table allocation.

---

## 4-Phase Migration Roadmap

### Phase 0: Current State (Baseline)
- Frontend client communicates directly with GAS endpoints.
- GAS updates Google Sheets as the single source of truth.

### Phase 1: Gateway Proxy Integration (In Progress)
- Worker receives all frontend API requests, validates signature, rate limits, and forwards normal requests to GAS proxy endpoints.
- Client communicates only with Cloudflare Worker. GAS becomes a legacy fallback.

### Phase 2: D1 Database Primary Migration
- Set up D1 SQLite database. Rewrite Worker to read/write directly to D1.
- Write operations get verified locally on D1 for table availability and conflicts.
- GAS is kept active as a secondary read-only mirror.

### Phase 3: Reporting Sync only to Google Sheets
- Cloudflare Worker performs database writes on D1 instantly.
- A background cron (Cloudflare Worker Cron Trigger) runs periodically (e.g. every 5 minutes) to synchronize booking summaries into Google Sheets.
- Restaurant managers still view Sheets for statistics, but the live client uses D1.

---

## Database Schema (D1 SQL)

```sql
-- Table: bookings
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  booking_date TEXT NOT NULL,          -- Format: YYYY-MM-DD
  start_time TEXT NOT NULL,            -- Format: HH:MM
  end_time TEXT,                       -- Format: HH:MM
  table_id TEXT NOT NULL,
  guest_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, canceled, no_show
  source TEXT DEFAULT 'web',           -- web, staff, offline_sync
  device_id TEXT,
  client_created_at TEXT NOT NULL,
  client_updated_at TEXT NOT NULL,
  server_created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  server_updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1
);

-- Index for quick overlap check
CREATE INDEX idx_bookings_date_table ON bookings(booking_date, table_id);

-- Table: booking_conflicts
CREATE TABLE booking_conflicts (
  id TEXT PRIMARY KEY,
  local_booking_id TEXT NOT NULL,
  server_booking_id TEXT,
  conflict_type TEXT NOT NULL,         -- table_time_overlap, version_mismatch
  severity TEXT NOT NULL DEFAULT 'blocking',
  local_snapshot_json TEXT NOT NULL,
  server_snapshot_json TEXT,
  status TEXT DEFAULT 'open',          -- open, resolved, ignored
  resolution TEXT,                     -- keep_server, keep_local, cancel_local
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

-- Table: request_nonces (Replay Protection)
CREATE TABLE request_nonces (
  nonce TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Table: sync_audit_log (Audit trail)
CREATE TABLE sync_audit_log (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  action TEXT NOT NULL,                -- create, update, delete
  actor_device_id TEXT,
  request_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## API Contract Specifications

### 1. Save/Sync Booking
- **Route:** `POST /api/bookings/sync`
- **Headers:**
  - `Content-Type: application/json`
  - `X-KG-Signature: <hmac_sig>`
  - `X-KG-Timestamp: <timestamp>`
  - `X-KG-Nonce: <nonce>`
- **Request Body:**
  ```json
  {
    "id": "bfa892a0-4ff1-4ab0",
    "version": 1,
    "baseServerVersion": 0,
    "customer": {
      "name": "Nguyen Van A",
      "phone": "0987654321",
      "date": "20/06/2026",
      "time": "19:00",
      "pax": "4",
      "tables": "A1",
      "type": "Ăn thường",
      "note": ""
    },
    "items": [],
    "deposit": {
      "amount": 0,
      "isPaid": false
    },
    "idempotencyKey": "fnv1a_hash_here"
  }
  ```
- **Responses:**
  - `200 OK` (Synced successfully):
    ```json
    { "ok": true, "serverId": "bfa892a0-4ff1-4ab0", "version": 1 }
    ```
  - `409 Conflict` (Version or Slot conflict):
    ```json
    {
      "ok": false,
      "error": "CONFLICT",
      "conflictType": "table_time_overlap",
      "serverSnapshot": { ... }
    }
    ```
