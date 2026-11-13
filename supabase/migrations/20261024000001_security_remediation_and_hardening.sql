-- ============================================================================
-- AeroPool — Migration: Production Security Remediation & Access Control Hardening
-- Target: Supabase PostgreSQL (Version 15+)
-- Version: 20261024000001
-- Primary Reference: SUPABASE_MIGRATION_SECURITY_REVIEW.md
-- ============================================================================

-- 1. IMMUTABLE AUDIT LOGS ROW LEVEL SECURITY HARDENING
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;

-- Deny all direct client-side insertions, updates, or deletions
DROP POLICY IF EXISTS "Admins and support view audit logs" ON audit_logs;
CREATE POLICY "Admins and support view audit logs"
  ON audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_support());

DROP POLICY IF EXISTS "Service role manage audit logs" ON audit_logs;
CREATE POLICY "Service role manage audit logs"
  ON audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. RIDE POOLS RLS POLICY HARDENING (PREVENT ARBITRARY INSERTS WHILE PERMITTING VALID REQUESTS)
DROP POLICY IF EXISTS "Passengers create requested pools" ON ride_pools;
CREATE POLICY "Passengers create requested pools"
  ON ride_pools
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'REQUESTED'
    AND terminal IN ('T1', 'T2')
    AND airport_code = 'BOM'
    AND pickup_zone_id IS NOT NULL
    AND total_seats BETWEEN 1 AND 12
    AND available_seats BETWEEN 1 AND total_seats
    AND total_luggage_capacity BETWEEN 0 AND 10
    AND available_luggage BETWEEN 0 AND total_luggage_capacity
    AND assigned_driver_id IS NULL
    AND assigned_vehicle_id IS NULL
  );

-- 3. BOOKINGS RLS POLICIES FOR STAFF & FLEET OPERATORS
DROP POLICY IF EXISTS "admin_full_access_bookings" ON bookings;
DROP POLICY IF EXISTS "Staff full access bookings" ON bookings;
CREATE POLICY "Staff full access bookings"
  ON bookings
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_support())
  WITH CHECK (public.is_admin_or_support());

DROP POLICY IF EXISTS "Fleet operators view fleet bookings" ON bookings;
CREATE POLICY "Fleet operators view fleet bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ride_pools rp
      JOIN driver_profiles dp ON dp.id = rp.assigned_driver_id
      WHERE rp.id = bookings.pool_id
      AND dp.organization_id = public.current_user_org_id()
      AND public.get_auth_role() = 'fleet_operator'
    )
  );

-- 4. ORGANIZATIONS SUPPORT READ ACCESS
DROP POLICY IF EXISTS "Support can view organizations" ON organizations;
CREATE POLICY "Support can view organizations"
  ON organizations
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_support());

-- 5. PROFILES INSERT & UPDATE HARDENING (PREVENTS PRIVILEGE ESCALATION)
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND (role IS NULL OR role = 'passenger'::user_role)
  );

-- Trigger function for automatic signup provisioning
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'passenger'::user_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger preventing non-admins from escalating their role or changing organization via UPDATE
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT (SELECT public.is_admin()) AND (current_setting('request.jwt.claim.role', true) != 'service_role') THEN
      RAISE EXCEPTION 'Unauthorized: Users cannot alter their own role.';
    END IF;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    IF NOT (SELECT public.is_admin()) AND (current_setting('request.jwt.claim.role', true) != 'service_role') THEN
      RAISE EXCEPTION 'Unauthorized: Users cannot alter their organization membership.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- 6. AUTHORIZED POOL CREATION RPC (VALIDATES CORRIDOR, TERMINAL, CAPACITIES & PASSENGER INVARIANTS)
