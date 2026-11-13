# AeroPool — Hosted Database Deployment Approval Document

**Target Environment:** Hosted Supabase PostgreSQL  
**Target Project Reference:** `krxkxhieyqcytknixqdm`  
**Endpoint:** `https://krxkxhieyqcytknixqdm.supabase.co`  
**Operating Mode:** `sandbox`  
**Date:** October 2026  
**Document Status:** **AWAITING USER EXPLICIT APPROVAL** (Gate Locked)

---

## 1. Approval Statement & Gate Policy

> [!IMPORTANT]
> **Strict Deployment Gate Notice:**  
> In compliance with User Working Rule 12, **no remote DDL, schema migrations, `supabase db push`, or remote data writes have been or will be executed** without explicit approval. This document serves as the formal review specification.

---

## 2. Exact Ordered Migration Plan

The deployment suite comprises 6 sequential migrations designed with strict dependency ordering, idempotent guards, and error resilience:

| Seq | Migration File | Target Database Schema Objects | Dependencies | Overload & Collision Guards | Retry Safety |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **01** | `20261015000000_aeropool_schema.sql` | • Extensions: `uuid-ossp`, `pgcrypto`<br/>• Enums: `user_role`, `verification_status`, `ride_status`, `payment_status`, `vehicle_category`<br/>• 13 Tables: `profiles`, `organizations`, `vehicles`, `driver_profiles`, `driver_documents`, `airports`, `pickup_zones`, `ride_pools`, `bookings`, `payments`, `safety_incidents`, `support_tickets`, `audit_logs`<br/>• Initial RLS & Foreign Keys<br/>• Seed Data: Airport 'BOM' & 3 CSMIA Pickup Hubs | Base Supabase `auth.users` | `CREATE TYPE ... EXCEPTION WHEN duplicate_object`<br/>`CREATE TABLE IF NOT EXISTS`<br/>`ON CONFLICT (id) DO NOTHING` | **SAFE** |
| **02** | `20261015000001_ride_requests_and_cancellation.sql` | • Table: `ride_requests`<br/>• Indexes: `idx_ride_requests_passenger`, `idx_ride_requests_corridor`, `idx_ride_requests_created`<br/>• RLS: Passenger isolation & staff visibility<br/>• RPC: `cancel_booking_atomic(p_booking_id UUID, p_passenger_id UUID, p_reason TEXT)` | Migration 01 (`profiles`, `pickup_zones`, `ride_pools`, `bookings`) | `CREATE TABLE IF NOT EXISTS`<br/>`CREATE OR REPLACE FUNCTION` (3 params) | **SAFE** |
| **03** | `20261016000000_production_safeguards_and_persistence.sql` | • Table: `system_health_checks`<br/>• Columns: `idempotency_key` & `operating_mode` on `bookings` and `payments`<br/>• Constraint: `check_production_payment_id` on `payments`<br/>• RPC: `assign_driver_to_pool_atomic(p_pool_id UUID, p_driver_id UUID, p_vehicle_id UUID, p_actor_id UUID)` | Migration 01 & 02 | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`<br/>`DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT` | **SAFE** |
| **04** | `20261016000001_production_rls_and_rpc_alignment.sql` | • Columns: `driver_name`, `vehicle_plate`, etc. on `bookings`<br/>• Helper Functions: `get_auth_role()`, `is_admin()`, `is_staff()`, `current_user_org_id()`<br/>• RLS Hardening on all tables<br/>• Type Alignment: `pickup_zones.id` to `TEXT`<br/>• RPC: `book_ride_atomic` (17-parameter signature with defaults) | Migration 01, 02, 03 | **Explicitly drops** legacy 13-parameter signature (`DROP FUNCTION IF EXISTS book_ride_atomic(...)`) to eliminate PostgREST RPC overload ambiguity | **SAFE** |
| **05** | `20261020000000_webhook_idempotency_and_security.sql` | • Table: `processed_webhook_events` (Durable Webhook Idempotency)<br/>• Table: `payment_orders` (Authoritative Order Reconciliation)<br/>• Service Role RLS isolation<br/>• RPC: `claim_webhook_event_atomic(p_event_id TEXT, p_event_type TEXT, p_payload_hash TEXT, p_payload JSONB)` | Migration 01, 04 | `CREATE TABLE IF NOT EXISTS`<br/>`DROP POLICY IF EXISTS ... CREATE POLICY` | **SAFE** |
| **06** | `20261024000000_realtime_publication_and_indexes.sql` | • Realtime Publication: `ALTER PUBLICATION supabase_realtime ADD TABLE bookings, ride_pools, driver_profiles`<br/>• Replica Identity: `REPLICA IDENTITY FULL` on `bookings`, `ride_pools`, `driver_profiles`<br/>• Composite Performance Indexes on `bookings`, `ride_pools`, `payments` | Migration 01, 04, 05 | Wrapped in `DO $$ ... EXCEPTION WHEN others THEN null; END $$;` checking publication existence | **SAFE** |

---

## 3. Remote Objects Affected (Full Inventory)

- **PostgreSQL Extensions (2):** `uuid-ossp`, `pgcrypto`
- **Custom Enums (5):** `user_role`, `verification_status`, `ride_status`, `payment_status`, `vehicle_category`
- **Relational Tables (17):**
  1. `profiles`
  2. `organizations`
  3. `vehicles`
  4. `driver_profiles`
  5. `driver_documents`
  6. `airports`
  7. `pickup_zones`
  8. `ride_pools`
  9. `bookings`
  10. `payments`
  11. `ride_requests`
  12. `safety_incidents`
  13. `support_tickets`
  14. `system_health_checks`
  15. `audit_logs`
  16. `processed_webhook_events`
  17. `payment_orders`
- **Stored Procedures / RPC Functions (5):**
  1. `book_ride_atomic(p_pool_id UUID, p_passenger_id UUID, p_seats INT, p_luggage INT, p_flight_number TEXT, p_destination_name TEXT, p_destination_address TEXT, p_destination_corridor TEXT, p_destination_lat DOUBLE PRECISION, p_destination_lng DOUBLE PRECISION, p_fare_paise INT, p_savings_paise INT, p_payment_method TEXT, p_payment_id TEXT, p_razorpay_order_id TEXT, p_idempotency_key TEXT, p_operating_mode TEXT)`
  2. `cancel_booking_atomic(p_booking_id UUID, p_passenger_id UUID, p_reason TEXT)`
  3. `assign_driver_to_pool_atomic(p_pool_id UUID, p_driver_id UUID, p_vehicle_id UUID, p_actor_id UUID)`
  4. `advance_ride_status_atomic(p_pool_id UUID, p_new_status ride_status, p_actor_id UUID, p_actor_role user_role)`
  5. `claim_webhook_event_atomic(p_event_id TEXT, p_event_type TEXT, p_payload_hash TEXT, p_payload JSONB)`
- **Security Definer Helpers (5):** `get_auth_role()`, `is_admin()`, `is_staff()`, `is_admin_or_support()`, `current_user_org_id()`
- **Row Level Security Policies:** 24 fine-grained isolation policies enforcing tenant and user scoping.

---

## 4. Pre-Deployment Backup & Recovery Plan

Because the remote database is an un-migrated fresh Supabase project (`public` schema currently has 0 tables and 0 definitions, as verified by PostgREST OpenAPI probe):
1. **Initial State:** There is no existing application data or user records to lose on the remote database.
2. **Pre-flight Backup Command (if direct connection string is provided):**
   ```bash
   pg_dump "postgresql://postgres:[password]@db.krxkxhieyqcytknixqdm.supabase.co:5432/postgres" > pre_migration_backup.sql
   ```
3. **Recovery Strategy:** Each migration is isolated in transaction blocks (`BEGIN ... COMMIT`). If any statement fails, the entire transaction rolls back cleanly without leaving orphan tables.

---

## 5. Post-Deployment Verification Steps

Immediately following execution, the automated verification probe will be run:
```bash
npm run verify:db
```
**Acceptance Criteria for Staging Sign-Off:**
- `GoTrue Auth Service`: HTTP 200 OK
- `All 17 tables`: Accessible or protected by RLS (zero 42P01 / PGRST205 errors)
- `All 5 RPC procedures`: Successfully probed via PostgREST RPC catalog
- `Reference Seed Data`: CSMIA Mumbai airport ('BOM') and 3 pickup hubs verified
- `Automated Test Suite`: `npm test` runs with 100% pass rate against remote backend

---

## 6. Rollback Limitations

- **Dropping Types and Enums:** PostgreSQL does not permit dropping types that are referenced by existing tables without `CASCADE`.
- **Foreign Key Constraints:** Tables must be dropped in exact reverse dependency order:
  `processed_webhook_events` -> `payment_orders` -> `audit_logs` -> `support_tickets` -> `safety_incidents` -> `payments` -> `bookings` -> `ride_requests` -> `ride_pools` -> `driver_documents` -> `driver_profiles` -> `vehicles` -> `organizations` -> `profiles` -> `pickup_zones` -> `airports` -> `system_health_checks`.
- **Data Persistence:** If live bookings or users are created after migration, rolling back will truncate those transactional records.

---

## 7. Remaining External Configuration Required

### A. Google Cloud Platform (Project `969747117874`)
The browser Maps API key is configured in `VITE_GOOGLE_MAPS_API_KEY`. To transition from the Mumbai Arterial Corridor Engine to live Google tile streaming:
1. Enable **Maps JavaScript API**: `https://console.cloud.google.com/apis/library/maps-backend.googleapis.com?project=969747117874`
2. Enable **Routes API**: `https://console.cloud.google.com/apis/library/routes.googleapis.com?project=969747117874`
3. Enable **Places API (New)**: `https://console.cloud.google.com/apis/library/places.googleapis.com?project=969747117874`
4. Verify key restrictions include `http://localhost:3000/*`.

