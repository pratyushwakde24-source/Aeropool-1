# AeroPool — Staging Deployment & Database Validation Runbook

**Document Version:** 1.0.0  
**Target Environment:** Isolated Supabase Staging (`aeropool-staging`)  
**Staging Project Reference:** `rkuzkwggijthbqwlwnps`  
**Region:** `ap-southeast-1` (Singapore)  
**Protected Production Reference:** `krxkxhieyqcytknixqdm` (DO NOT TOUCH)  
**Last Updated:** October 24, 2026  

---

## 1. Safety Invariants & Project Reference Verification

> [!CAUTION]
> **CRITICAL CROSS-PROJECT ISOLATION RULE:**  
> The local Supabase CLI state (`supabase/.temp/project-ref`) was previously cached with reference `krxkxhieyqcytknixqdm`.  
> Before executing ANY write command, you **MUST** verify that the active linked project is strictly `rkuzkwggijthbqwlwnps`.  
> **NEVER** run `supabase db push` against `krxkxhieyqcytknixqdm`!

### Pre-Flight Verification Script
Run this safe check in your terminal before running any migration command:

**PowerShell (Windows):**
```powershell
# 1. Inspect the cached project reference
$currentRef = (Get-Content "supabase/.temp/project-ref" -ErrorAction SilentlyContinue).Trim()
Write-Host "Current Linked Supabase Project: [$currentRef]" -ForegroundColor Yellow

# 2. Hard assertion
if ($currentRef -ne "rkuzkwggijthbqwlwnps") {
    Write-Host "❌ CRITICAL SAFETY STOP: Linked project is NOT aeropool-staging (rkuzkwggijthbqwlwnps)!" -ForegroundColor Red
    Write-Host "Run 'npx supabase link --project-ref rkuzkwggijthbqwlwnps' first before pushing any migrations." -ForegroundColor Red
    throw "Target Project Reference Mismatch. Aborting."
} else {
    Write-Host "✅ Verified: Active project is aeropool-staging (rkuzkwggijthbqwlwnps). Safe to proceed." -ForegroundColor Green
}
```

**Bash / macOS / Linux:**
```bash
CURRENT_REF=$(cat supabase/.temp/project-ref 2>/dev/null | tr -d '[:space:]')
echo "Current Linked Supabase Project: [$CURRENT_REF]"

if [ "$CURRENT_REF" != "rkuzkwggijthbqwlwnps" ]; then
    echo "❌ CRITICAL SAFETY STOP: Linked project is NOT aeropool-staging (rkuzkwggijthbqwlwnps)!"
    echo "Run 'npx supabase link --project-ref rkuzkwggijthbqwlwnps' first."
    exit 1
else
    echo "✅ Verified: Active project is aeropool-staging (rkuzkwggijthbqwlwnps). Safe to proceed."
fi
```

---

## 2. Prerequisites for Staging Deployment

Before beginning, ensure you have:
1. **Supabase CLI:** Installed locally (available via `npx supabase`).
2. **Supabase Access Token:** Obtained via `npx supabase login`.
3. **Staging Project Password:** The database password set when creating `aeropool-staging` in `ap-southeast-1`.
4. **Staging API Keys:** Public `anon` key and `service_role` secret copied from:
   `https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/settings/api`
5. **Clean Working Tree:** All local changes compiled and validated (`npm run lint` and `npm test` passing).

---

## 3. Step-by-Step Staging CLI Linking Procedure

### Step 3.1: Authenticate with Supabase CLI
```bash
npx supabase login
```
*(Follow browser prompts to authorize your personal access token).*

### Step 3.2: Link Exclusively to Staging Project Reference
```bash
npx supabase link --project-ref rkuzkwggijthbqwlwnps
```
- When prompted for the database password, enter your staging database password.
- The CLI will update `supabase/.temp/project-ref` to `rkuzkwggijthbqwlwnps`.

### Step 3.3: Verify the Link
Execute the Pre-Flight Verification Script from Section 1:
```bash
cat supabase/.temp/project-ref
# Expected output: rkuzkwggijthbqwlwnps
```

---

## 4. Migration Sequence (Chronological 1–7)

The repository contains 7 chronological SQL migrations in `supabase/migrations/`:

