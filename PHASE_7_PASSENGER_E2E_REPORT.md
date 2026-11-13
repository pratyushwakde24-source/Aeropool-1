# AEROPOOL — PHASE 7: PASSENGER E2E REPORT

**Audit Date:** 2026-11-05T12:55:00Z (UTC) / 2026-11-05T18:25:00+05:30 (IST)  
**Target Environment:** Staging Supabase Reference `rkuzkwggijthbqwlwnps` (`aeropool-staging.supabase.co`)  
**Protected Baseline:** `krxkxhieyqcytknixqdm` (**STRICTLY UNTOUCHED**)  
**Operating Mode:** `VITE_OPERATING_MODE="sandbox"`  
**Controlled Passenger Test Identity:** `staging.e2e.passenger@aeropool.com` (UUID: `7960cb2e-42fd-4cdc-85f7-be8e25eb0f97`)  

---

## 1. EXECUTIVE SUMMARY

The end-to-end passenger lifecycle was validated on the live staging database and trusted backend service. All ten critical passenger stages were exercised, covering account provisioning, session authentication, flight data handling, hub selection, atomic booking, concurrency enforcement, idempotency, and atomic cancellation.

```
================================================================================
PASSENGER E2E VERDICT: 10 of 10 SCENARIOS PASSED
Zero regressions. Full atomic ACID booking and cancellation verified on remote DB.
================================================================================
```

---

## 2. DETAILED TEST SCENARIOS & RESULTS

| # | Workflow Scenario | Execution Method | Expected Behavior | Actual Behavior | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **P-01** | **Passenger Registration / Provisioning** | GoTrue Admin API & `profiles` table | Account provisioned with `role: passenger`; adversarial role escalation in metadata blocked | User `7960cb2e-42fd...` verified; `profiles.role` strictly `'passenger'` | **PASSED** |
| **P-02** | **Passenger Login** | `signInWithPassword` | Valid email/password issues authenticated JWT session | Received valid GoTrue JWT session token | **PASSED** |
| **P-03** | **Session Restoration & Token Persistence** | LocalStorage JWT hydration | Valid token restores user profile without requiring re-login | Client session reconstituted with user metadata | **PASSED** |
| **P-04** | **Passenger Profile Retrieval** | `SELECT * FROM profiles WHERE id = auth.uid()` | Returns flyer profile data while blocking write modifications to role | Profile retrieved; direct SQL update to `role: admin` rejected by RLS | **PASSED** |
| **P-05** | **Flight Details & Schedule Handling** | Flight lookup service | Parses flight number (e.g. `6E 5324`), validates terminal (T2) | Validated flight details against CSMIA terminal scheduling | **PASSED** |
| **P-06** | **Airport Pickup Hub Selection** | Query `pickup_zones` at CSMIA (`BOM`) | Discovers designated pickup pillars at T1 and T2 | Retrieved 3 verified pickup hubs across T1 and T2 | **PASSED** |
| **P-07** | **Destination Search & Corridor Discrimination** | Matching Engine (`geoService.ts`) | Matches compatible corridors (BKC); rejects opposite corridors | BKC destination matched Western Suburbs corridor (98% match score) | **PASSED** |
| **P-08** | **Atomic Ride Booking Creation** | `book_ride_atomic` RPC | Atomically decrements pool capacity, inserts booking, issues 4-digit OTP | Booking `4b84cec1...` confirmed, OTP `7347` generated, seats reduced | **PASSED** |
| **P-09** | **Booking History & Status Tracking** | Query `bookings` scoped to `passenger_id` | Returns active and completed bookings for the authenticated passenger | Retrieved bookings history scoped strictly to authenticated flyer | **PASSED** |
| **P-10** | **Atomic Booking Cancellation** | `cancel_booking_atomic` RPC | Restores pool seats, transitions status to `CANCELLED`, issues full ledger refund | Status updated to `CANCELLED`, 2 seats restored, refund of ₹385.00 logged | **PASSED** |

---

## 3. CONCURRENCY & RELIABILITY DEEP DIVE

### 3.1 Overbooking Concurrency Guard
- **Test:** A request was submitted for 5 passenger seats in pool `692c3b32...` when only 2 seats remained available.
- **Result:** **PASSED**. The atomic transaction rejected the request with:
  `"Insufficient seats remaining in pool (requested 5, only 2 available)."`
- **Integrity:** Zero negative available seats or overselling occurred.

### 3.2 Idempotency Replay Protection
- **Test:** A booking request carrying the identical idempotency key `idemp_stag_1793882362546_001` was re-submitted.
- **Result:** **PASSED**. The RPC detected the existing transaction and returned:
  `{ success: true, booking_id: "4b84cec1-a1cc-4b6c-8773-d81f0ab074c9", is_duplicate: true }`
- **Integrity:** No secondary booking was inserted; no duplicate seat reduction occurred.

### 3.3 Cancellation & Capacity Restoration
- **Test:** Cancelled booking `4b84cec1...` via `cancel_booking_atomic`.
- **Result:** **PASSED**. Released 2 seats back to pool `692c3b32...`, verified status `'CANCELLED'` directly in remote PostgreSQL `bookings` table.

---

## 4. PASSENGER E2E VERDICT

```
================================================================================
PASSENGER E2E VERDICT: PASSED
All passenger workflows operate reliably against staging Supabase project
rkuzkwggijthbqwlwnps with complete data consistency and ACID guarantees.
================================================================================
```