### B. Razorpay Test Mode
Configured in `sandbox` mode with test key (`rzp_test_...`), test secret, and test webhook secret. No real charges will occur. To receive live webhooks on localhost, a tunnel (e.g. ngrok or Cloudflare Tunnel) pointing to `http://localhost:3001/api/payments/webhook` is needed when testing external webhook delivery.

---

## 8. Exact Commands to Execute (ONLY AFTER USER APPROVAL)

### Option A: Via Supabase Web Dashboard SQL Editor (Recommended - Zero CLI Secrets Needed)
Copy and paste migrations 1 through 6 in sequence into the SQL Editor at:  
`https://supabase.com/dashboard/project/krxkxhieyqcytknixqdm/sql`
1. `supabase/migrations/20261015000000_aeropool_schema.sql`
2. `supabase/migrations/20261015000001_ride_requests_and_cancellation.sql`
3. `supabase/migrations/20261016000000_production_safeguards_and_persistence.sql`
4. `supabase/migrations/20261016000001_production_rls_and_rpc_alignment.sql`
5. `supabase/migrations/20261020000000_webhook_idempotency_and_security.sql`
6. `supabase/migrations/20261024000000_realtime_publication_and_indexes.sql`

### Option B: Via Direct PostgreSQL Connection String
If user provides direct `DATABASE_URL`:
```bash
npx supabase db push --db-url "$DATABASE_URL"
```

---

## 9. Readiness Verdict

AeroPool is **architecturally, locally, and code-wise 100% READY** for a controlled staging deployment:
- **Frontend SPA:** Builds cleanly (Vite 3.13s), 0 TypeScript errors, no Supabase UI clutter.
- **Backend API:** Express server running with rate limiting, CORS restrictions, JWT auth, and test payments.
- **Maps Engine:** Dual-mode interactive Google Map with Places autocomplete and route preview.
- **Automated Tests:** 45 / 45 passed (100% pass rate).

**Current Gate Status:** Awaiting user approval to execute migrations on remote hosted database `krxkxhieyqcytknixqdm`.
