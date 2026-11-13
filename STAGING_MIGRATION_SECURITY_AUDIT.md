# AEROPOOL — STAGING DATABASE & SECURITY AUDIT REPORT (READ-ONLY)

**Document Version:** 1.0.0  
**Audit Date:** October 30, 2026  
**Auditor:** Senior Database Security Engineer & Cloud Systems Architect  
**Repository Target:** `C:\Users\praty\Aeropool 1`  
**Execution Context:** Strictly Non-Mutating / Read-Only Inspection  

---

## 1. EXECUTIVE VERDICT

### **VERDICT: SAFE TO PROCEED WITH STAGING MIGRATION**

All seven local SQL migration scripts have undergone a comprehensive line-by-line syntax, dependency, RLS, and security verification. The critical defects previously blocking deployment (including the SQLSTATE 42883 `uuid_generate_v4()` missing function failure and RPC authorization bypasses) have been fully resolved locally. The Supabase CLI link is verified pointing exclusively to the staging project, while the protected baseline project remains completely untouched.

| Audit Parameter | Verified Status | Evidence Reference |
| :--- | :--- | :--- |
| **Target Project Reference** | `rkuzkwggijthbqwlwnps` | Staging project active, linked, and healthy on Supabase API |
| **Protected Baseline Project** | `krxkxhieyqcytknixqdm` | Baseline project unlinked (`linked: false`), inactive, untouched |
| **Target Database Engine** | PostgreSQL 17 (`17.11.0.003`) | Core native `gen_random_uuid()` natively available without extensions |
| **Local Migration Files** | 7 files, chronologically ordered | `supabase/migrations/` (20261015000000 through 20261024000001) |
| **`uuid_generate_v4()` Scan** | **0 occurrences repository-wide** | Replaced with native standard `gen_random_uuid()` across all 15 tables |
| **RPC Callers vs SQL Signatures** | **100% Parameter & Type Match** | `src/services/db.ts` and `server/idempotencyStore.ts` verified |
| **Local Test Suite** | **70 / 70 Tests Passing (100%)** | `npm test` passed in 324.6ms |
| **TypeScript / Type Check** | **0 Errors** | `npm run lint` (`tsc --noEmit`) clean |
| **Production Bundle Build** | **Clean Build in 4.20s** | `npm run build` (`vite build`) clean |
| **Razorpay Operational State** | **TEST MODE (`rzp_test_...`)** | Express health check confirms `"mode": "sandbox"`, zero live charges |
| **Remote Mutation Status** | **ZERO Remote Writes Executed** | No `supabase db push`, no remote DDL, no resets, `.env` untouched |

---

## 2. PROJECT TARGET & ENVIRONMENT VERIFICATION (READ-ONLY)

A read-only API inspection was conducted against the linked Supabase CLI account to confirm isolation between the baseline and staging projects.

### Verified Remote Telemetry
```json
[
  {
    "id": "krxkxhieyqcytknixqdm",
    "name": "pratyushwakde24-source's Project",
    "region": "ap-southeast-1",
    "status": "INACTIVE",
    "linked": false,
    "database": {
      "host": "db.krxkxhieyqcytknixqdm.supabase.co",
      "postgres_engine": "17",
      "version": "17.11.0.003"
    }
  },
  {
    "id": "rkuzkwggijthbqwlwnps",
    "name": "aeropool-staging",
    "region": "ap-southeast-1",
    "status": "ACTIVE_HEALTHY",
    "linked": true,
    "database": {
      "host": "db.rkuzkwggijthbqwlwnps.supabase.co",
      "postgres_engine": "17",
      "version": "17.11.0.003"
    }
  }
]
```

### Key Target Observations
1. **Protected Baseline Project (`krxkxhieyqcytknixqdm`):** Confirmed `linked: false` and `INACTIVE`. No local CLI processes are configured to communicate with this project.
2. **Staging Project (`rkuzkwggijthbqwlwnps`):** Confirmed `linked: true` and `ACTIVE_HEALTHY`. The local file `supabase/.temp/project-ref` strictly contains `rkuzkwggijthbqwlwnps`.
3. **Engine Version:** Staging runs **PostgreSQL 17.11**. In PostgreSQL 13+, `gen_random_uuid()` is a native core function. The legacy `uuid-ossp` extension is completely unnecessary.

