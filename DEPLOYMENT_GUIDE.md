# AeroPool — Deployment & Configuration Guide

This guide details configuration, database migrations, operating modes, security settings, backend health diagnostics, server-side secret isolation, and deployment procedures for AeroPool.

---

## 1. Operating Modes & Environment Configuration

AeroPool supports 3 explicit operating modes defined via `VITE_OPERATING_MODE`:

| Mode | Environment | Behavior & Security Safeguards |
| :--- | :--- | :--- |
| **`development`** | Local dev / tests | Sample in-memory data, local fallback store enabled, synthetic flights tagged, test payment simulation enabled. |
| **`sandbox`** | Staging / QA | Connected to Supabase Sandbox DB, Razorpay Test Key (`rzp_test_*`), synthetic/timetable flights tagged, test payments allowed with sandbox audit flag. |
| **`production`** | Live Production | **Strict Persistence:** Real Supabase PostgreSQL database required; local offline fallback is strictly disabled for financial/booking transactions. **Payment Safeguards:** Requires `rzp_live_*` keys; mock payments are blocked by code and SQL check constraints. Startup fails if required credentials are missing. |

### Environment Variables (.env)

Copy `.env.example` to `.env`:

```env
# ==============================================================================
# 1. OPERATING MODE
# ==============================================================================
VITE_OPERATING_MODE="sandbox" # Options: development | sandbox | production
VITE_APP_URL="https://aeropool.example.com"

# ==============================================================================
# 2. SUPABASE (POSTGRESQL & AUTH)
# ==============================================================================
# Public Client Keys (Safe for browser client)
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"

# Server-Only Privileged Keys (NEVER expose to browser client)
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
DATABASE_URL="postgresql://postgres:password@db.your-project.supabase.co:5432/postgres"

# ==============================================================================
# 3. PAYMENT GATEWAY (RAZORPAY)
# ==============================================================================
# Public Key (Safe for browser client)
VITE_RAZORPAY_KEY_ID="rzp_test_YourTestKeyHere" # In production: must begin with rzp_live_

# Server-Only Secrets (Handled ONLY by Node.js server)
RAZORPAY_KEY_SECRET="YourRazorpaySecret"
RAZORPAY_WEBHOOK_SECRET="YourWebhookSecret"

# ==============================================================================
# 4. EXTERNAL INTEGRATIONS
# ==============================================================================
FLIGHT_API_KEY="" # AviationStack / FlightRadar24 API key (optional, falls back to published timetable)
VITE_MAP_TILES_URL="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
```

