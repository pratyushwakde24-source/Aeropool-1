-- ============================================================================
-- AeroPool — Phase 5B Migration: Server Refunds & Financial Ledger Schema
-- Target: Supabase PostgreSQL (Version 15+)
-- Prepared: 2026-11-03
-- STATUS: LOCAL PREPARED MIGRATION ONLY (DO NOT APPLY REMOTELY WITHOUT APPROVAL)
-- ============================================================================

-- 1. PAYMENT REFUNDS TABLE
CREATE TABLE IF NOT EXISTS payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id TEXT UNIQUE NOT NULL, -- Razorpay refund ID (e.g. rfnd_xxx or rfnd_test_xxx)
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  passenger_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
  reason TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  credit_note_number TEXT UNIQUE,
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  failure_reason TEXT,
  is_sandbox BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_id ON payment_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_order_id ON payment_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_booking_id ON payment_refunds(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_passenger_id ON payment_refunds(passenger_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status ON payment_refunds(status);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_created ON payment_refunds(created_at DESC);

-- 2. COMMISSION SNAPSHOTS TABLE (IMMUTABLE TRANSACTION RULES)
CREATE TABLE IF NOT EXISTS commission_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL,
  pool_id UUID REFERENCES ride_pools(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES driver_profiles(id) ON DELETE SET NULL,
  policy_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_name TEXT NOT NULL,
  gross_fare_paise BIGINT NOT NULL CHECK (gross_fare_paise >= 0),
  driver_share_percent INT NOT NULL CHECK (driver_share_percent BETWEEN 0 AND 100),
  platform_commission_percent INT NOT NULL CHECK (platform_commission_percent BETWEEN 0 AND 100),
  driver_base_payout_paise BIGINT NOT NULL CHECK (driver_base_payout_paise >= 0),
  driver_toll_reimbursement_paise BIGINT NOT NULL DEFAULT 0,
  driver_net_payout_paise BIGINT NOT NULL CHECK (driver_net_payout_paise >= 0),
  platform_commission_paise BIGINT NOT NULL CHECK (platform_commission_paise >= 0),
  platform_fee_retained_paise BIGINT NOT NULL DEFAULT 0,
  platform_net_revenue_paise BIGINT NOT NULL CHECK (platform_net_revenue_paise >= 0),
  reconciled BOOLEAN NOT NULL DEFAULT true,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_snapshots_trip ON commission_snapshots(trip_id);
CREATE INDEX IF NOT EXISTS idx_comm_snapshots_driver ON commission_snapshots(driver_id);
CREATE INDEX IF NOT EXISTS idx_comm_snapshots_pool ON commission_snapshots(pool_id);

-- 3. ROW LEVEL SECURITY
ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_snapshots ENABLE ROW LEVEL SECURITY;

-- 3.1 RLS FOR REFUNDS: Passengers can view their own refunds, Admins can view all
DROP POLICY IF EXISTS "Passengers view own refunds" ON payment_refunds;
CREATE POLICY "Passengers view own refunds"
  ON payment_refunds
  FOR SELECT
  TO authenticated
  USING (passenger_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Service role full access refunds" ON payment_refunds;
CREATE POLICY "Service role full access refunds"
  ON payment_refunds
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3.2 RLS FOR COMMISSION SNAPSHOTS: Drivers view own, Admins view all
DROP POLICY IF EXISTS "Drivers view own commission snapshots" ON commission_snapshots;
CREATE POLICY "Drivers view own commission snapshots"
  ON commission_snapshots
  FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Service role full access commission snapshots" ON commission_snapshots;
CREATE POLICY "Service role full access commission snapshots"
  ON commission_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

