-- ============================================================================
-- AeroPool — Migration: Production RLS Policies, Storage Hardening & RPC Alignment
-- Target: Supabase PostgreSQL (Version 15+)
-- Version: 20261016000001
-- ============================================================================

-- 1. ADD MISSING METADATA COLUMNS TO BOOKINGS TABLE
DO $$ BEGIN
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS passenger_name TEXT;
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS passenger_phone TEXT;
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES driver_profiles(id) ON DELETE SET NULL;
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_name TEXT;
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_phone TEXT;
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vehicle_plate TEXT;
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vehicle_model TEXT;
EXCEPTION WHEN others THEN null; END $$;

-- 2. ENABLE ROW LEVEL SECURITY ON ALL TABLES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE airports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_health_checks ENABLE ROW LEVEL SECURITY;

-- 2.1 RLS SECURITY DEFINER HELPER FUNCTIONS (PREVENTS RECURSION ON PROFILES)
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support', 'fleet_operator', 'driver'));
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_support()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support'));
$$;

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- 2.2 COLUMN TYPE SAFETY ALIGNMENT
DO $$ BEGIN
  ALTER TABLE pickup_zones ALTER COLUMN id TYPE TEXT;
  ALTER TABLE ride_pools ALTER COLUMN pickup_zone_id TYPE TEXT;
  ALTER TABLE ride_requests ALTER COLUMN pickup_zone_id TYPE TEXT;
EXCEPTION WHEN others THEN null; END $$;

-- 3. PROFILES POLICIES
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Staff can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins and support can view all profiles" ON profiles;
CREATE POLICY "Admins and support can view all profiles" ON profiles
  FOR SELECT USING (public.is_admin_or_support());

DROP POLICY IF EXISTS "Fleet operators can view drivers in their organization" ON profiles;
CREATE POLICY "Fleet operators can view drivers in their organization" ON profiles
  FOR SELECT USING (
    organization_id IS NOT NULL 
    AND organization_id = public.current_user_org_id()
    AND public.get_auth_role() = 'fleet_operator'
  );

-- 4. ORGANIZATIONS (FLEET OPERATOR TENANT ISOLATION)
DROP POLICY IF EXISTS "Fleet operators can view their own organization" ON organizations;
CREATE POLICY "Fleet operators can view their own organization" ON organizations
  FOR SELECT USING (organizations.id = public.current_user_org_id());

DROP POLICY IF EXISTS "Admins have full access to organizations" ON organizations;
CREATE POLICY "Admins have full access to organizations" ON organizations
  FOR ALL USING (public.is_admin());

-- 4.1 VEHICLES & DRIVER PROFILES (FLEET ISOLATION & ADMIN MANAGEMENT)
DROP POLICY IF EXISTS "fleet_own_vehicles" ON vehicles;
DROP POLICY IF EXISTS "Fleet operators own vehicles" ON vehicles;
CREATE POLICY "Fleet operators own vehicles" ON vehicles
  FOR ALL
  USING (
    organization_id = public.current_user_org_id() 
    AND public.get_auth_role() = 'fleet_operator'
  )
  WITH CHECK (
    organization_id = public.current_user_org_id() 
    AND public.get_auth_role() = 'fleet_operator'
  );

DROP POLICY IF EXISTS "Admins have full access to vehicles" ON vehicles;
CREATE POLICY "Admins have full access to vehicles" ON vehicles
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Drivers can view assigned vehicle" ON vehicles;
CREATE POLICY "Drivers can view assigned vehicle" ON vehicles
  FOR SELECT
  USING (assigned_driver_id = auth.uid());

DROP POLICY IF EXISTS "fleet_own_drivers" ON driver_profiles;
DROP POLICY IF EXISTS "Fleet operators own drivers" ON driver_profiles;
CREATE POLICY "Fleet operators own drivers" ON driver_profiles
  FOR ALL
  USING (
    organization_id = public.current_user_org_id() 
    AND public.get_auth_role() = 'fleet_operator'
  )
  WITH CHECK (
    organization_id = public.current_user_org_id() 
    AND public.get_auth_role() = 'fleet_operator'
  );

DROP POLICY IF EXISTS "Drivers can view their own driver profile" ON driver_profiles;
CREATE POLICY "Drivers can view their own driver profile" ON driver_profiles
  FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Admins have full access to driver profiles" ON driver_profiles;
CREATE POLICY "Admins have full access to driver profiles" ON driver_profiles
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. DRIVER DOCUMENTS (KYC PRIVACY)
DROP POLICY IF EXISTS "Drivers can view and upload their own documents" ON driver_documents;
CREATE POLICY "Drivers can view and upload their own documents" ON driver_documents
  FOR ALL USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Fleet operators can view their fleet drivers documents" ON driver_documents;
