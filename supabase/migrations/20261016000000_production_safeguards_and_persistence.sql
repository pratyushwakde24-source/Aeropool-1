-- ============================================================================
-- AeroPool — Migration: Production Safeguards, Idempotency & Driver Assignment
-- Target: Supabase PostgreSQL (Version 15+)
-- Version: 20261016000000
-- ============================================================================

-- 1. SYSTEM HEALTH CHECKS AUDIT TABLE
CREATE TABLE IF NOT EXISTS system_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_mode TEXT NOT NULL DEFAULT 'production',
  subsystem_name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  ping_ms NUMERIC(6,2),
  summary TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_checks_time ON system_health_checks(checked_at DESC);

-- 2. ADD IDEMPOTENCY & OPERATING MODE TO BOOKINGS AND PAYMENTS
DO $$ BEGIN
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS operating_mode TEXT NOT NULL DEFAULT 'sandbox';
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS operating_mode TEXT NOT NULL DEFAULT 'sandbox';
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
EXCEPTION WHEN others THEN null; END $$;

-- 3. FINANCIAL INTEGRITY CONSTRAINTS:
-- Prevent mock/sandbox payment IDs from being recorded as live captured payments in production
DO $$ BEGIN
  ALTER TABLE payments 
    DROP CONSTRAINT IF EXISTS check_production_payment_id,
    ADD CONSTRAINT check_production_payment_id 
    CHECK (
      operating_mode != 'production' 
      OR (razorpay_payment_id IS NOT NULL AND razorpay_payment_id NOT LIKE 'pay_BOM_%')
    );
EXCEPTION WHEN others THEN null; END $$;

-- 4. ATOMIC DRIVER ASSIGNMENT RPC (PREVENTS DOUBLE DISPATCH CONFLICTS)
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
BEGIN
  -- 1. Lock the ride pool row
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

  -- 2. Verify driver eligibility and status
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

  -- 3. Verify vehicle eligibility
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

  -- 4. Update the ride pool with assigned driver & vehicle
  UPDATE ride_pools
  SET
    assigned_driver_id = p_driver_id,
    assigned_vehicle_id = p_vehicle_id,
    status = 'DRIVER_ASSIGNED'
  WHERE id = p_pool_id;

  -- 5. Update driver availability and active vehicle
  UPDATE driver_profiles
  SET 
    is_available = FALSE,
    assigned_vehicle_id = p_vehicle_id
  WHERE id = p_driver_id;

  -- 6. Record immutable audit log
  INSERT INTO audit_logs (
    actor_id, actor_name, actor_role, action, entity_type, entity_id, details
  ) VALUES (
    p_actor_id::text,
    'System Dispatcher',
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
    'vehicle_id', p_vehicle_id,
    'vehicle_plate', v_vehicle.plate_number
  );
END;
$$;

-- 5. ATOMIC RIDE STATUS ADVANCEMENT WITH STATE MACHINE VALIDATION
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
BEGIN
  -- 1. Lock the ride pool row
  SELECT * INTO v_pool
  FROM ride_pools
  WHERE id = p_pool_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ride pool not found.');
  END IF;

  -- 2. State Machine Transition Verification
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

  -- 3. Update ride pool status
  UPDATE ride_pools
  SET status = p_new_status
  WHERE id = p_pool_id;

  -- 4. Propagate state change to all active bookings in this pool
  UPDATE bookings
  SET booking_status = p_new_status
  WHERE pool_id = p_pool_id AND booking_status != 'CANCELLED';

  -- 5. If COMPLETED, free up driver
  IF p_new_status = 'COMPLETED' AND v_pool.assigned_driver_id IS NOT NULL THEN
    UPDATE driver_profiles
    SET 
      is_available = TRUE,
      total_trips = total_trips + 1
    WHERE id = v_pool.assigned_driver_id;
  END IF;

  -- 6. Audit Trail
  INSERT INTO audit_logs (
    actor_id, actor_name, actor_role, action, entity_type, entity_id, details
  ) VALUES (
    p_actor_id::text,
    'State Controller',
    'admin',
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
