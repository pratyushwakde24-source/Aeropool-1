-- ============================================================================
-- AeroPool — Migration: Ride Requests Ledger & Atomic Cancellation
-- Target: Supabase PostgreSQL (Version 15+)
-- ============================================================================

-- 1. RIDE REQUESTS TABLE
CREATE TABLE IF NOT EXISTS ride_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  passenger_name TEXT NOT NULL,
  passenger_phone TEXT,
  flight_number TEXT NOT NULL,
  airline TEXT,
  origin_airport TEXT NOT NULL DEFAULT 'BOM',
  terminal TEXT NOT NULL CHECK (terminal IN ('T1', 'T2')),
  pickup_zone_id TEXT REFERENCES pickup_zones(id) ON DELETE SET NULL,
  destination_name TEXT NOT NULL,
  destination_address TEXT,
  destination_corridor TEXT NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  seats_needed INT NOT NULL DEFAULT 1 CHECK (seats_needed BETWEEN 1 AND 8),
  luggage_count INT NOT NULL DEFAULT 1 CHECK (luggage_count >= 0),
  max_wait_minutes INT NOT NULL DEFAULT 20 CHECK (max_wait_minutes BETWEEN 5 AND 60),
  ride_type TEXT NOT NULL DEFAULT 'SHARED_POOL' CHECK (ride_type IN ('SHARED_POOL', 'PRIVATE')),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'MATCHED', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  matched_pool_id UUID REFERENCES ride_pools(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient matching and passenger lookup
CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger ON ride_requests(passenger_id, status);
CREATE INDEX IF NOT EXISTS idx_ride_requests_corridor ON ride_requests(terminal, destination_corridor, status);
CREATE INDEX IF NOT EXISTS idx_ride_requests_created ON ride_requests(created_at DESC);

-- Enable RLS
ALTER TABLE ride_requests ENABLE ROW LEVEL SECURITY;

-- Passengers can view and manage their own ride requests
CREATE POLICY passenger_own_ride_requests ON ride_requests
  FOR ALL USING (auth.uid() = passenger_id);

-- Admins and Support staff have full visibility into ride requests
CREATE POLICY admin_support_ride_requests ON ride_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'support')
    )
  );

-- ============================================================================
-- ATOMIC CANCELLATION RPC (RESTORING CAPACITY & ISSUING REFUND)
-- ============================================================================
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
BEGIN
  -- 1. Lock the booking record
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking record not found.');
  END IF;

  -- 2. Authorization check: must be owner or admin
  IF v_booking.passenger_id != p_passenger_id THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_passenger_id AND role = 'admin') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You can only cancel your own booking.');
    END IF;
  END IF;

  -- 3. State check: cannot cancel in-progress or completed trips
  IF v_booking.booking_status IN ('IN_PROGRESS', 'COMPLETED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active or completed trips cannot be cancelled.');
  END IF;

  IF v_booking.booking_status = 'CANCELLED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking is already cancelled.');
  END IF;

  v_released_seats := v_booking.seats_booked;
  v_released_luggage := v_booking.luggage_count;

  -- 4. Lock and restore pool capacity
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

  -- 5. Mark booking as cancelled
  UPDATE bookings
  SET booking_status = 'CANCELLED'
  WHERE id = p_booking_id;

  -- 6. Update payment ledger with full refund
  UPDATE payments
  SET 
    status = 'refunded',
    refunded_amount_paise = amount_paise,
    refund_reason = p_reason
  WHERE booking_id = p_booking_id;

  -- 7. Record immutable audit entry
  INSERT INTO audit_logs (
    actor_id, actor_name, actor_role, action, entity_type, entity_id, details
  ) VALUES (
    p_passenger_id::text,
    v_booking.passenger_id::text,
    'passenger',
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