CREATE OR REPLACE FUNCTION request_ride_pool_atomic(
  p_airport_code TEXT,
  p_terminal TEXT,
  p_pickup_zone_id TEXT,
  p_target_corridor TEXT,
  p_departure_window_start TIMESTAMPTZ,
  p_departure_window_end TIMESTAMPTZ,
  p_vehicle_category vehicle_category,
  p_seats INT,
  p_luggage INT,
  p_passenger_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_pool_id UUID;
  v_is_service_role BOOLEAN;
  v_caller_id UUID;
BEGIN
  v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');
  v_caller_id := auth.uid();

  -- Authorization check:
  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Authentication required to request a ride pool.');
    END IF;

    IF v_caller_id != p_passenger_id AND NOT (SELECT public.is_admin()) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Cannot create a pool for another passenger.');
    END IF;
  END IF;

  -- Validate inputs:
  IF p_terminal NOT IN ('T1', 'T2') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid terminal: Must be T1 or T2.');
  END IF;

  IF p_airport_code != 'BOM' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid airport: Only CSMIA BOM is currently active.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pickup_zones WHERE id = p_pickup_zone_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid pickup zone.');
  END IF;

  IF p_seats < 1 OR p_seats > 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid seats requested.');
  END IF;

  IF p_departure_window_end <= p_departure_window_start THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid departure window.');
  END IF;

  -- Insert new requested pool
  INSERT INTO ride_pools (
    airport_code, terminal, pickup_zone_id, target_corridor,
    departure_window_start, departure_window_end,
    vehicle_category,
    total_seats, available_seats,
    total_luggage_capacity, available_luggage,
    status
  ) VALUES (
    p_airport_code, p_terminal, p_pickup_zone_id, p_target_corridor,
    p_departure_window_start, p_departure_window_end,
    p_vehicle_category,
    GREATEST(4, p_seats + 2), GREATEST(4, p_seats + 2),
    GREATEST(3, p_luggage + 1), GREATEST(3, p_luggage + 1),
    'REQUESTED'
  )
  RETURNING id INTO v_new_pool_id;

  RETURN jsonb_build_object(
    'success', true,
    'pool_id', v_new_pool_id,
    'status', 'REQUESTED'
  );
END;
$$;

-- 7. REMEDIATED CANCEL_BOOKING_ATOMIC (STRICT AUTH.UID() BINDING & SPOOFING PREVENTION)
CREATE OR REPLACE FUNCTION cancel_booking_atomic(
  p_booking_id UUID,
  p_passenger_id UUID,
  p_reason TEXT DEFAULT 'Passenger cancelled prior to pickup'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_pool ride_pools%ROWTYPE;
  v_released_seats INT;
  v_released_luggage INT;
  v_caller_role TEXT;
  v_caller_id UUID;
  v_is_service_role BOOLEAN;
BEGIN
  -- 1. Lock the booking record
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking record not found.');
  END IF;

  -- 2. Identify caller context
  v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');
  v_caller_id := auth.uid();

  -- 3. Strict Caller Authorization Guard:
  -- Block anonymous callers immediately
  IF NOT v_is_service_role AND v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Authentication required to cancel bookings.');
  END IF;

  -- Verify identity: Caller must be service_role, booking owner, or admin/support staff
  IF v_is_service_role THEN
    -- In service role, p_passenger_id must match booking owner or an administrator/support user
    IF p_passenger_id != v_booking.passenger_id AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_passenger_id AND role IN ('admin', 'support')) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Invalid actor specified for service cancellation.');
    END IF;
  ELSE
    -- PostgREST Authenticated Caller:
    IF v_caller_id != v_booking.passenger_id THEN
      IF NOT (SELECT public.is_admin_or_support()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You can only cancel your own booking.');
      END IF;
    END IF;

    -- Prevent parameter spoofing: If booking owner is cancelling, p_passenger_id must match auth.uid()
    IF v_caller_id = v_booking.passenger_id AND p_passenger_id != v_caller_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Passenger ID parameter mismatch.');
    END IF;
  END IF;

  -- 4. State check: cannot cancel in-progress or completed trips
  IF v_booking.booking_status IN ('IN_PROGRESS', 'COMPLETED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active or completed trips cannot be cancelled.');
  END IF;

  IF v_booking.booking_status = 'CANCELLED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking is already cancelled.');
  END IF;

  v_released_seats := v_booking.seats_booked;
  v_released_luggage := v_booking.luggage_count;

  -- 5. Lock and restore pool capacity
  SELECT * INTO v_pool
  FROM ride_pools
  WHERE id = v_booking.pool_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE ride_pools
    SET 
      available_seats = LEAST(total_seats, available_seats + v_released_seats),
      available_luggage = LEAST(total_luggage_capacity, available_luggage + v_released_luggage)
    WHERE id = v_booking.pool_id;
  END IF;

  -- 6. Mark booking as cancelled
  UPDATE bookings
  SET booking_status = 'CANCELLED'
  WHERE id = p_booking_id;

  -- 7. Update payment ledger with full refund
  UPDATE payments
  SET 
    status = 'refunded',
    refunded_amount_paise = amount_paise,
    refund_reason = p_reason
  WHERE booking_id = p_booking_id;

  -- 8. Record immutable audit entry
  v_caller_role := CASE 
    WHEN v_is_service_role THEN 'admin'
    WHEN (SELECT public.is_admin_or_support()) THEN 'admin'
    ELSE 'passenger'
  END;

  INSERT INTO audit_logs (
    actor_id, actor_name, actor_role, action, entity_type, entity_id, details
  ) VALUES (
    COALESCE(v_caller_id::text, p_passenger_id::text, 'service_role'),
    CASE WHEN v_is_service_role THEN 'Backend Service' ELSE COALESCE(v_caller_id::text, 'Passenger') END,
    v_caller_role::user_role,
    'CANCEL_BOOKING',
    'BOOKING',
    p_booking_id::text,
    format('Cancelled booking %s. Restored %s seat(s) to pool %s. Issued refund ₹%s.',
      p_booking_id, v_released_seats, v_booking.pool_id, (v_booking.fare_paise / 100.0)::text)
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'pool_id', v_booking.pool_id,
    'released_seats', v_released_seats,
    'released_luggage', v_released_luggage,
    'refund_amount_paise', v_booking.fare_paise
  );
END;
$$;

-- 8. REMEDIATED BOOK_RIDE_ATOMIC (AUTH.UID() BINDING, FARE THRESHOLDS & PASSENGER METADATA)
-- Drop previous signatures to prevent PostgREST ambiguity
DROP FUNCTION IF EXISTS book_ride_atomic(UUID, UUID, INT, INT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT, TEXT);
DROP FUNCTION IF EXISTS book_ride_atomic(UUID, UUID, INT, INT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT);

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
  p_operating_mode TEXT DEFAULT 'sandbox',
  p_passenger_name TEXT DEFAULT NULL,
  p_passenger_phone TEXT DEFAULT NULL
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
  v_passenger_profile profiles%ROWTYPE;
  v_payment_order payment_orders%ROWTYPE;
  v_booking_id UUID;
  v_payment_id UUID;
  v_otp TEXT;
  v_is_sandbox BOOLEAN;
  v_final_payment_id TEXT;
  v_final_order_id TEXT;
  v_final_passenger_name TEXT;
  v_final_passenger_phone TEXT;
  v_is_service_role BOOLEAN;
  v_caller_id UUID;
BEGIN
  -- 1. Identify caller context
  v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');
  v_caller_id := auth.uid();

  -- 2. Strict Caller Authorization Guard:
  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Authentication required to book a ride.');
    END IF;

    -- Passenger can only book for themselves, unless caller is an administrator
    IF v_caller_id != p_passenger_id THEN
      IF NOT (SELECT public.is_admin()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You can only book rides for your own authenticated profile.');
      END IF;
    END IF;
  END IF;

  -- 3. Idempotency Check: Return existing booking if key already processed
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

  -- 4. Fare Integrity & Validation Guards:
  IF p_fare_paise <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid fare: Fare amount must be greater than zero.');
  END IF;

  -- Enforce minimum base fare threshold (PRICING_CONSTANTS.BASE_FARE_PAISE: 15,000 paise / ₹150.00)
  IF p_fare_paise < 15000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Invalid fare: Fare ₹%s is below the minimum airport corridor base fare of ₹150.00.', (p_fare_paise / 100.0)::text)
    );
  END IF;

  -- 5. Operating Mode & Payment Integrity Validation
  v_is_sandbox := (p_operating_mode != 'production');

  IF p_operating_mode = 'production' THEN
    -- In production mode, require authoritative server-registered order and valid Razorpay payment
    IF p_razorpay_order_id IS NULL OR p_razorpay_order_id = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Production payment violation: An authorized razorpay_order_id is required in production mode.'
      );
    END IF;

    SELECT * INTO v_payment_order FROM payment_orders WHERE id = p_razorpay_order_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Payment order not found: No registered order exists for this booking.'
      );
    END IF;

    IF v_payment_order.amount_paise != p_fare_paise THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Payment mismatch: Requested fare (%s paise) does not match authorized order amount (%s paise).', p_fare_paise, v_payment_order.amount_paise)
      );
    END IF;

    IF v_payment_order.passenger_id != p_passenger_id::text THEN
      RETURN jsonb_build_object('success', false, 'error', 'Payment authorization mismatch: Order was generated for a different passenger.');
    END IF;

    IF p_payment_id IS NULL OR p_payment_id = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Production payment violation: A valid verified razorpay_payment_id is required in production mode.'
      );
    END IF;

    IF p_payment_id LIKE 'pay_BOM_%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Production payment violation: Simulated sandbox payment IDs (pay_BOM_*) cannot be captured in production mode.'
      );
    END IF;
  ELSE
    -- Sandbox mode: reconcile order if order_id is provided
    IF p_razorpay_order_id IS NOT NULL THEN
      SELECT * INTO v_payment_order FROM payment_orders WHERE id = p_razorpay_order_id;
      IF FOUND THEN
        IF v_payment_order.amount_paise != p_fare_paise THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', format('Payment mismatch: Requested fare (%s paise) does not match authorized order amount (%s paise).', p_fare_paise, v_payment_order.amount_paise)
          );
        END IF;
        IF v_payment_order.passenger_id != p_passenger_id::text THEN
          RETURN jsonb_build_object('success', false, 'error', 'Payment authorization mismatch: Order was generated for a different passenger.');
        END IF;
      END IF;
    END IF;
  END IF;

  -- 6. Row-level Lock on Ride Pool row to prevent race conditions
  SELECT * INTO v_pool
  FROM ride_pools
  WHERE id = p_pool_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ride pool was not found or has expired.');
  END IF;

  -- 7. Validate Seat & Luggage Capacity
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

  -- 8. Retrieve Pickup Zone Details
  SELECT * INTO v_zone FROM pickup_zones WHERE id = v_pool.pickup_zone_id;

  -- 9. Retrieve Passenger Profile for denormalized contact fields
  SELECT * INTO v_passenger_profile FROM profiles WHERE id = p_passenger_id;
  v_final_passenger_name := COALESCE(p_passenger_name, v_passenger_profile.full_name, 'Passenger');
  v_final_passenger_phone := COALESCE(p_passenger_phone, v_passenger_profile.phone, '');

  -- 10. Generate Random 4-digit OTP
  v_otp := lpad(floor(random() * 9000 + 1000)::text, 4, '0');

  -- 11. Decrement Capacity Atomically
  UPDATE ride_pools
  SET 
    available_seats = available_seats - p_seats,
    available_luggage = available_luggage - p_luggage,
    status = CASE WHEN status = 'REQUESTED' THEN 'CONFIRMED' ELSE status END
  WHERE id = p_pool_id;

  -- 12. Prepare Payment Identifiers
  v_final_order_id := COALESCE(p_razorpay_order_id, format('order_BOM_%s', substr(md5(random()::text), 1, 8)));
  v_final_payment_id := COALESCE(p_payment_id, CASE WHEN v_is_sandbox THEN format('pay_BOM_%s', substr(md5(random()::text), 1, 10)) ELSE NULL END);

  -- 13. Insert Booking Record with Denormalized Passenger Metadata
  INSERT INTO bookings (
    pool_id, passenger_id, passenger_name, passenger_phone,
    flight_number, terminal,
    pickup_zone_name, pickup_instructions,
    destination_name, destination_address, destination_corridor,
    destination_lat, destination_lng,
    seats_booked, luggage_count, fare_paise, savings_paise,
    payment_id, payment_status, booking_status, pickup_otp,
    idempotency_key, operating_mode
  ) VALUES (
    p_pool_id, p_passenger_id, v_final_passenger_name, v_final_passenger_phone,
    p_flight_number, v_pool.terminal,
    COALESCE(v_zone.name, 'CSMIA Pickup Bay'), COALESCE(v_zone.instructions, 'Meet driver at designated terminal pillar'),
    p_destination_name, p_destination_address, p_destination_corridor,
    p_destination_lat, p_destination_lng,
    p_seats, p_luggage, p_fare_paise, p_savings_paise,
    v_final_payment_id, 'captured', v_pool.status, v_otp,
    p_idempotency_key, p_operating_mode
  )
  RETURNING id INTO v_booking_id;

  -- 14. Insert Payment Ledger Entry
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

  -- 15. Return Confirmation Payload
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