CREATE POLICY "Fleet operators can view their fleet drivers documents" ON driver_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM driver_profiles dp
      JOIN profiles p ON p.id = auth.uid()
      WHERE dp.id = driver_documents.driver_id 
      AND dp.organization_id = p.organization_id
      AND p.role = 'fleet_operator'
    )
  );

DROP POLICY IF EXISTS "Admins have full access to driver documents" ON driver_documents;
CREATE POLICY "Admins have full access to driver documents" ON driver_documents
  FOR ALL USING (public.is_admin());

-- 6. REFERENCE TABLES (AIRPORTS & PICKUP ZONES PUBLIC READ)
DROP POLICY IF EXISTS "Public read airports" ON airports;
CREATE POLICY "Public read airports" ON airports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read pickup zones" ON pickup_zones;
CREATE POLICY "Public read pickup zones" ON pickup_zones FOR SELECT USING (true);

-- 7. RIDE POOLS POLICIES
DROP POLICY IF EXISTS "Users can view active ride pools" ON ride_pools;
CREATE POLICY "Users can view active ride pools" ON ride_pools
  FOR SELECT USING (status NOT IN ('CANCELLED'));

DROP POLICY IF EXISTS "Drivers can view assigned pools" ON ride_pools;
CREATE POLICY "Drivers can view assigned pools" ON ride_pools
  FOR SELECT USING (assigned_driver_id = auth.uid());

DROP POLICY IF EXISTS "Admins and dispatchers have full access to pools" ON ride_pools;
CREATE POLICY "Admins and dispatchers have full access to pools" ON ride_pools
  FOR ALL USING (public.is_admin_or_support());

-- 8. PAYMENTS POLICIES
DROP POLICY IF EXISTS "Passengers can view their own payments" ON payments;
CREATE POLICY "Passengers can view their own payments" ON payments
  FOR SELECT USING (auth.uid() = passenger_id);

DROP POLICY IF EXISTS "Admins and support have full access to payments" ON payments;
CREATE POLICY "Admins and support have full access to payments" ON payments
  FOR ALL USING (public.is_admin_or_support());

-- 9. SAFETY INCIDENTS & SUPPORT TICKETS POLICIES
DROP POLICY IF EXISTS "Reporters can view their safety incidents" ON safety_incidents;
CREATE POLICY "Reporters can view their safety incidents" ON safety_incidents
  FOR ALL USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admins and support can view all safety incidents" ON safety_incidents;
CREATE POLICY "Admins and support can view all safety incidents" ON safety_incidents
  FOR ALL USING (public.is_admin_or_support());

DROP POLICY IF EXISTS "Users can view their support tickets" ON support_tickets;
CREATE POLICY "Users can view their support tickets" ON support_tickets
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins and support can view all tickets" ON support_tickets;
CREATE POLICY "Admins and support can view all tickets" ON support_tickets
  FOR ALL USING (public.is_admin_or_support());

-- 10. SYSTEM HEALTH CHECKS
DROP POLICY IF EXISTS "Admins can view health checks" ON system_health_checks;
CREATE POLICY "Admins can view health checks" ON system_health_checks
  FOR ALL USING (public.is_admin());

-- ============================================================================
-- 11. ATOMIC CONCURRENCY RESERVATION RPC (IDEMPOTENT & OPERATING-MODE AWARE)
-- ============================================================================
-- Drop legacy 13-parameter signature from Migration 1 to prevent PostgREST ambiguity
DROP FUNCTION IF EXISTS book_ride_atomic(UUID, UUID, INT, INT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT, TEXT);

