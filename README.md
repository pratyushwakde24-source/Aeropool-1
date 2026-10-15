# AeroPool — Smart Airport Ride-Pooling SaaS Platform

AeroPool connects passengers arriving at Chhatrapati Shivaji Maharaj International Airport (CSMIA), Mumbai (BOM) with co-travellers heading in the same direction. By sharing verified commercial cabs, passengers save up to 40% on airport transportation while licensed fleet partners maximize vehicle utilization.

---

## 🚀 Key Features & End-to-End Workflow

1. **Complete Passenger Booking Workflow (`PassengerBookView.tsx`):**
   - **Step 1 (Flight & Group):** Enter incoming flight (with live CSMIA lookup), arrival date, estimated touchdown, passenger seats (1–8), and baggage requirements.
   - **Step 2 (Destination & Corridor):** Select Mumbai destination with real distance and travel time from BOM (BKC, Bandra, Andheri, Powai, Colaba, Navi Mumbai, etc.).
   - **Step 3 (Pooling Preferences):** Select Shared AeroPool (~38% fare savings) vs Dedicated Private Taxi; customize waiting window tolerance (10–35 min).
   - **Step 4 (Intelligent Matching):** Multi-factor compatibility algorithm ranks active pools and provides clear distinction between Active Pools, New Pool initiation (anchor passenger), and Private rides.
   - **Step 5 (Checkout & Confirmation):** Comprehensive fare breakdown in integer Paise (base, distance, CSMIA parking toll, platform fee, GST); test sandbox payment via Razorpay modal; atomic capacity reservation locking seats instantly.
   - **Live Tracking & Boarding Pass:** Generates 4-digit boarding pass OTP, exact terminal pickup bay/pillar directions, and interactive route map.
   - **Cancellation & Refunds:** Passengers can cancel before pickup, which atomically restores pool seats/luggage and records an automatic refund in the ledger.

2. **Intelligent Ride-Pooling Engine (`matchingEngine.ts`):**
   - 5-factor weighted algorithm (Route & destination 35%, arrival window overlap 25%, detour tolerance 20%, luggage/seats fit 10%, pool efficiency 10%).
   - Strict detour limit: Rejects detours exceeding 20 minutes or 12 km.
   - Terminal boundary protection: T1 domestic arrivals never mixed with T2 flights.

3. **Minor Currency Engine in Integer Paise (`pricingEngine.ts`):**
   - Zero floating-point rounding errors. All fares, airport parking tolls (₹110 / 11,000 paise), platform fees, GST (5%), and refunds are calculated in integer paise.

4. **Multi-Role RBAC & Row-Level Security:**
   - **Passenger:** 5-step booking flow, OTP boarding pass, private booking history, cancellation, emergency SOS.
   - **Verified Driver:** Online/Offline toggle, dispatch queue, OTP boarding gate, stop sequence, trip status transitions, weekly earnings.
   - **Fleet Operator:** Organization dashboard, commercial vehicle roster, driver compliance, tenant data isolation.
   - **Super Admin:** Platform KPIs, driver KYC verification queue, live pool monitor, instant refunds, immutable audit logs.
   - **Customer Support:** Inbound dispute tickets, real-time message thread, case resolution.

5. **CSMIA Mumbai Localization:**
   - Terminals 1 (Domestic) & 2 (International & Sahar Domestic).
   - Dedicated pickup hubs: T2 Level P4 East (Pillars 4–6), T2 Level P7 MLCP, T1 Curbside.
   - Top Mumbai corridors: BKC, Bandra West, Lower Parel/Worli, South Mumbai/Colaba, Powai, Andheri, Borivali, Vashi, and Thane.

6. **PostgreSQL / Supabase Schema & Migrations (`supabase/migrations/`):**
   - `20261015000000_aeropool_schema.sql`: Profiles, organizations, vehicles, driver_profiles, driver_documents, airports, pickup_zones, ride_pools, bookings, payments, safety_incidents, support_tickets, audit_logs, `book_ride_atomic` function, RLS policies.
   - `20261015000001_ride_requests_and_cancellation.sql`: `ride_requests` table, performance indexes, RLS policies, and `cancel_booking_atomic` function with capacity restoration and refund logic.

---

## 🛠 Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide React, Vite.
- **State & Persistence:** LocalStorage / IndexedDB Transactional Database with ACID capacity locking and state event listeners.
- **Backend / PostgreSQL:** Supabase client with PostgreSQL migration scripts and Row Level Security (RLS).
- **QA:** In-app Automated Architecture & Concurrency Test Suite (10 tests).

---

## 📦 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Run Local Development Server

```bash
npm run dev
```

App runs on `http://localhost:3000`.

### 3. Verify Types & Linting

```bash
npm run lint
```

### 4. Production Build

```bash
npm run build
```

---

## 🧪 Automated Testing

Click the **"Verify Test Suite"** button in the top navigation bar or Super Admin console to run the automated test suite in real time. The suite validates all 14 core invariants:

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

---

## 📄 Documentation

- `PROJECT_AUDIT.md`: Workspace inspection, gap remediation, and security sign-off.
- `IMPLEMENTATION_PLAN.md`: Milestone roadmap and completed deliverables.
- `FEATURE_STATUS.md`: Comprehensive module-by-module feature status matrix.
- `DEPLOYMENT_GUIDE.md`: Supabase PostgreSQL DDL migrations, RLS policies, and production deployment guide.