| Order | Migration File | Scope & Invariants Established |
|:---:|---|---|
| **1** | `20261015000000_aeropool_schema.sql` | Enums (`user_role`, `ride_status`, etc.), core tables (`profiles`, `organizations`, `vehicles`, `driver_profiles`, `ride_pools`, `bookings`, `payments`, `audit_logs`), CSMIA airport & pickup zone seeds, and baseline RLS. |
| **2** | `20261015000001_ride_requests_and_cancellation.sql` | `ride_requests` ledger, corridor matching indexes, and baseline `cancel_booking_atomic` RPC. |
| **3** | `20261016000000_production_safeguards_and_persistence.sql` | `system_health_checks` audit table, `idempotency_key` columns, financial check constraint `check_production_payment_id`, baseline dispatch & status RPCs. |
| **4** | `20261016000001_production_rls_and_rpc_alignment.sql` | RLS helper functions (`is_admin()`, `is_admin_or_support()`, `current_user_org_id()`, `get_auth_role()`), `pickup_zones.id TEXT` alignment, booking metadata columns, 17-param booking RPC. |
| **5** | `20261020000000_webhook_idempotency_and_security.sql` | `processed_webhook_events` durable ledger, `payment_orders` reconciliation table, service-role isolation, and `claim_webhook_event_atomic` RPC. |
| **6** | `20261024000000_realtime_publication_and_indexes.sql` | Replica identity FULL on operational tables, idempotent `supabase_realtime` publication registration via `pg_publication_tables`, composite performance indexes. |
| **7** | `20261024000001_security_remediation_and_hardening.sql` | **Remediation Migration:** Enables RLS on `audit_logs` (read: staff, write: service_role); bounds `ride_pools` INSERT policy (`total_seats BETWEEN 1 AND 12`); creates `request_ride_pool_atomic` RPC; bounds `profiles` self-insert (`role = 'passenger'`); installs `handle_new_user()` signup trigger with role sanitization; installs `protect_profile_role` trigger blocking role tampering via UPDATE; completely rewrites `cancel_booking_atomic`, `book_ride_atomic`, `assign_driver_to_pool_atomic`, `advance_ride_status_atomic` with strict `auth.uid()` binding; revokes webhook claims from PUBLIC. |

### Step 4.1: Perform Dry-Run Diff
Inspect pending schema additions without writing:
```bash
npx supabase db diff
```

### Step 4.2: Apply Migrations to Staging
```bash
npx supabase db push
```
- The Supabase CLI executes migrations 1 through 7 in sequential timestamp order.
- Each migration is tracked in `supabase_migrations.schema_migrations`.

---

## 5. Stop & Rollback Guidance

If an error occurs during `supabase db push`:
1. **Immediate Halt:** Do not re-run commands in a blind loop.
2. **Identify Failing Statement:** The Supabase CLI will output the exact file and line number that failed.
3. **Inspect Staging Migration State:**
   In Supabase Dashboard -> `aeropool-staging` -> SQL Editor:
   ```sql
   SELECT version, inserted_at FROM supabase_migrations.schema_migrations ORDER BY version;
   ```
4. **Staging Reset (Clean Slate):**
   Because this is an isolated staging environment with no live production users:
   ```bash
   # Drops staging database tables and re-applies all migrations from 1 to 7 cleanly
   npx supabase db reset --linked
   ```
   *(Note: Never execute `db reset` on production! On staging, it guarantees a clean, reproducible fresh install).*

---

## 6. Staging Database Verification Commands

### Step 6.1: Run Automated Backend Diagnostic Script
Prepare `.env.staging` (or temporarily populate `.env` using `.env.staging.example` values):
```bash
npm run verify:db
```
*Expected Output:*
- ✅ Connects to `https://rkuzkwggijthbqwlwnps.supabase.co`.
- ✅ Verifies all 18 tables exist.
- ✅ Verifies all 6 RPCs are registered (`book_ride_atomic`, `cancel_booking_atomic`, `assign_driver_to_pool_atomic`, `advance_ride_status_atomic`, `claim_webhook_event_atomic`, `request_ride_pool_atomic`).
- ✅ Confirms reference seeds (CSMIA 'BOM' airport, pickup zones `pz-t2-p4-east`, `pz-t2-p7-pool`, `pz-t1-arr-main`).

### Step 6.2: Inspect Database Objects via SQL Query
Run in Supabase Dashboard -> `aeropool-staging` -> SQL Editor:
```sql
-- 1. Verify RLS is enabled on all tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- 2. Verify all RLS policies are active
SELECT schemaname, tablename, policyname, roles, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;

-- 3. Verify Realtime publication includes operational tables
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

---

## 7. Adversarial Authorization Test Suite (Execute in Staging SQL Editor)

Run these tests directly in the Staging SQL Editor to verify database-kernel RLS and trigger enforcement:

### Group A: Passenger Role Adversarial Tests
```sql
-- Setup: Simulate an authenticated Passenger (UUID A)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

-- A1: Tamper with Audit Logs directly (Must FAIL with RLS violation)
BEGIN;
  INSERT INTO audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, details)
  VALUES ('attacker', 'Malicious User', 'admin', 'DELETE_ALL', 'SYSTEM', '1', 'Forged log');
ROLLBACK; -- Expected: ERROR: new row violates row-level security policy for table "audit_logs"

-- A2: Attempt Privilege Escalation to Admin via UPDATE (Must FAIL via trigger)
BEGIN;
  UPDATE profiles SET role = 'admin' WHERE id = '11111111-1111-1111-1111-111111111111';
ROLLBACK; -- Expected: ERROR: Unauthorized: Users cannot alter their own role.

-- A3: Cross-Passenger Cancellation Spoofing (Must return error JSON, no cancellation)
SELECT cancel_booking_atomic(
  '22222222-2222-2222-2222-222222222222'::uuid, -- Booking belonging to Victim
  '11111111-1111-1111-1111-111111111111'::uuid   -- Attacker caller
);
-- Expected result: {"success": false, "error": "Booking record not found."} or "Unauthorized: You can only cancel your own booking."

