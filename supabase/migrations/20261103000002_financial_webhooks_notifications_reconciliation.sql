-- ============================================================================
-- AEROPOOL — PHASE 5E: FINANCIAL OPERATIONS, WEBHOOKS & RECONCILIATION
-- Migration: 20261103000002_financial_webhooks_notifications_reconciliation.sql
-- 
-- IMPORTANT SAFETY NOTICE:
-- LOCAL MIGRATION DEFINITION ONLY. DO NOT EXECUTE REMOTELY.
-- ============================================================================

-- 1. Webhook Failure Recovery & Retry Queue Extensions
ALTER TABLE IF EXISTS public.processed_webhook_events
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_review_reason TEXT,
  ADD COLUMN IF NOT EXISTS manual_review_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS redacted_payload JSONB;

CREATE INDEX IF NOT EXISTS idx_webhook_events_retry 
  ON public.processed_webhook_events(status, next_retry_at)
  WHERE status IN ('RETRY_SCHEDULED', 'FAILED');

-- 2. Reconciliation Execution History Table
CREATE TABLE IF NOT EXISTS public.reconciliation_job_runs (
  job_id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL CHECK (trigger IN ('CRON', 'MANUAL_ADMIN')),
  triggered_by UUID REFERENCES auth.users(id),
  start_time TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  end_time TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL')),
  records_scanned INTEGER DEFAULT 0,
  discrepancies_detected INTEGER DEFAULT 0,
  new_discrepancies INTEGER DEFAULT 0,
  discrepancy_summaries JSONB DEFAULT '[]'::jsonb,
  errors_encountered JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_jobs_status
  ON public.reconciliation_job_runs(status, start_time DESC);

-- 3. Financial Notifications System Table
CREATE TABLE IF NOT EXISTS public.financial_notifications (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role TEXT NOT NULL CHECK (user_role IN ('passenger', 'driver', 'fleet_operator', 'admin')),
  category TEXT NOT NULL CHECK (category IN ('PAYMENT', 'REFUND', 'SETTLEMENT', 'RECONCILIATION', 'SYSTEM')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INFO', 'SUCCESS', 'WARNING', 'ALERT')),
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  event_id TEXT,
  external_delivery_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED_SANDBOX',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_financial_notifs_user 
  ON public.financial_notifications(user_id, read, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_notifs_dedup
  ON public.financial_notifications(user_id, event_id)
  WHERE event_id IS NOT NULL;

-- 4. Enable Row Level Security (RLS) on new tables
ALTER TABLE public.reconciliation_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_notifications ENABLE ROW LEVEL SECURITY;

-- 5. Strict RLS Policies: Admins can inspect reconciliation jobs
DROP POLICY IF EXISTS "Admins can view reconciliation history" ON public.reconciliation_job_runs;
CREATE POLICY "Admins can view reconciliation history"
  ON public.reconciliation_job_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Users can only view their own notifications; admins can view broadcast alerts
DROP POLICY IF EXISTS "Users can view own financial notifications" ON public.financial_notifications;
CREATE POLICY "Users can view own financial notifications"
  ON public.financial_notifications
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

