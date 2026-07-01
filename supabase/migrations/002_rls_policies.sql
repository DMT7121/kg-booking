-- 002_rls_policies.sql
-- Enable Row Level Security (RLS) on all tables and define access control policies

-- Helper to extract user role from JWT claims (Strictly app_metadata)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::json->'app_metadata'->>'role', ''),
    'staff'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Table: customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_select_policy" 
ON customers FOR SELECT 
TO authenticated 
USING (TRUE);

CREATE POLICY "customer_insert_policy" 
ON customers FOR INSERT 
TO authenticated 
WITH CHECK (get_user_role() IN ('staff', 'manager', 'admin'));

CREATE POLICY "customer_update_policy" 
ON customers FOR UPDATE 
TO authenticated 
USING (get_user_role() IN ('staff', 'manager', 'admin'))
WITH CHECK (get_user_role() IN ('staff', 'manager', 'admin'));

CREATE POLICY "customer_delete_policy" 
ON customers FOR DELETE 
TO authenticated 
USING (get_user_role() = 'admin');


-- 2. Table: bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings_select_policy" 
ON bookings FOR SELECT 
TO authenticated 
USING (TRUE);

CREATE POLICY "bookings_insert_policy" 
ON bookings FOR INSERT 
TO authenticated 
WITH CHECK (get_user_role() IN ('staff', 'manager', 'admin'));

CREATE POLICY "bookings_update_policy" 
ON bookings FOR UPDATE 
TO authenticated 
USING (get_user_role() IN ('staff', 'manager', 'admin'))
WITH CHECK (get_user_role() IN ('staff', 'manager', 'admin'));

CREATE POLICY "bookings_delete_policy" 
ON bookings FOR DELETE 
TO authenticated 
USING (get_user_role() IN ('manager', 'admin'));


-- 3. Table: menu_items
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_items_select_policy" 
ON menu_items FOR SELECT 
TO authenticated, anon 
USING (TRUE);

CREATE POLICY "menu_items_insert_policy" 
ON menu_items FOR INSERT 
TO authenticated 
WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "menu_items_update_policy" 
ON menu_items FOR UPDATE 
TO authenticated 
USING (get_user_role() = 'admin')
WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "menu_items_delete_policy" 
ON menu_items FOR DELETE 
TO authenticated 
USING (get_user_role() = 'admin');


-- 4. Table: booking_corrections
ALTER TABLE booking_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corrections_select_policy" 
ON booking_corrections FOR SELECT 
TO authenticated 
USING (TRUE);

CREATE POLICY "corrections_insert_policy" 
ON booking_corrections FOR INSERT 
TO authenticated 
WITH CHECK (get_user_role() IN ('staff', 'manager', 'admin'));

CREATE POLICY "corrections_update_policy" 
ON booking_corrections FOR UPDATE 
TO authenticated 
USING (get_user_role() IN ('manager', 'admin'))
WITH CHECK (get_user_role() IN ('manager', 'admin'));

CREATE POLICY "corrections_delete_policy" 
ON booking_corrections FOR DELETE 
TO authenticated 
USING (get_user_role() = 'admin');


-- 5. Table: ai_usage_logs
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_select_policy" 
ON ai_usage_logs FOR SELECT 
TO authenticated 
USING (get_user_role() = 'admin');

CREATE POLICY "ai_usage_insert_policy" 
ON ai_usage_logs FOR INSERT 
TO authenticated 
WITH CHECK (TRUE);


-- 6. Table: audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_policy" 
ON audit_logs FOR SELECT 
TO authenticated 
USING (get_user_role() = 'admin');

CREATE POLICY "audit_logs_insert_policy" 
ON audit_logs FOR INSERT 
TO authenticated 
WITH CHECK (TRUE);