CREATE OR REPLACE FUNCTION book_ride_atomic(
  p_pool_id UUID,
  p_passenger_id UUID,
  p_seats INT,
  p_luggage INT,
  p_flight_number TEXT,
  p_destination_name TEXT,
  p_destination_address TEXT,
  p_destination_corridor TEXT,
  p_destination_lat DOUBLE PRECISION,
  p_destination_lng DOUBLE PRECISION,
  p_fare_paise INT,
  p_savings_paise INT,
  p_payment_method TEXT,
  p_payment_id TEXT DEFAULT NULL,
  p_razorpay_order_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_operating_mode TEXT DEFAULT 'sandbox'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool ride_pools%ROWTYPE;
  v_zone pickup_zones%ROWTYPE;
  v_existing_booking bookings%ROWTYPE;
  v_booking_id UUID;
  v_payment_id UUID;
  v_otp TEXT;
  v_is_sandbox BOOLEAN;
  v_final_payment_id TEXT;
  v_final_order_id TEXT;
BEGIN
  -- 1. Idempotency Check: Return existing booking if key already processed
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_booking
    FROM bookings
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_existing_booking.id,
        'pickup_otp', v_existing_booking.pickup_otp,
        'is_duplicate', true,
        'message', 'Request was already processed (idempotency guard)'
      );
    END IF;
  END IF;

  -- 2. Validate Operating Mode and Mock Payments
  v_is_sandbox := (p_operating_mode != 'production');
  IF p_operating_mode = 'production' THEN
    IF p_payment_id IS NOT NULL AND p_payment_id LIKE 'pay_BOM_%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Production payment violation: Simulated sandbox payment IDs (pay_BOM_*) cannot be captured in production mode.'
      );
    END IF;
  END IF;

  -- 3. Row-level Lock on Ride Pool row to prevent race conditions
  SELECT * INTO v_pool
  FROM ride_pools
  WHERE id = p_pool_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ride pool was not found or has expired.');
  END IF;

  -- 4. Validate Seat & Luggage Capacity
  IF v_pool.available_seats < p_seats THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Insufficient seats remaining in pool (requested %s, only %s available).', p_seats, v_pool.available_seats)
    );
  END IF;

  IF v_pool.available_luggage < p_luggage THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Insufficient luggage space remaining (requested %s, only %s available).', p_luggage, v_pool.available_luggage)
    );
  END IF;

  IF v_pool.status IN ('COMPLETED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This ride pool has already concluded.');
  END IF;

  -- 5. Retrieve Pickup Zone Details
  SELECT * INTO v_zone FROM pickup_zones WHERE id = v_pool.pickup_zone_id;

  -- 6. Generate Random 4-digit OTP
  v_otp := lpad(floor(random() * 9000 + 1000)::text, 4, '0');

  -- 7. Decrement Capacity Atomically
  UPDATE ride_pools
  SET 
    available_seats = available_seats - p_seats,
    available_luggage = available_luggage - p_luggage,
    status = CASE WHEN status = 'REQUESTED' THEN 'CONFIRMED' ELSE status END
  WHERE id = p_pool_id;

  -- 8. Prepare Payment Identifiers
  v_final_order_id := COALESCE(p_razorpay_order_id, format('order_BOM_%s', substr(md5(random()::text), 1, 8)));
  v_final_payment_id := COALESCE(p_payment_id, CASE WHEN v_is_sandbox THEN format('pay_BOM_%s', substr(md5(random()::text), 1, 10)) ELSE NULL END);

  -- 9. Insert Booking Record
  INSERT INTO bookings (
    pool_id, passenger_id, flight_number, terminal,
    pickup_zone_name, pickup_instructions,
    destination_name, destination_address, destination_corridor,
    destination_lat, destination_lng,
    seats_booked, luggage_count, fare_paise, savings_paise,
    payment_id, payment_status, booking_status, pickup_otp,
    idempotency_key, operating_mode
  ) VALUES (
    p_pool_id, p_passenger_id, p_flight_number, v_pool.terminal,
    COALESCE(v_zone.name, 'CSMIA Pickup Bay'), COALESCE(v_zone.instructions, 'Meet driver at designated terminal pillar'),
    p_destination_name, p_destination_address, p_destination_corridor,
    p_destination_lat, p_destination_lng,
    p_seats, p_luggage, p_fare_paise, p_savings_paise,
    v_final_payment_id, 'captured', v_pool.status, v_otp,
    p_idempotency_key, p_operating_mode
  )
  RETURNING id INTO v_booking_id;

  -- 10. Insert Payment Ledger Entry
  INSERT INTO payments (
    booking_id, passenger_id, amount_paise, currency,
    razorpay_order_id, razorpay_payment_id, status, payment_method,
    is_sandbox, idempotency_key, operating_mode
  ) VALUES (
    v_booking_id, p_passenger_id, p_fare_paise, 'INR',
    v_final_order_id, v_final_payment_id, 'captured', p_payment_method,
    v_is_sandbox, 
    CASE WHEN p_idempotency_key IS NOT NULL THEN format('%s_pay', p_idempotency_key) ELSE NULL END,
    p_operating_mode
  )
  RETURNING id INTO v_payment_id;

  -- 11. Return Confirmation Payload
  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'payment_id', v_payment_id,
    'pickup_otp', v_otp,
    'remaining_seats', v_pool.available_seats - p_seats,
    'is_duplicate', false
  );
END;
$$;