> [!CAUTION]
> Never include `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, or `DATABASE_URL` in frontend code. Any variable prefixed with `VITE_` is bundled into the client build. All privileged operations must route through the trusted backend server (`server/index.ts`).

---

## 2. PostgreSQL / Supabase Schema & DDL Migrations

Execute the migration scripts located in `supabase/migrations/` in exact sequential order:

### 1. `20261015000000_aeropool_schema.sql` (Master Schema)
- Creates enums: `user_role`, `verification_status`, `ride_status`, `payment_status`.
- Creates core tables: `profiles`, `organizations`, `vehicles`, `driver_profiles`, `driver_documents`, `airports`, `pickup_zones`, `ride_pools`, `bookings`, `payments`, `safety_incidents`, `support_tickets`, `audit_logs`.
- Enables Row Level Security (RLS) on all tables.
- Implements atomic function `book_ride_atomic` with row locking (`FOR UPDATE`) to prevent concurrent seat overselling.

### 2. `20261015000001_ride_requests_and_cancellation.sql` (Demand & Cancellation)
- Creates `ride_requests` table to persist unmatched passenger requests.
- Adds performance indexes on pool status, passenger IDs, and timestamps.
- Implements atomic function `cancel_booking_atomic` with seat and luggage restoration.

### 3. `20261016000000_production_safeguards_and_persistence.sql` (Safeguards & Dispatch)
- Creates `system_health_checks` audit table for diagnostic history.
- Adds `operating_mode` and `idempotency_key` columns with unique constraints on `bookings` and `payments`.
- Adds check constraint `payments_no_mock_in_prod` preventing test IDs (`pay_BOM_%`) from entering live production records.
- Implements atomic functions:
  - `assign_driver_to_pool_atomic`: Validates driver KYC (`approved`) and vehicle registration before assigning to an active pool.
  - `advance_ride_status_atomic`: Enforces strict state machine transitions (`DRIVER_ASSIGNED` ➔ `DRIVER_EN_ROUTE` ➔ `DRIVER_ARRIVED` ➔ `PICKUP_CONFIRMED` ➔ `IN_PROGRESS` ➔ `COMPLETED`).

### 4. `20261016000001_production_rls_and_rpc_alignment.sql` (RLS & RPC Alignment)
- Adds denormalized passenger and driver contact fields on `bookings` (`passenger_name`, `passenger_phone`, `driver_id`, `driver_name`, `driver_phone`, `vehicle_plate`, `vehicle_model`).
- Implements comprehensive Row Level Security (RLS) policies:
  - `profiles`: Self-read/update, admin manage.
  - `organizations`: Tenant self-read, admin manage.
  - `driver_documents`: Private owner read/upload, admin approve.
  - `bookings`: Passenger own-bookings read/create/cancel, driver assigned-pool read, admin full access.
  - `payments`: User read own payments, admin audit.
  - `ride_pools`: Authenticated user read available pools, admin manage.
  - Reference tables (`airports`, `pickup_zones`): Public read.
- Updates `book_ride_atomic` to support `p_payment_id`, `p_razorpay_order_id`, `p_idempotency_key`, and `p_operating_mode` with deterministic idempotency replay guards.

---

## 3. Trusted Backend Architecture

To guarantee that private credentials (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) are never leaked to browser client bundles, AeroPool includes an Express-based secure backend server:

- **Source:** `server/index.ts`
- **Execution:** `npm run server` (starts on port 3001)
- **Vite Proxy:** Local frontend dev server proxies `/api/*` requests directly to `http://localhost:3001`.

### Privileged Endpoints:
1. `POST /api/payments/create-order`: Securely contacts Razorpay Orders API using `RAZORPAY_KEY_SECRET`.
2. `POST /api/payments/verify-signature`: Performs server-side HMAC-SHA256 signature verification comparing `order_id|payment_id` against the secret hash.
3. `POST /api/payments/webhook`: Parses raw request body (`express.raw()`) to validate Razorpay webhook signatures (`X-Razorpay-Signature`) and enforces replay protection against duplicate event IDs.
4. `GET /api/health/status`: Returns 7-stage production readiness metrics without exposing secrets or connection strings.

---

## 4. 7-Stage Production Readiness Framework

AeroPool evaluates system readiness across 7 distinct operational gates:

1. **Source Code Implemented:** Core logic, state machines, atomic functions, and validation handlers are written.
2. **Configuration Missing:** Detects missing `.env` variables or invalid key prefixes before runtime failure.
3. **Database Connected:** Active network ping (`SELECT 1` or REST ping) verifies database connectivity.
4. **Migrations Applied:** Verifies that required schema tables, RLS policies, and RPC stored procedures exist in PostgreSQL.
5. **Integration Tested:** Automated end-to-end integration test passes against the connected environment.
6. **External Service Awaiting Approval:** Flags third-party accounts (Razorpay Live merchant KYC, FlightRadar API keys) pending commercial activation.
7. **Production Operation Verified:** Continuous runtime verification confirming live transactions execute with zero local fallback.

---

## 5. Production Deployment Checklist

Before deploying to live production:

- [ ] **Database Setup:** Supabase project provisioned and all 4 SQL migrations executed in sequential order.
- [ ] **RLS Policies Active:** Verify in Supabase Studio that RLS is enabled on all tables and tenant isolation is enforced.
- [ ] **Server Process Started:** Deploy backend service (`npm run server`) with environment variables injected securely (e.g. via Doppler, AWS Secrets Manager, or Supabase Edge Functions).
- [ ] **Payment Gateway Verified:** `VITE_RAZORPAY_KEY_ID` set to live key (`rzp_live_*`). Webhook endpoint (`/api/payments/webhook`) registered in Razorpay Dashboard with matching `RAZORPAY_WEBHOOK_SECRET`.
- [ ] **Flight Telemetry:** If real-time radar is required, configure `FLIGHT_API_KEY`. Otherwise, timetable fallback is active and clearly labelled.
- [ ] **Automated Test Suite:**
  ```bash
  npm test
  ```
  Ensure all 25 tests pass.
- [ ] **Production Build:**
  ```bash
  npm run build
  ```
  Ensure frontend bundle compiles cleanly with 0 TypeScript errors.
- [ ] **Diagnostics Verification:**
  Navigate to `/admin` ➔ **Health & Diagnostics**. Run the live diagnostic probe and ensure all core subsystems pass.

---

## 6. Staging Deployment & Verification Guide (First Real Staging Launch)

Follow these exact steps to execute AeroPool's first staging deployment:

### Step 1: Provision Supabase Staging Project
1. Create a project at [supabase.com](https://supabase.com) (e.g. `aeropool-staging`).
2. Navigate to **Project Settings** ➔ **API**:
   - Copy the Project URL (set as `VITE_SUPABASE_URL`).
   - Copy the `anon` public key (set as `VITE_SUPABASE_ANON_KEY`).
   - Copy the `service_role` secret key (set as `SUPABASE_SERVICE_ROLE_KEY` in backend service only).
3. Navigate to **Database** ➔ **Connection Pooling**:
   - Copy the Transaction connection string (set as `DATABASE_URL` in backend service only).

### Step 2: Execute Database Migrations in Sequential Order
Open the **Supabase SQL Editor** and execute each script in exact numerical sequence:
1. `supabase/migrations/20261015000000_aeropool_schema.sql` (Creates enums, 12 core tables, text pickup zones, seeds CSMIA airport & pickup zones, indexes, and initial RLS).
2. `supabase/migrations/20261015000001_ride_requests_and_cancellation.sql` (Creates `ride_requests`, indexes, and atomic cancellation RPC).
3. `supabase/migrations/20261016000000_production_safeguards_and_persistence.sql` (Creates `system_health_checks`, idempotency keys, payment constraints, driver assignment and status progression RPCs).
4. `supabase/migrations/20261016000001_production_rls_and_rpc_alignment.sql` (Creates non-recursive RLS security helper functions `is_admin()`, `is_staff()`, applies hardened policies to all tables, and configures idempotent `book_ride_atomic` RPC).

### Step 3: Configure Hosting (Render Blueprint or Vercel + Container)

#### Option A: Render Blueprint (Recommended)
Use [render.yaml](file:///c:/Users/praty/Aeropool%201/render.yaml) to automatically deploy both services:
1. Push repository to GitHub.
2. In Render Dashboard, click **New +** ➔ **Blueprint** and select your repository.
3. Render automatically creates:
   - `aeropool-backend`: Node Web Service running `npm run server` with `/api/health/status` health check.
   - `aeropool-frontend`: Static Site running `npm run build` publishing `dist` with SPA routing.
4. Set the environment variables in the Render Dashboard:

| Service | Environment Variable | Value / Source |
| :--- | :--- | :--- |
| **`aeropool-backend`** | `PORT` | `3001` |
| | `NODE_ENV` | `production` |
| | `VITE_OPERATING_MODE` | `sandbox` |
| | `VITE_SUPABASE_URL` | Your Supabase project URL |
| | `VITE_SUPABASE_ANON_KEY` | Supabase public anon key |
| | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret |
| | `DATABASE_URL` | PostgreSQL connection string |
| | `VITE_RAZORPAY_KEY_ID` | `rzp_test_...` |
| | `RAZORPAY_KEY_SECRET` | Razorpay test secret key |
| | `RAZORPAY_WEBHOOK_SECRET` | Razorpay test webhook secret |
| | `FRONTEND_URL` | Host of `aeropool-frontend` |
| **`aeropool-frontend`** | `VITE_OPERATING_MODE` | `sandbox` |
| | `VITE_SUPABASE_URL` | Your Supabase project URL |
| | `VITE_SUPABASE_ANON_KEY` | Supabase public anon key |
| | `VITE_RAZORPAY_KEY_ID` | `rzp_test_...` |
| | `VITE_API_URL` | Host of `aeropool-backend` (e.g. `https://aeropool-backend.onrender.com`) |

#### Option B: Split Host (Vercel Frontend + Render/Railway Backend)
1. Deploy frontend to Vercel using [vercel.json](file:///c:/Users/praty/Aeropool%201/vercel.json).
2. Set `VITE_API_URL="https://your-backend-service.com"` in Vercel.
3. Deploy backend to Node runtime with `npm run server`.

### Step 4: Staging Verification Checklist
Once deployed, verify:
- [ ] **Live Health Probe:** Visit `https://your-backend.com/api/health/status`. Verify that:
  - `subsystems.database.connected` is `true`.
  - `subsystems.database.migrationsApplied` is `true`.
  - `subsystems.auth.connected` is `true`.
  - `subsystems.payment_gateway.liveApiVerified` is `true`.
- [ ] **Super Admin Diagnostics:** Open frontend at `/admin` ➔ **Health & Diagnostics**. Run the live probe and confirm all 8 cards reflect verified status.
- [ ] **Passenger Booking Flow:** Complete a test booking with arrival at BOM T2 and destination BKC. Verify:
  - Order created via trusted server endpoint.
  - Payment simulation passes with `isSandbox: true`.
  - Seat reserved atomically in Supabase PostgreSQL `ride_pools` table.
  - Booking record created in `bookings` table.
- [ ] **Tamper & Failure Test:** Simulate network drop during booking submission to verify clear error modal without corrupt local fallback.