-- A4: Sub-Minimum Fare Injection (< ₹150 / 15,000 paise)
SELECT book_ride_atomic(
  p_pool_id => '33333333-3333-3333-3333-333333333333'::uuid,
  p_passenger_id => '11111111-1111-1111-1111-111111111111'::uuid,
  p_seats => 1,
  p_luggage => 1,
  p_flight_number => 'AI 101',
  p_destination_name => 'Destination',
  p_destination_address => 'Address',
  p_destination_corridor => 'Corridor',
  p_destination_lat => 19.0,
  p_destination_lng => 72.8,
  p_fare_paise => 1000, -- ₹10.00 (Illegal - below ₹150 base fare threshold)
  p_savings_paise => 0,
  p_payment_method => 'UPI',
  p_payment_id => NULL,
  p_razorpay_order_id => NULL,
  p_idempotency_key => NULL,
  p_operating_mode => 'sandbox',
  p_passenger_name => 'Test Passenger',
  p_passenger_phone => '+919876543210'
);
-- Expected result: {"success": false, "error": "Invalid fare: Fare ₹10.00 is below the minimum airport corridor base fare of ₹150.00."}
```

### Group B: Driver Role Adversarial Tests
```sql
-- Setup: Simulate an authenticated Driver (UUID D1)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';

-- B1: Attempt status advancement on a ride assigned to a DIFFERENT driver
SELECT advance_ride_status_atomic(
  '55555555-5555-5555-5555-555555555555'::uuid, -- Pool assigned to Driver D2
  '44444444-4444-4444-4444-444444444444'::uuid,
  'IN_PROGRESS'::ride_status
);
-- Expected result: {"success": false, "error": "Unauthorized: Only the assigned driver or operations dispatchers can update trip status."}

-- B2: Attempt to dispatch/assign assets (Must return unauthorized)
SELECT assign_driver_to_pool_atomic(
  '55555555-5555-5555-5555-555555555555'::uuid,
  '44444444-4444-4444-4444-444444444444'::uuid,
  '66666666-6666-6666-6666-666666666666'::uuid,
  '44444444-4444-4444-4444-444444444444'::uuid
);
-- Expected result: {"success": false, "error": "Unauthorized: Only dispatchers, administrators, or fleet operators can assign drivers."}
```

### Group C: Fleet Operator Role Adversarial Tests
```sql
-- Setup: Simulate a Fleet Operator (Org X)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';

-- C1: Attempt assigning a vehicle from rival fleet Org Y to Driver from Org X
-- When driver.org_id != vehicle.org_id, RPC must reject:
-- Expected result: {"success": false, "error": "Multi-tenant violation: Driver and vehicle do not belong to the same fleet organization."}
```

### Group D: Administrator Role Verification
```sql
-- Setup: Simulate Operations Admin
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '88888888-8888-8888-8888-888888888888';

-- D1: Emergency cancellation of any passenger booking with capacity restoration -> PERMITTED
-- D2: Emergency driver reassignment across organizations -> PERMITTED
-- D3: Read access to audit logs and health checks -> PERMITTED
```

---

## 8. What Local Tests Prove vs Real PostgreSQL Integration Tests

| Feature Under Verification | Verified by Local Test Suite (`npm test`) | Verified by Real Staging PostgreSQL (`supabase db push`) |
|---|:---:|:---:|
| **Application State Transitions** | ✅ (Verified in `src/services/db.ts`) | ✅ (Verified in live DB engine) |
| **Fare Math & Minor Units (Paise)** | ✅ (Verified in `pricingEngine.ts`) | ✅ (Verified in live DB engine) |
| **HMAC Signature Cryptography** | ✅ (Verified in `paymentWebhookService.ts`) | ✅ (Verified on backend node API) |
| **Client Parameter Spoofing Blocks** | ✅ (Verified in client service wrapper) | ✅ (Verified by PL/pgSQL RPC guards) |
| **PostgreSQL Kernel RLS Enforcement** | ❌ (Cannot execute kernel RLS in Node.js) | ✅ **Requires Staging Validation** |
| **PL/pgSQL `FOR UPDATE` Row Locks** | ❌ (Mocked in in-memory state) | ✅ **Requires Staging Validation** |
| **Database Triggers (`auth.users`)** | ❌ (Requires Supabase GoTrue Auth) | ✅ **Requires Staging Validation** |
| **Realtime CDC Broadcasts (`pg_publication`)** | ❌ (Mocked in event emitter) | ✅ **Requires Staging Validation** |

---

## 9. Next Manual Action for You (The User)

1. Open a terminal in `c:\Users\praty\Aeropool 1`.
2. Run `npx supabase login` to authenticate the CLI.
3. Run `npx supabase link --project-ref rkuzkwggijthbqwlwnps` and enter your staging database password.
4. Run `cat supabase/.temp/project-ref` to confirm the reference shows `rkuzkwggijthbqwlwnps`.
5. Run `npx supabase db push` to deploy migrations 1 through 7 to `aeropool-staging`.
6. Run the adversarial tests in the Staging SQL Editor as detailed in Section 7.
7. Report the staging verification results for production approval.
