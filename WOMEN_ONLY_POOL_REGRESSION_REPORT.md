# AeroPool — Women's-Only Pool: Regression Testing Report

**Date:** November 8, 2026  
**Status:** ALL 205 TESTS PASSING (100% Pass Rate)  
**Execution Time:** 52,224 ms (Combined Suite)

---

## 1. Overview & Verification Strategy

To guarantee that introducing the Women's-Only Pooling feature did not degrade or alter existing core systems, an exhaustive multi-category regression verification was executed.

All existing booking categories, financial commission engines, dynamic fare structures, atomic concurrency controls, and airport toll systems were verified alongside the new feature.

---

## 2. Regression Test Results by Category

### Category 1: Commission Split & Financial Integrity (80/20 Policy)
* **Policy Verification:** 80% to driver partner, 20% to AeroPool platform verified across integer minor units (paise).
* **Driver Weekly Statements:** Verified net earnings, platform commission deductions, and TDS withholdings.
* **Toll Handling:** CSMIA airport toll (₹150) and Bandra-Worli Sea Link / Atal Setu toll additions remain strictly transparent with 0 commission levied on statutory tolls.
* **Status:** **PASS** (Tests 1, 26-35, 120-135).

### Category 2: Dynamic Pricing Engine & Fare Calculation
* **Standard Shared AeroPool:** Fares calculate with up to 40% passenger savings based on occupancy split.
* **Women's-Only Pool:** Fares match standard shared pool pricing identically (₹328.69 for BKC corridor), ensuring zero premium or surcharge for safety.
* **Private Airport Taxi:** Dedicated vehicle direct solo meter fare (₹539.07 for BKC) remains unchanged.
* **Status:** **PASS** (Tests 1, 10, 205).

### Category 3: Booking Categories & Capacity Allocation
* **Terminal Isolation:** T1 and T2 passengers are strictly isolated; cross-terminal pooling is blocked.
* **Seat Allocation:** Standard shared pools accept up to 3 co-passengers (4 seats total); Private rides reserve all seats for single party; Women-Only pools reserve seats exclusively for verified women.
* **Luggage Capacity:** Strict luggage volume checks (max 3 bags) prevent vehicle overloading.
* **Status:** **PASS** (Tests 2, 3, 5, 11, 12).

### Category 4: Concurrency & Atomic Store Boundaries
* **Overselling Protection:** Simultaneous atomic booking requests for the final seat resolve deterministically: 1 request succeeds, 2nd request fails with HTTP 409 / Insufficient Seats error.
* **Zero Negative Capacity:** Pool available seats never drop below 0.
* **Status:** **PASS** (Tests 5, 6, 202).

### Category 5: Cancellation & Automated Refund Engine
* **Seat Restoration:** When a booking in a Women-Only or Shared pool is cancelled, available seats increment immediately.
* **Freed Seat Protection:** When a seat in a Women-Only pool is cancelled, the released seat remains strictly restricted to verified women only. Male attempts to claim freed seats are rejected at transaction boundary.
* **Ledger Refunds:** Full or partial refunds credit the passenger ledger atomically with idempotency protection.
* **Status:** **PASS** (Tests 7, 203).

### Category 6: Role-Based Access Control (RBAC) & Tenant Isolation
* **Passenger Boundary:** Row Level Security (RLS) blocks cross-passenger booking inspections.
* **Fleet Isolation:** Commercial fleets (e.g. MetroCab Fleet Solutions LLP) can only access vehicles and statements within their organization ID.
* **Super Admin Controls:** Platform toggles, nighttime windows, and verification queues require Super Admin privileges with audit logging.
* **Status:** **PASS** (Tests 8, 9, 204).

---

## 3. Women's-Only Pool Specific Test Scenarios (10/10)

| Suite # | Test Scenario Description | Category | Result | Duration |
| :---: | :--- | :---: | :---: | :---: |
| **1** | Eligible woman passenger initiates and anchors new Women-Only Pool | MATCHING | **PASS** | 0.34ms |
| **2** | Male / standard shared co-passengers strictly excluded from matching | MATCHING | **PASS** | 1.17ms |
| **3** | Mixed-gender booking rejected at database transaction boundary | SECURITY | **PASS** | 0.53ms |
| **4** | Two verified women flyers matched and booked into same vehicle | MATCHING | **PASS** | 2.08ms |
| **5** | Incompatible corridor yields 0 false matches for safe fallback handling | MATCHING | **PASS** | 0.07ms |
| **6** | Silent downgrade strictly prohibited without explicit confirmation | SECURITY | **PASS** | 0.07ms |
| **7** | Concurrent contention rejects unauthorized passenger, awards seat safely | CAPACITY | **PASS** | 0.33ms |
| **8** | Freed seat from cancellation remains restricted to verified women only | STATE_MACHINE | **PASS** | 0.26ms |
| **9** | Super Admin configuration updates & verification review operational | SECURITY | **PASS** | 0.37ms |
| **10** | Preserves compatibility with Shared AeroPool & Private Taxi pricing | PRICING | **PASS** | 0.08ms |

---

## 4. Staging Readiness Assessment

* **Security Boundaries:** Confirmed fail-closed in sandbox and production modes.
* **Data Privacy:** Confirmed zero algorithmic inference from names/photos; voluntary opt-in architecture.
* **Pricing & Billing:** 100% compliant with 80/20 driver commission policy.
* **Recommendation:** **READY FOR STAGING TESTING.** All 205 automated tests and production builds pass unconditionally.
