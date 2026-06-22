-- 001_initial_schema.sql
-- Migration file to initialize Supabase PostgreSQL database schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- 1. Table: customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  phone TEXT,
  normalized_phone TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table: bookings
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  normalized_phone TEXT,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  table_id TEXT,
  guest_count INTEGER NOT NULL CHECK (guest_count > 0),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, cancelled, seated
  source TEXT DEFAULT 'web',
  note TEXT,
  raw_message TEXT,
  device_id TEXT,
  idempotency_key TEXT UNIQUE,
  ordered_items JSONB DEFAULT '[]'::jsonb,
  total_amount NUMERIC DEFAULT 0.00,
  deposit_amount NUMERIC DEFAULT 0.00,
  is_deposited BOOLEAN DEFAULT FALSE,
  transfer_image TEXT,
  bill_url TEXT,
  staff JSONB,
  client_created_at TIMESTAMPTZ,
  client_updated_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  version INTEGER NOT NULL DEFAULT 1,
  sheet_sync_pending BOOLEAN DEFAULT FALSE,
  pg_sync_failed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table: menu_items
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  name_lower TEXT GENERATED ALWAYS AS (LOWER(name)) STORED,
  category TEXT,
  price NUMERIC DEFAULT 0.00,
  aliases TEXT[] DEFAULT '{}',
  is_available BOOLEAN DEFAULT TRUE,
  source_sheet_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table: booking_corrections
CREATE TABLE IF NOT EXISTS booking_corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  input_text TEXT,
  ai_output_json JSONB,
  corrected_output_json JSONB,
  correction_type TEXT, -- wrong_name, wrong_phone, wrong_time, wrong_guest_count, wrong_menu_item, other
  corrected_by UUID,
  quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5),
  approved_for_learning BOOLEAN DEFAULT FALSE,
  pii_redacted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Table: ai_usage_logs
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Table: audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  before_json JSONB,
  after_json JSONB,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --- Database Indexes ---
CREATE INDEX IF NOT EXISTS idx_menu_items_name_lower ON menu_items(name_lower);
CREATE INDEX IF NOT EXISTS idx_menu_items_aliases_gin ON menu_items USING gin(aliases);
CREATE INDEX IF NOT EXISTS idx_bookings_phone_time ON bookings(normalized_phone, booking_date DESC, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_date_table_time ON bookings(booking_date, table_id, start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status_date ON bookings(status, booking_date);
CREATE INDEX IF NOT EXISTS idx_corrections_approved ON booking_corrections(approved_for_learning, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- --- Trigger for Automatically Updating Timestamp fields ---
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customers_modtime BEFORE UPDATE ON customers FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_bookings_modtime BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_menu_items_modtime BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
