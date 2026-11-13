# AeroPool — Women's-Only Pool: Security & Privacy Gap Report

**Date:** November 8, 2026  
**Audit Type:** READ-ONLY Security, Compliance, & Threat Model Assessment  
**Classification:** Confirmed Implementation Findings with Remediation Architecture

---

## 1. Executive Summary

This security audit examines the newly stabilized Women's-Only Pooling implementation to identify architectural vulnerabilities, data privacy risks, and compliance limitations prior to staging deployment. 

While the feature reliably isolates ride matching and strictly blocks silent downgrades in normal client flows, this audit identifies **four distinct security and architectural gaps** requiring explicit hardening before production live customer rollout.

---

## 2. Identified Security & Privacy Gaps

### GAP-01: Client-Asserted Eligibility Parameter Trust in Atomic Transaction Boundary
* **Severity:** **HIGH**
* **Classification:** **FAIL** (Vulnerability in direct API caller boundary)
* **Location:** `src/services/db.ts:bookRideAtomic` (Lines 557–560) and `src/services/db.ts:createPoolAndBookAtomic` (Lines 977–980)
* **Mechanism:**
  ```typescript
  const isEligible = Boolean(
    params.isWomenOnlyEligible ||
    womenOnlyService.isPassengerEligible(params.passengerId)
  );
  ```
* **Vulnerability Description:**
  The atomic transaction checks whether `params.isWomenOnlyEligible` is true OR `womenOnlyService.isPassengerEligible(params.passengerId)` is true. If an adversarial client or script bypasses the frontend UI and invokes the database / RPC booking function directly with `{ isWomenOnlyEligible: true, passengerId: 'male-user-id' }`, the parameter is evaluated as truthy without validating the actual passenger profile in the database.
* **Remediation Plan:**
  Remove `params.isWomenOnlyEligible` from caller trust. Enforce server-side evaluation strictly against the authenticated caller's verified database profile:
  ```typescript
  // Recommended Fix:
  const isEligible = womenOnlyService.isPassengerEligible(params.passengerId);
  ```

---

### GAP-02: Self-Declaration vs Independent Identity Proofing
* **Severity:** **MEDIUM (Legal / Compliance Risk)**
* **Classification:** **SIMULATED** (Trust-based self-declaration; not cryptographic KYC)
* **Location:** `src/services/womenOnlyService.ts:optInPassenger`
* **Vulnerability Description:**
  The current implementation grants `status: 'verified'` immediately upon the passenger checking a self-declaration modal checkbox (`selfDeclarationConfirmed: true`). There is:
  1. No verification against Government of India databases (Aadhaar, DigiLocker, PAN, Passport).
  2. No multi-factor identity proofing or document upload requirement.
  3. No independent human or automated identity verification.
  Consequently, self-declaration relies entirely on the honesty of the user. In high-risk late-night airport scenarios, a bad actor can trivially check the box during account registration.
* **Remediation Plan:**
  Clearly display a legal disclaimer in the UI:
  > *"Women-Only Pooling eligibility is currently based on voluntary passenger self-declaration. For full security, Government ID / DigiLocker verification is scheduled for Phase 7."*

---

### GAP-03: Driver KYC & Dedicated Police Clearance Verification Gap
* **Severity:** **MEDIUM**
* **Classification:** **SIMULATED** (General driver status checked; no specialized clearance)
* **Location:** `src/services/db.ts:createPoolAndBookAtomic` (Lines 999–1001)
* **Vulnerability Description:**
  1. **Generic Driver Status:** The driver auto-assignment checks `availableDriver.verificationStatus === 'approved'`. It does NOT verify whether the driver holds a valid, approved `POLICE_VERIFICATION` document record in `DriverDocument`.
  2. **Unsafe Fallback:** If no approved available driver is found in the fleet, the code falls back to `this.state.driverProfiles[0]`, which could assign an unapproved driver in edge cases if fleet records are incomplete.
  3. **Driver Demographics:** The driver assigned to Women-Only rides is a licensed commercial taxi driver (gender unrestricted), which is compliant with Indian commercial taxi permits, but the platform must not advertise "women drivers" unless explicitly verified.
* **Remediation Plan:**
  Hard-fail pool creation if no driver with approved KYC and police verification exists:
  ```typescript
  const availableDriver = this.state.driverProfiles.find(
    (d) => d.verificationStatus === 'approved' && d.isAvailable && d.documents?.some(doc => doc.type === 'POLICE_VERIFICATION' && doc.status === 'approved')
  );
  if (!availableDriver) {
    return { success: false, error: 'No verified commercial driver with approved police clearance is currently available.' };
  }
  ```

---

### GAP-04: Client-Side State Isolation & Missing Express REST Endpoints
* **Severity:** **MEDIUM (Architectural Limitation)**
* **Classification:** **SIMULATED** (In-memory + localStorage; no server-side REST API)
* **Location:** `server/index.ts` and `src/services/womenOnlyService.ts`
* **Vulnerability Description:**
  `womenOnlyService.ts` is currently managed in frontend/service memory and stores configuration in browser `localStorage`. There are no dedicated Express API routes in `server/index.ts` (e.g., `/api/women-only/opt-in`, `/api/admin/women-only/config`) to persist verification records centrally into PostgreSQL.
  If an admin reviews or revokes a passenger in `AdminDashboardView.tsx`, the status change is written to the local service instance, but not synced across separate client devices or server instances.
* **Remediation Plan:**
  Implement server-side REST controllers in `server/index.ts` with authenticated Supabase table persistence (`women_only_verifications`, `women_only_configs`) for distributed synchronization.

---

### GAP-05: PII Exposure in Internal Pool Passenger Objects
* **Severity:** **LOW**
* **Classification:** **PASS (Client UI) / SIMULATED (Raw Object)**
* **Location:** `src/types/index.ts:PoolPassenger`
* **Vulnerability Description:**
  `PoolPassenger` includes `passengerPhone`, `pickupOtp`, and `isWomenOnlyEligible`. While `PassengerBookView.tsx` only renders first names and pickup pillars, raw internal API responses or state dumps could inadvertently expose co-passengers' phone numbers and pickup OTPs if raw pool objects are transmitted over public websocket/REST feeds.
* **Remediation Plan:**
  Ensure server-to-client serializers use a DTO (Data Transfer Object) that strips `passengerPhone` and `pickupOtp` for non-owner passengers.

---

## 3. Gap Classification Summary Table

| Gap ID | Security / Architectural Risk | Current Behavior | Severity | Classification | Status for Staging |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **GAP-01** | Client parameter trust (`params.isWomenOnlyEligible`) | Evaluates caller-supplied boolean | **HIGH** | **FAIL** | Blocked for direct API; safe in UI |
| **GAP-02** | Voluntary self-declaration without Gov ID | Checkbox opt-in in modal | **MEDIUM** | **SIMULATED** | Acceptable with disclaimer |
| **GAP-03** | Missing dedicated police clearance check on driver | General KYC approved check + fallback | **MEDIUM** | **SIMULATED** | Acceptable for sandbox test |
| **GAP-04** | Client-side memory & localStorage persistence | No Express REST endpoints in server | **MEDIUM** | **SIMULATED** | Acceptable for local dev/staging |
| **GAP-05** | Raw pool passenger object contains phone & OTP | UI masks; raw state stores full fields | **LOW** | **PASS (UI) / SIMULATED** | Acceptable for staging |
