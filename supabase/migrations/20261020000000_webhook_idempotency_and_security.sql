-- ============================================================================
-- AeroPool — Migration: Persistent Webhook Idempotency, Order Reconciliation & Payment Security
-- Target: Supabase PostgreSQL (Version 15+)
-- Version: 20261020000000
-- ============================================================================

-- 1. PROCESSED WEBHOOK EVENTS TABLE (DURABLE CROSS-INSTANCE IDEMPOTENCY)
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  payload_hash TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON processed_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON processed_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON processed_webhook_events(created_at DESC);

-- 2. PAYMENT ORDERS RECONCILIATION TABLE
CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY, -- Razorpay order_id (e.g. order_xxx or order_sandbox_xxx)
  booking_id TEXT NOT NULL,
  passenger_id TEXT NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PAID', 'FAILED', 'EXPIRED')),
  payment_id TEXT,
  signature TEXT,
  is_sandbox BOOLEAN NOT NULL DEFAULT false,
  operating_mode TEXT NOT NULL DEFAULT 'production',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_booking ON payment_orders(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_passenger ON payment_orders(passenger_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

-- 3.1 RLS POLICIES FOR PROCESSED WEBHOOK EVENTS (SERVICE ROLE ONLY)
-- Strict isolation: Anonymous and regular authenticated users cannot view or manipulate webhook events
DROP POLICY IF EXISTS "Webhook events service role access" ON processed_webhook_events;
CREATE POLICY "Webhook events service role access"
  ON processed_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3.2 RLS POLICIES FOR PAYMENT ORDERS
-- Passengers can view their own payment orders
DROP POLICY IF EXISTS "Passengers view own payment orders" ON payment_orders;
CREATE POLICY "Passengers view own payment orders"
  ON payment_orders
  FOR SELECT
  TO authenticated
  USING (passenger_id = auth.uid()::text OR public.is_admin());

-- Service role full access for payment orders reconciliation
DROP POLICY IF EXISTS "Service role payment orders access" ON payment_orders;
CREATE POLICY "Service role payment orders access"
  ON payment_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. ATOMIC TRANSACTIONAL WEBHOOK CLAIM RPC
CREATE OR REPLACE FUNCTION claim_webhook_event_atomic(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payload_hash TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing processed_webhook_events%ROWTYPE;
BEGIN
  -- Check if event already exists
  SELECT * INTO v_existing
  FROM processed_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_duplicate', true,
      'status', v_existing.status,
      'message', 'Event already registered in idempotency ledger'
    );
  END IF;

  -- Insert new processing entry atomically
  INSERT INTO processed_webhook_events (
    event_id,
    event_type,
    status,
    payload_hash,
    payload,
    created_at
  ) VALUES (
    p_event_id,
    p_event_type,
    'PROCESSING',
    p_payload_hash,
    p_payload,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'is_duplicate', false,
    'status', 'PROCESSING',
    'message', 'Event claimed for processing'
  );
EXCEPTION WHEN unique_violation THEN
  -- Concurrency race condition caught
  SELECT * INTO v_existing
  FROM processed_webhook_events
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'is_duplicate', true,
    'status', v_existing.status,
    'message', 'Event claimed concurrently by another worker'
  );
END;
$$;
