# AeroPool — Smart Airport Ride-Pooling SaaS Platform

AeroPool connects passengers arriving at Chhatrapati Shivaji Maharaj International Airport (CSMIA), Mumbai (BOM) with co-travellers heading in the same direction. By sharing verified commercial cabs, passengers save up to 40% on airport transportation while licensed fleet partners maximize vehicle utilization.

---

## 🚀 Key Features & Architectural Highlights

1. **Complete Passenger Booking Workflow (`PassengerBookView.tsx`):**
   - **Step 1 (Flight & Group):** Enter incoming flight (with live CSMIA lookup), arrival date, estimated touchdown, passenger seats (1–8), and baggage requirements.
   - **Step 2 (Destination & Corridor):** Select Mumbai destination with real distance and travel time from BOM (BKC, Bandra, Andheri, Powai, Colaba, Navi Mumbai, etc.).
   - **Step 3 (Pooling Preferences):** Select Shared AeroPool (~38% fare savings) vs Dedicated Private Taxi; customize waiting window tolerance (10–35 min).
   - **Step 4 (Intelligent Matching):** Multi-factor compatibility algorithm ranks active pools and provides clear distinction between Active Pools, New Pool initiation (anchor passenger), and Private rides.
   - **Step 5 (Checkout & Confirmation):** Comprehensive fare breakdown in integer Paise (base, distance, CSMIA parking toll, platform fee, GST); test sandbox payment via Razorpay modal; atomic capacity reservation locking seats instantly.
   - **Live Tracking & Boarding Pass:** Generates 4-digit boarding pass OTP, exact terminal pickup bay/pillar directions, and interactive route map.
   - **Cancellation & Refunds:** Passengers can cancel before pickup, which atomically restores pool seats/luggage and records an automatic refund in the ledger.

2. **Explicit Operating Modes & Production Safeguards:**
   - **`development`**: Sample data, offline transactional fallback, test payment simulation.
   - **`sandbox`**: Connected to Supabase sandbox, Razorpay test keys (`rzp_test_*`), audit logging.
   - **`production`**: Strict persistence required (local fallback disabled for financial and booking operations), live Razorpay keys (`rzp_live_*`) mandatory, mock payment IDs rejected by code and database check constraints.

3. **Backend Health Diagnostics Console (`AdminDashboardView.tsx`):**
   - Admin-only diagnostics monitoring Database, Auth, Flights, Maps & Routing, Payment Gateway, Notifications, and Background Jobs.
   - Live status reporting: `Connected and Verified`, `Configured`, `Configured But Failing`, `Missing Credentials`, `Sandbox Mode`, and `Not Implemented`.

4. **Intelligent Ride-Pooling Engine (`matchingEngine.ts`):**
   - 5-factor weighted algorithm (Route & destination 35%, arrival window overlap 25%, detour tolerance 20%, luggage/seats fit 10%, pool efficiency 10%).
   - Strict detour limit: Rejects detours exceeding 20 minutes or 12 km.
   - Terminal boundary protection: T1 domestic arrivals never mixed with T2 flights.

5. **Minor Currency Engine in Integer Paise (`pricingEngine.ts`):**
   - Zero floating-point rounding errors. All fares, airport parking tolls (₹110 / 11,000 paise), platform fees, GST (5%), and refunds are calculated in integer paise.

6. **Payment Webhook Verification & Idempotency (`paymentWebhookService.ts`):**
   - HMAC-SHA256 signature verification for inbound Razorpay webhooks.
   - Strict replay attack protection with deduplication against processed idempotency keys.

7. **Multi-Role RBAC & Row-Level Security:**
   - **Passenger:** 5-step booking flow, OTP boarding pass, private booking history, cancellation, emergency SOS.
   - **Verified Driver:** Online/Offline toggle, dispatch queue, OTP boarding gate, stop sequence, trip status transitions, weekly earnings.
   - **Fleet Operator:** Organization dashboard, commercial vehicle roster, driver compliance, tenant data isolation.
   - **Super Admin:** Platform KPIs, driver KYC verification queue, live pool monitor, instant refunds, health diagnostics, immutable audit logs.
   - **Customer Support:** Inbound dispute tickets, real-time message thread, case resolution.

8. **CSMIA Mumbai Localization:**
   - Terminals 1 (Domestic) & 2 (International & Sahar Domestic).
   - Dedicated pickup hubs: T2 Level P4 East (Pillars 4–6), T2 Level P7 MLCP, T1 Curbside.
   - Top Mumbai corridors: BKC, Bandra West, Lower Parel/Worli, South Mumbai/Colaba, Powai, Andheri, Borivali, Vashi, and Thane.