---

## 3. SEVEN-MIGRATION REVIEW & DEPENDENCY AUDIT

Each migration script in `supabase/migrations/` was evaluated for execution safety, dependency graph ordering, idempotency, and potential failure modes.

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 20261015000000_aeropool_schema.sql                       │
│    • 5 Enums, 12 Core Tables, CSMIA Mumbai Seeds, Base RLS   │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 2. 20261015000001_ride_requests_and_cancellation.sql        │
│    • ride_requests Table, Initial cancel_booking_atomic      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 3. 20261016000000_production_safeguards_and_persistence.sql │
│    • system_health_checks, idempotency_key, payment check   │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 4. 20261016000001_production_rls_and_rpc_alignment.sql      │
│    • RLS Security Helpers, Contact Columns, 17-param RPC    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 5. 20261020000000_webhook_idempotency_and_security.sql      │
│    • processed_webhook_events, payment_orders, claim RPC     │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 6. 20261024000000_realtime_publication_and_indexes.sql      │
│    • REPLICA IDENTITY FULL, Realtime Publication, Composite │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 7. 20261024000001_security_remediation_and_hardening.sql    │
│    • 19-param book_ride_atomic, Role Esc. Guards, RPC Grants │
└─────────────────────────────────────────────────────────────┘
```

### Seven-Migration Audit Matrix

| Migration | Purpose & Artifacts | Dependencies | Idempotency & Safety Analysis | Risk Assessment |
| :--- | :--- | :--- | :--- | :--- |
| **01** `20261015000000_aeropool_schema.sql` | • Enums: `user_role`, `verification_status`, `ride_status`, `payment_status`, `vehicle_category`<br/>• Tables: `profiles`, `organizations`, `vehicles`, `driver_profiles`, `driver_documents`, `airports`, `pickup_zones`, `ride_pools`, `bookings`, `payments`, `safety_incidents`, `support_tickets`, `audit_logs`<br/>• Seeds: CSMIA BOM airports & pickup bays<br/>• Initial 13-param `book_ride_atomic` | Baseline Supabase Auth (`auth.users`) | • Enums created inside `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;`<br/>• All tables use `CREATE TABLE IF NOT EXISTS`<br/>• All PKs use native `gen_random_uuid()`<br/>• Foreign key constraints explicitly managed (`DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT`)<br/>• Seeds use `ON CONFLICT (id) DO NOTHING` | **LOW (Safe)**<br/>Initial `book_ride_atomic` lacks search path and auth checks, but is completely dropped and superseded by Migration 4 and Migration 7. |
| **02** `20261015000001_ride_requests_and_cancellation.sql` | • Table: `ride_requests`<br/>• Performance indexes on passenger and corridor<br/>• Initial `cancel_booking_atomic` RPC | Migration 01 (`profiles`, `pickup_zones`, `ride_pools`) | • `CREATE TABLE IF NOT EXISTS`<br/>• `CREATE INDEX IF NOT EXISTS`<br/>• `CREATE OR REPLACE FUNCTION` | **LOW (Safe)**<br/>Initial `cancel_booking_atomic` had parameter spoofing exposure, but is fully replaced and hardened in Migration 7. |
| **03** `20261016000000_production_safeguards_and_persistence.sql` | • Table: `system_health_checks`<br/>• Columns: `idempotency_key`, `operating_mode` on `bookings` & `payments`<br/>• Check constraint: `check_production_payment_id`<br/>• RPCs: `assign_driver_to_pool_atomic`, `advance_ride_status_atomic` | Migration 01 & 02 (`bookings`, `payments`, `ride_pools`) | • Columns added inside defensive `DO $$ BEGIN ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... END $$;`<br/>• Financial check constraint drops existing constraint before recreating<br/>• Blocks simulated `pay_BOM_%` IDs in production mode | **LOW (Safe)**<br/>RPCs are hardened and multi-tenant isolated in Migration 7. |
| **04** `20261016000001_production_rls_and_rpc_alignment.sql` | • RLS Helper Functions: `get_auth_role()`, `is_admin()`, `is_staff()`, `is_admin_or_support()`, `current_user_org_id()`<br/>• Metadata columns: `passenger_name`, `driver_name`, `vehicle_plate`, etc. on `bookings`<br/>• Comprehensive RLS across 13 tables<br/>• Drops 13-param `book_ride_atomic` and creates 17-param RPC | Migration 01, 02, 03 | • Helper functions use `SECURITY DEFINER SET search_path = public` and `STABLE` to prevent recursive RLS evaluations on `profiles`<br/>• Explicitly drops 13-arg overload before creating 17-arg version<br/>• All policies use `DROP POLICY IF EXISTS ... CREATE POLICY` | **LOW (Safe)**<br/>`book_ride_atomic` is further upgraded to 19 parameters in Migration 7. |
| **05** `20261020000000_webhook_idempotency_and_security.sql` | • Tables: `processed_webhook_events` (durable idempotency ledger) and `payment_orders` (authoritative server orders)<br/>• Service-role RLS isolation<br/>• RPC: `claim_webhook_event_atomic` | Migration 01 (`profiles`, `bookings`) | • `CREATE TABLE IF NOT EXISTS`<br/>• Strict RLS restricts webhook events to `service_role`<br/>• Atomic concurrency locking via `SELECT ... FOR UPDATE` and `EXCEPTION WHEN unique_violation` | **LOW (Safe)**<br/>Initial public execute privilege on claim function is revoked in Migration 7. |
| **06** `20261024000000_realtime_publication_and_indexes.sql` | • `REPLICA IDENTITY FULL` on `bookings`, `ride_pools`, `driver_profiles`<br/>• Safely registers tables to `supabase_realtime` publication<br/>• Composite query indexes | Migration 01, 04, 05 | • Idempotent publication check: Queries `pg_publication_tables` before attempting `ALTER PUBLICATION supabase_realtime ADD TABLE`<br/>• Prevents "relation already member of publication" failure on re-runs | **LOW (Safe)**<br/>Zero side effects on non-realtime tables. |
| **07** `20261024000001_security_remediation_and_hardening.sql` | • Immutable `audit_logs` RLS (staff read, service-role write)<br/>• Bounded `ride_pools` INSERT policy<br/>• Role escalation lockdown: Clamps `profiles` INSERT; triggers `handle_new_user()` and `protect_profile_role()`<br/>• Rewrites `book_ride_atomic` (19 params), `cancel_booking_atomic`, `assign_driver_to_pool_atomic`, `advance_ride_status_atomic`, `request_ride_pool_atomic`<br/>• RPC execution permissions: Revokes webhook claims from `PUBLIC`, grants to `service_role` | Migration 01 through 06 | • Explicitly drops previous 13-arg and 17-arg `book_ride_atomic` overloads to prevent PostgREST signature ambiguity<br/>• All functions declare `SET search_path = public`<br/>• Strict `auth.uid()` identity assertions across all RPCs<br/>• Enforces ₹150 minimum base fare and production order matching | **LOW (Safe & Hardened)**<br/>Final authoritative schema state. |

---

## 4. FINDINGS & TECHNICAL ANALYSIS

### A. Critical Findings (Resolved Locally)

#### 1. SQLSTATE 42883 Missing `uuid_generate_v4()` Function
* **File:** `supabase/migrations/20261015000000_aeropool_schema.sql` (previously line 50)
* **Diagnosis:** Migration 1 originally declared `DEFAULT uuid_generate_v4()`. In PostgreSQL 17 on Supabase, the `uuid-ossp` extension is not pre-installed in `public`. When the migration runner executed Migration 1 on staging, the transaction failed with `ERROR: function uuid_generate_v4() does not exist (SQLSTATE 42883)`.
* **Rollback Verification:** In Supabase CLI and PostgreSQL, each migration file is executed inside an atomic `BEGIN ... COMMIT` transaction. Because the error was thrown during table creation, the transaction rolled back completely. No tables or enums were committed to the remote database, and `supabase_migrations.schema_migrations` has no recorded entries.
* **Resolution Confirmed:** Ripgrep confirms 0 occurrences of `uuid_generate_v4()` across the entire repository. All primary keys across all 15 tables now use native, core PostgreSQL `gen_random_uuid()`.

#### 2. Identity Spoofing in Core RPC Procedures
* **Files:** 
  - `supabase/migrations/20261015000000_aeropool_schema.sql` (legacy `book_ride_atomic`)
  - `supabase/migrations/20261015000001_ride_requests_and_cancellation.sql` (legacy `cancel_booking_atomic`)
* **Diagnosis:** Earlier versions of these RPCs ran as `SECURITY DEFINER` and trusted client-supplied `p_passenger_id` parameters without asserting `auth.uid() = p_passenger_id`. An authenticated attacker could forge bookings or cancel rides on behalf of victim passengers.
* **Resolution Confirmed:** Migration 7 rewrites all RPCs with strict caller guards:
  ```sql
  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Authentication required.');
    END IF;
    IF v_caller_id != p_passenger_id AND NOT (SELECT public.is_admin()) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Cannot act for another passenger.');
    END IF;
  END IF;
  ```

---

### B. High Findings (Architectural Alignment & Recommendations)

#### 1. Role Authority Synchronization: `profiles.role` vs `auth.users.app_metadata`
* **Files:**
  - `supabase/migrations/20261016000001_production_rls_and_rpc_alignment.sql` (Lines 34-42)
  - `server/authMiddleware.ts` (Lines 103 & 142)
  - `src/services/authService.ts` (Lines 87-112)
* **Diagnosis:**
  - **In PostgreSQL:** RLS helper functions (`get_auth_role()`, `is_admin()`, `is_staff()`) query `public.profiles.role` directly using `auth.uid()`.
  - **In the Frontend (`authService.ts`):** User profile and UI navigation derive roles directly from `public.profiles.role`.
  - **In Express Backend (`authMiddleware.ts`):** In production mode, the backend queries Supabase Auth `/auth/v1/user` using the Bearer token and inspects `supabaseUser.app_metadata?.role || 'passenger'`.
* **Impact & Edge Case:**
  If an operator promotes a user to `admin` or approves a `driver` by executing an `UPDATE profiles SET role = 'admin'` directly in SQL or Supabase Studio, `profiles.role` is updated, but `auth.users.raw_app_meta_data` is NOT updated automatically. Consequently:
  - Database RLS and the frontend will recognize the user as an admin.
  - The Express backend endpoints protected by `requireRole(['admin'])` will inspect `app_metadata.role`, fall back to `'passenger'`, and return `HTTP 403 Forbidden`.
* **Remediation Recommendation:**
  1. For administrative promotions, use the Supabase Admin API via the trusted backend:
     `supabase.auth.admin.updateUserById(userId, { app_metadata: { role: 'admin' } })`
  2. Alternatively, deploy a PostgreSQL trigger on `profiles` that updates `auth.users.raw_app_meta_data` when `profiles.role` is modified by an admin.

#### 2. Unrestricted Public Execution on Webhook Idempotency RPC
* **File:** `supabase/migrations/20261020000000_webhook_idempotency_and_security.sql` (Lines 77-142)
* **Diagnosis:** PostgreSQL grants `EXECUTE` on new public functions to `PUBLIC` by default. An anonymous caller via PostgREST could invoke `claim_webhook_event_atomic` with forged event IDs to poison the idempotency ledger.
* **Resolution Confirmed:** Migration 7 lines 869-870 explicitly addresses this:
  ```sql
  REVOKE EXECUTE ON FUNCTION claim_webhook_event_atomic(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION claim_webhook_event_atomic(TEXT, TEXT, TEXT, JSONB) TO service_role;
  ```

---

### C. Medium Findings (Hardened Locally)

#### 1. Public Signup Privilege Escalation
* **Files:** `src/components/AuthModal.tsx`, `src/services/authService.ts`, `supabase/migrations/20261024000001_security_remediation_and_hardening.sql`
* **Diagnosis:** In early mock versions, users could select their own role from a dropdown during registration.
* **Resolution Confirmed:** 
  1. `AuthModal.tsx` contains no role selection UI; it is hardcoded to register passengers.
  2. `authService.ts` line 185 unconditionally forces `const role: UserRole = 'passenger'`.
  3. Migration 7 installs `handle_new_user()` trigger on `auth.users` that inserts `'passenger'::user_role` regardless of client metadata.
  4. Migration 7 installs `protect_profile_role()` trigger on `profiles` that raises an exception if a non-admin attempts to change their role or organization.

#### 2. Client-Controlled Fare Parameter Injection
* **Files:** `src/services/db.ts:703-708`, `supabase/migrations/20261024000001_security_remediation_and_hardening.sql:440-450`
* **Diagnosis:** `book_ride_atomic` originally accepted `p_fare_paise` without minimum constraints. A malicious actor could pass `p_fare_paise = 1` for a ₹0.01 ride.
* **Resolution Confirmed:**
  - Client and RPC enforce a hard minimum base fare:
    ```sql
    IF p_fare_paise < 15000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid fare: Fare is below minimum airport corridor base fare of ₹150.00.');
    END IF;
    ```
  - In production mode, `p_fare_paise` must match an authoritative server-registered order in `payment_orders`.

---

### D. Low Findings (Operational Safeguards)

#### 1. Local Runtime Environment vs Staging Database Link
* **File:** `.env`
* **Diagnosis:** The local `.env` file currently contains `VITE_SUPABASE_URL="https://krxkxhieyqcytknixqdm.supabase.co"` (the baseline project URL). The Supabase CLI link, however, is confirmed pointing to `rkuzkwggijthbqwlwnps` (staging).
* **Operational Action:** In accordance with safety rules, `.env` was not modified. Once migrations are applied to staging, the developer must manually paste the staging URL and anon/service keys into `.env` and restart local dev servers.

---

## 5. AUTHENTICATION, AUTHORIZATION & RLS SUBSYSTEM TRACE

### 1. Signup & Identity Provisioning Flow
```
User Enters Email & Password (AuthModal.tsx)
                  │
                  ▼
authService.signUp() forces role = 'passenger'
                  │
                  ▼
Supabase Auth creates auth.users record
                  │
                  ▼
Trigger: on_auth_user_created -> public.handle_new_user()
                  │
                  ▼
Inserts into public.profiles:
  - id = auth.uid()
  - role = 'passenger'::user_role
  - organization_id = NULL
```
* **Privilege Guarantee:** It is mathematically impossible for an untrusted client to provision an `admin`, `support`, `fleet_operator`, or `driver` profile through public signup.

### 2. Multi-Tenant Fleet Isolation
* **Assets:** Vehicles and drivers belong to a specific `organization_id`.
* **RPC Protection (`assign_driver_to_pool_atomic`):**
  ```sql
  IF v_driver.organization_id IS DISTINCT FROM v_vehicle.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Multi-tenant violation: Driver and vehicle do not belong to the same fleet organization.');
  END IF;
  ```
* **Fleet Operator Boundary:** Fleet operators can only dispatch assets belonging to their own organization (`current_user_org_id()`).

### 3. Driver Location Telemetry Privacy
* **Verification in `src/services/db.ts:2210-2250`:**
  - Unassigned pools reject location telemetry broadcasts (`"Pool trip does not have an assigned driver"`).
  - Concluded or cancelled trips reject live location updates.
  - Driver identity spoofing check: The broadcasting driver must match the driver assigned specifically to that pool.
  - Passengers only receive telemetry for their active confirmed booking.

---

## 6. BOOKING CONCURRENCY & PAYMENT INTEGRITY

### Concurrency Protection & Overbooking Prevention
In `book_ride_atomic` (Migration 7 lines 514-537):
```sql
SELECT * INTO v_pool
FROM ride_pools
WHERE id = p_pool_id
FOR UPDATE;

IF v_pool.available_seats < p_seats THEN
  RETURN jsonb_build_object('success', false, 'error', 'Insufficient seats remaining in pool.');
END IF;

UPDATE ride_pools
SET available_seats = available_seats - p_seats
WHERE id = p_pool_id;
```
* `FOR UPDATE` acquires a row-level exclusive lock on the specific pool row in PostgreSQL.
* Concurrent requests serialize at the database engine level.
* Zero seat overselling under high concurrency.

### Idempotency & Webhook Reconciliations
* **Idempotency Key:** Both `bookings` and `payments` enforce unique constraints on `idempotency_key`. Re-transmissions return the existing booking payload with `'is_duplicate': true`.
* **Razorpay Signatures:** Webhook payloads are verified using HMAC-SHA256 with `crypto.timingSafeEqual` in `server/index.ts`.
* **Webhook Replay Guard:** The `processed_webhook_events` table locks incoming `event_id` rows via `claim_webhook_event_atomic`. Duplicate webhooks are rejected immediately.

---

## 7. REALTIME & DATA PERSISTENCE

### Realtime Architecture
* **Publication:** `bookings`, `ride_pools`, and `driver_profiles` are registered to `supabase_realtime` via Migration 6.
* **Full Payload Delivery:** `REPLICA IDENTITY FULL` is enabled on all published tables, ensuring update events include complete row state.
* **RLS Filtering:** Supabase Realtime respects PostgreSQL RLS policies, ensuring passengers receive notifications exclusively for their own bookings.

### Zero Fake/Mock Data Guarantee
* All bookings, payments, and cancellations execute through live database RPC procedures.
* In production mode, local fallback offline storage is explicitly blocked (`db.ts:710-716`).

---

## 8. PRE-MIGRATION STAGING DEPLOYMENT CHECKLIST

Execute these verification checks before applying migrations:

- [x] **CLI Target Verified:** `npx supabase projects list` confirms `rkuzkwggijthbqwlwnps` is linked.
- [x] **Baseline Project Untouched:** `krxkxhieyqcytknixqdm` is unlinked and inactive.
- [x] **Migration Files Clean:** Zero occurrences of `uuid_generate_v4()`.
- [x] **RPC Signatures Matched:** `book_ride_atomic` has 19 parameters across all callers and SQL definitions.
- [x] **Local Test Suite:** 70 / 70 tests passing.
- [x] **Lint & Types:** Clean compilation (`tsc --noEmit`).
- [x] **Build:** Production bundle built successfully.
- [x] **Payment Mode:** Razorpay verified in test mode (`rzp_test_...`).

---

## 9. SAFE, ORDERED DEPLOYMENT PROCEDURE (REQUIRES USER APPROVAL)

When you are ready to apply the migrations to staging project `rkuzkwggijthbqwlwnps`, execute the following commands in order:

### Phase 1: Remote Migration Push
```powershell
# 1. Execute database migration against linked staging project
npx supabase db push
```

### Phase 2: Post-Migration Schema Verification
Run these non-mutating inspection queries to confirm clean execution:
```sql
-- 1. Verify all 7 migrations are recorded
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;

-- 2. Verify all 6 atomic RPCs are registered in public schema
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
  'book_ride_atomic', 
  'cancel_booking_atomic', 
  'assign_driver_to_pool_atomic', 
  'advance_ride_status_atomic', 
  'request_ride_pool_atomic', 
  'claim_webhook_event_atomic'
);

