-- 003_d1_schema.sql
-- Cloudflare D1 Database Schema (SQLite Compatible)

-- 1. Table: customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  normalized_phone TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. Table: bookings
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  normalized_phone TEXT,
  booking_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  table_id TEXT,
  guest_count INTEGER NOT NULL CHECK (guest_count > 0),
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT DEFAULT 'web',
  note TEXT,
  raw_message TEXT,
  device_id TEXT,
  idempotency_key TEXT UNIQUE,
  ordered_items TEXT DEFAULT '[]',
  total_amount REAL DEFAULT 0.00,
  deposit_amount REAL DEFAULT 0.00,
  is_deposited INTEGER DEFAULT 0,
  transfer_image TEXT,
  bill_url TEXT,
  staff TEXT,
  client_created_at TEXT,
  client_updated_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sheet_sync_pending INTEGER DEFAULT 0,
  pg_sync_failed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 3. Table: menu_items
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT,
  category TEXT,
  price REAL DEFAULT 0.00,
  aliases TEXT DEFAULT '[]',
  is_available INTEGER DEFAULT 1,
  source_sheet_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 4. Table: booking_corrections
CREATE TABLE IF NOT EXISTS booking_corrections (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  input_text TEXT,
  ai_output_json TEXT,
  corrected_output_json TEXT,
  correction_type TEXT,
  corrected_by TEXT,
  quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5),
  approved_for_learning INTEGER DEFAULT 0,
  pii_redacted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 5. Table: ai_usage_logs
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  provider TEXT,
  model TEXT,
  route TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms INTEGER,
  status TEXT,
  error_code TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 6. Table: audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for Cloudflare D1
CREATE INDEX IF NOT EXISTS idx_menu_items_name_lower ON menu_items(name_lower);
CREATE INDEX IF NOT EXISTS idx_bookings_phone_time ON bookings(normalized_phone, booking_date DESC, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_date_table_time ON bookings(booking_date, table_id, start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status_date ON bookings(status, booking_date);
CREATE INDEX IF NOT EXISTS idx_corrections_approved ON booking_corrections(approved_for_learning, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_logs(created_at DESC);