9. **PostgreSQL / Supabase Schema & Migrations (`supabase/migrations/`):**
   - `20261015000000_aeropool_schema.sql`: Core schema, enums, RLS policies, atomic `book_ride_atomic` function.
   - `20261015000001_ride_requests_and_cancellation.sql`: `ride_requests` table, performance indexes, atomic `cancel_booking_atomic` function.
   - `20261016000000_production_safeguards_and_persistence.sql`: `system_health_checks` audit table, idempotency keys, `payments_no_mock_in_prod` check constraint, atomic `assign_driver_to_pool_atomic` & `advance_ride_status_atomic` functions.
   - `20261016000001_production_rls_and_rpc_alignment.sql`: Passenger/driver contact alignment on `bookings`, comprehensive RLS policies across all tables, and idempotent `book_ride_atomic` RPC.

10. **Trusted Backend Architecture (`server/index.ts`):**
    - Secure Express server isolating secrets (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`).
    - Dedicated endpoints for order creation, server-side signature verification, and raw webhook handling with replay defense.

---

## 🛠 Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide React, Vite.
- **Backend:** Node.js, Express, `tsx`, HMAC-SHA256 crypto.
- **State & Persistence:** Supabase PostgreSQL with ACID atomic capacity locking; offline ACID transactional store for dev/sandbox.
- **Diagnostics:** 7-Stage Production Readiness Framework (`diagnosticsService.ts`).
- **Security:** HMAC-SHA256 webhook signatures, idempotency key enforcement, Row Level Security (RLS).
- **QA:** 25 automated unit and integration tests executing in-app and via CLI.

---

## 📦 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Select your operating mode: `development`, `sandbox`, or `production`.

### 3. Run Automated Tests

Execute the 25-test automated suite from the terminal:

```bash
npm test
```

Or click **"Verify Test Suite"** in the top navigation bar when running the app.

### 4. Run Trusted Backend Server

In a separate terminal:

```bash
npm run server
```

Server runs on `http://localhost:3001`.

### 5. Run Local Development Server

```bash
npm run dev
```

App runs on `http://localhost:3000`.

### 6. Verify Types & Linting

```bash
npm run lint
```

### 7. Production Build

```bash
npm run build
```

---

## 🧪 Automated Testing (25 Invariants Validated)

1. **Minor currency calculations:** Paise integer arithmetic & deterministic savings.
2. **Strict seat capacity enforcement:** Inadequate seats correctly rejected.
3. **Terminal boundary isolation:** T1 arrivals cannot match T2 pools.
4. **Excessive detour penalty threshold:** Opposing Mumbai corridors rejected.
5. **Transactional capacity reservation:** Overselling prevention.
6. **Concurrency contention:** Simultaneous booking race conditions safely resolved with 0 negative seats.
7. **State machine cancellation & seat release:** Restores pool seats and issues ledger refund.
8. **Security & RBAC:** Row Level Security blocks cross-passenger inspection or cancellation.
9. **Fleet tenant isolation:** Cross-tenant vehicle leakage prevented.
10. **Database integration:** Supabase status accurately verified with resilient ACID store fallback.
11. **Booking workflow:** Valid booking creation, 4-digit OTP assignment, and seat deduction.
12. **Input validation:** Rejection of 0 or negative seat bookings and non-existent pools.
13. **Corridor discrimination:** BKC matches Bandra-BKC corridor; Colaba correctly rejected.
14. **Luggage capacity threshold:** Rejection when requested baggage exceeds available vehicle room.
15. **Configuration validation:** Missing environment variables detected and production startup halted if incomplete.
16. **Database connection failure handling:** Persistent booking operations fail safely without silent local fallback in production.
17. **Persistent booking creation with idempotency:** Valid booking created with unique idempotency key; duplicate requests blocked.
18. **Concurrent seat reservation race condition:** 5 simultaneous requests for 2 seats: exactly 2 granted, 3 rejected, 0 negative seats.
19. **Tenant data isolation between fleet operators:** Roster queries scoped to organization ID without cross-fleet leakage.
20. **Operating mode payment safeguards:** Mock payment IDs blocked in production; sandbox test flags isolated from live revenue.
21. **Payment webhook verification:** HMAC-SHA256 signature verification & replay attack prevention.
22. **External provider failure handling:** Graceful fallback without platform crash when external APIs timeout.
23. **End-to-End Passenger Booking Lifecycle:** Complete 8-step lifecycle validated from request to cancellation & capacity release.
24. **Booking Submission Idempotency Guard:** Deduplicates requests with identical idempotency key without double-decrementing seats.
25. **Server-Side Payment Signature & Sandbox Isolation:** HMAC-SHA256 signature verification & sandbox isolation.