-- 9. REMEDIATED ASSIGN_DRIVER_TO_POOL_ATOMIC (MULTI-TENANT ISOLATION & METADATA PROPAGATION)
CREATE OR REPLACE FUNCTION assign_driver_to_pool_atomic(
  p_pool_id UUID,
  p_driver_id UUID,
  p_vehicle_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool ride_pools%ROWTYPE;
  v_driver driver_profiles%ROWTYPE;
  v_vehicle vehicles%ROWTYPE;
  v_driver_profile profiles%ROWTYPE;
  v_is_service_role BOOLEAN;
  v_caller_role TEXT;
  v_caller_org_id UUID;
BEGIN
  -- 1. Identify caller context
  v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');

  -- 2. Caller Authorization Guard:
  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Authentication required to assign dispatch assets.');
    END IF;

    v_caller_role := (SELECT public.get_auth_role());
    v_caller_org_id := (SELECT public.current_user_org_id());

    -- Only admin, support, or fleet_operator can assign drivers
    IF NOT (SELECT public.is_admin_or_support()) AND v_caller_role != 'fleet_operator' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only dispatchers, administrators, or fleet operators can assign drivers.');
    END IF;

    -- Fleet operator must have an associated organization
    IF v_caller_role = 'fleet_operator' AND v_caller_org_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Fleet operator is not assigned to an active organization.');
    END IF;
  END IF;

  -- 3. Lock and verify the ride pool
  SELECT * INTO v_pool
  FROM ride_pools
  WHERE id = p_pool_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ride pool not found or closed.');
  END IF;

  IF v_pool.status IN ('COMPLETED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot assign driver to a concluded pool.');
  END IF;

  -- 4. Lock and verify driver eligibility and KYC status
  SELECT * INTO v_driver
  FROM driver_profiles
  WHERE id = p_driver_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Driver profile not found.');
  END IF;

  IF v_driver.verification_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Driver KYC is not approved.');
  END IF;

  -- 5. Lock and verify vehicle eligibility
  SELECT * INTO v_vehicle
  FROM vehicles
  WHERE id = p_vehicle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assigned vehicle not found.');
  END IF;

  IF v_vehicle.status != 'ACTIVE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vehicle is offline or in maintenance.');
  END IF;

  -- 6. MULTI-TENANT ISOLATION: Driver and Vehicle MUST belong to the same organization
  IF v_driver.organization_id IS DISTINCT FROM v_vehicle.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Multi-tenant violation: Driver and vehicle do not belong to the same fleet organization.');
  END IF;

  -- If caller is a fleet operator, assets must belong to the caller's organization
  IF NOT v_is_service_role AND v_caller_role = 'fleet_operator' THEN
    IF v_driver.organization_id IS DISTINCT FROM v_caller_org_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tenant isolation violation: Fleet operators can only assign drivers and vehicles within their own organization.');
    END IF;
  END IF;

  -- 7. Update the ride pool with assigned driver & vehicle
  UPDATE ride_pools
  SET
    assigned_driver_id = p_driver_id,
    assigned_vehicle_id = p_vehicle_id,
    status = 'DRIVER_ASSIGNED'
  WHERE id = p_pool_id;

  -- 8. Update driver availability and active vehicle
  UPDATE driver_profiles
  SET 
    is_available = FALSE,
    assigned_vehicle_id = p_vehicle_id
  WHERE id = p_driver_id;

  -- 9. Propagate driver & vehicle metadata to pool bookings for passenger view
  SELECT * INTO v_driver_profile FROM profiles WHERE id = p_driver_id;

  UPDATE bookings
  SET
    driver_id = p_driver_id,
    driver_name = v_driver_profile.full_name,
    driver_phone = v_driver_profile.phone,
    vehicle_plate = v_vehicle.plate_number,
    vehicle_model = v_vehicle.make_model
  WHERE pool_id = p_pool_id;

  -- 10. Record immutable audit log
  INSERT INTO audit_logs (
    actor_id, actor_name, actor_role, action, entity_type, entity_id, details
  ) VALUES (
    COALESCE(auth.uid()::text, p_actor_id::text, 'service_role'),
    CASE WHEN v_is_service_role THEN 'System Dispatcher' ELSE COALESCE(v_caller_role, 'admin') END,
    'admin',
    'ASSIGN_DRIVER',
    'POOL',
    p_pool_id::text,
    format('Assigned driver %s and vehicle %s (%s) to pool %s.',
      p_driver_id, p_vehicle_id, v_vehicle.plate_number, p_pool_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'pool_id', p_pool_id,
    'driver_id', p_driver_id,
    'driver_name', v_driver_profile.full_name,
    'vehicle_id', p_vehicle_id,
    'vehicle_plate', v_vehicle.plate_number
  );
END;
$$;

-- 10. REMEDIATED ADVANCE_RIDE_STATUS_ATOMIC (ASSIGNED DRIVER & DISPATCH AUTHORIZATION)
CREATE OR REPLACE FUNCTION advance_ride_status_atomic(
  p_pool_id UUID,
  p_actor_id UUID,
  p_new_status ride_status
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool ride_pools%ROWTYPE;
  v_valid_transition BOOLEAN := FALSE;
  v_is_service_role BOOLEAN;
  v_caller_id UUID;
BEGIN
  -- 1. Lock the ride pool row
  SELECT * INTO v_pool
  FROM ride_pools
  WHERE id = p_pool_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ride pool not found.');
  END IF;

  -- 2. Identify caller context
  v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');
  v_caller_id := auth.uid();

  -- 3. Strict Caller Authorization Guard:
  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Authentication required to advance ride status.');
    END IF;

    -- Only admin, support, or the driver assigned specifically to this pool can advance status
    IF NOT (SELECT public.is_admin_or_support()) THEN
      IF v_pool.assigned_driver_id IS NULL OR v_pool.assigned_driver_id != v_caller_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only the assigned driver or operations dispatchers can update trip status.');
      END IF;
    END IF;
  END IF;

  -- 4. State Machine Transition Verification
  IF (v_pool.status = 'REQUESTED' AND p_new_status IN ('CONFIRMED', 'CANCELLED')) OR
     (v_pool.status = 'CONFIRMED' AND p_new_status IN ('DRIVER_ASSIGNED', 'CANCELLED')) OR
     (v_pool.status = 'DRIVER_ASSIGNED' AND p_new_status IN ('DRIVER_EN_ROUTE', 'CANCELLED')) OR
     (v_pool.status = 'DRIVER_EN_ROUTE' AND p_new_status IN ('DRIVER_ARRIVED', 'CANCELLED')) OR
     (v_pool.status = 'DRIVER_ARRIVED' AND p_new_status IN ('PICKUP_CONFIRMED', 'CANCELLED')) OR
     (v_pool.status = 'PICKUP_CONFIRMED' AND p_new_status IN ('IN_PROGRESS', 'CANCELLED')) OR
     (v_pool.status = 'IN_PROGRESS' AND p_new_status = 'COMPLETED') THEN
    v_valid_transition := TRUE;
  END IF;

  IF NOT v_valid_transition THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Invalid state transition from %s to %s.', v_pool.status, p_new_status)
    );
  END IF;

  -- 5. Update ride pool status
  UPDATE ride_pools
  SET status = p_new_status
  WHERE id = p_pool_id;

  -- 6. Propagate state change to all active bookings in this pool
  UPDATE bookings
  SET booking_status = p_new_status
  WHERE pool_id = p_pool_id AND booking_status != 'CANCELLED';

  -- 7. If COMPLETED, free up driver
  IF p_new_status = 'COMPLETED' AND v_pool.assigned_driver_id IS NOT NULL THEN
    UPDATE driver_profiles
    SET 
      is_available = TRUE,
      total_trips = total_trips + 1
    WHERE id = v_pool.assigned_driver_id;
  END IF;

  -- 8. Audit Trail
  INSERT INTO audit_logs (
    actor_id, actor_name, actor_role, action, entity_type, entity_id, details
  ) VALUES (
    COALESCE(v_caller_id::text, p_actor_id::text, 'service_role'),
    CASE WHEN v_is_service_role THEN 'State Controller' ELSE 'Staff/Driver' END,
    CASE WHEN v_is_service_role OR (SELECT public.is_admin_or_support()) THEN 'admin'::user_role ELSE 'driver'::user_role END,
    'ADVANCE_RIDE_STATUS',
    'POOL',
    p_pool_id::text,
    format('Advanced pool %s status from %s to %s.', p_pool_id, v_pool.status, p_new_status)
  );

  RETURN jsonb_build_object(
    'success', true,
    'pool_id', p_pool_id,
    'previous_status', v_pool.status,
    'new_status', p_new_status
  );
END;
$$;

-- 11. FUNCTION EXECUTION PERMISSION HARDENING (RESTRICT SENSITIVE RPCS)
REVOKE EXECUTE ON FUNCTION claim_webhook_event_atomic(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_webhook_event_atomic(TEXT, TEXT, TEXT, JSONB) TO service_role;

GRANT EXECUTE ON FUNCTION book_ride_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cancel_booking_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION assign_driver_to_pool_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION advance_ride_status_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION request_ride_pool_atomic TO authenticated, service_role;

-- 12. IDEMPOTENT REALTIME PUBLICATION VERIFICATION WITHOUT SWALLOWED EXCEPTIONS
DO $$ 
DECLARE
  v_pub_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') INTO v_pub_exists;
  IF v_pub_exists THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bookings') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ride_pools') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE ride_pools;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'driver_profiles') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE driver_profiles;
    END IF;
  END IF;
END $$;