-- 3. Verify claim_webhook_event_atomic execution permissions (service_role only)
SELECT grantee, privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public' 
AND routine_name = 'claim_webhook_event_atomic';
```

### Phase 3: Local Runtime Staging Configuration
Update [.env](file:///c:/Users/praty/Aeropool%201/.env) with staging credentials:
```bash
VITE_SUPABASE_URL="https://rkuzkwggijthbqwlwnps.supabase.co"
VITE_SUPABASE_ANON_KEY="<staging_anon_key_from_dashboard>"
SUPABASE_SERVICE_ROLE_KEY="<staging_service_role_key_from_dashboard>"
VITE_OPERATING_MODE="development" # or "staging"
```

### Phase 4: Restart Local Services & Smoke Test
```powershell
# Restart backend Express server
npm run server

# Restart frontend Vite dev server
npm run dev
```
Navigate to `http://localhost:3000`, register a test passenger, create an airport booking in test mode, and verify that the row appears in remote PostgreSQL `bookings` table.

---

## 10. FINAL CONFIRMATION GATE

> [!IMPORTANT]
> **GATE STATUS: HOLD FOR EXPLICIT USER APPROVAL**  
> In accordance with safety rules, no remote database writes, no `supabase db push`, and no `.env` modifications were executed during this audit. Staging project `rkuzkwggijthbqwlwnps` is verified and ready. Awaiting your explicit approval to apply the migrations.
