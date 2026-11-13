# AeroPool Phase 2.6 — KYC Data Consistency & Rollback Resilience Remediation Report

**Remediation Date:** November 11, 2026  
**Scope:** Local Code Remediation of Findings from `AEROPOOL_KYC_PHASE_2_5_INDEPENDENT_PREDEPLOYMENT_AUDIT.md`  
**Operating Mode:** `sandbox` (`VITE_OPERATING_MODE="sandbox"`)  
**Storage Provider:** `local` (`AEROPOOL_KYC_STORAGE_PROVIDER="local"`)  
**Protected Baseline Project:** `krxkxhieyqcytknixqdm` (**STRICTLY UNTOUCHED & UNREFERENCED**)  
**Final Verdict:** **`ALL THREE ISSUES RESOLVED LOCALLY`**

---

## 1. Executive Summary

This remediation resolved all three architectural, data-consistency, and deduplication risks identified in the Phase 2.5 pre-deployment audit. Every code change has been implemented locally, verified via TypeScript (`0 errors`), compiled cleanly via Vite (`813ms`), and validated by **22 new targeted tests**, expanding the automated master test suite to **267 / 267 passing tests (100% Pass Rate)**.

> [!IMPORTANT]
> **Local Verification Disclaimer:** All cloud storage and PostgreSQL metadata interactions added in this remediation were verified locally against **mocked cloud clients** (`setMockSupabaseStorageClient` and `setMockSupabaseDbClient`). No remote migrations were executed and no live staging writes were performed.

---

## 2. Finding 1: Driver License Number Normalization & Deduplication

### 2.1. Original Problem
- [src/services/db.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/services/db.ts) and [src/views/DriverKYCView.tsx](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/views/DriverKYCView.tsx) normalized licenses only using `.trim().toUpperCase()`.
- Formatting variations containing hyphens (`MH-02-2021-0098765`), internal spaces (`MH 02 2021 0098765`), or slashes bypassed duplicate detection checks and database `UNIQUE` constraints.
- Empty strings or whitespace-only inputs skipped validation checks in draft or submission states.

### 2.2. Files Changed & Created
- **Created:** [src/utils/licenseNormalization.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/utils/licenseNormalization.ts)
- **Modified:** [src/services/db.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/services/db.ts#L1898-L1920)
- **Modified:** [src/views/DriverKYCView.tsx](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/views/DriverKYCView.tsx#L392-L460)
- **Created (Not Executed):** [supabase/migrations/20261110000000_normalized_license_and_resilient_kyc.sql](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/supabase/migrations/20261110000000_normalized_license_and_resilient_kyc.sql)

### 2.3. Implementation Details
1. **Centralized Normalization (`normalizeLicenseNumber`):**
   - Strips leading/trailing whitespace, removes internal spaces, hyphens, and slashes (`/[\s\-\/]/g`), and enforces uppercase conversion.
2. **MoRTH Sarathi Regulatory Validation (`validateLicenseNumber`):**
   - Validates alphanumeric character integrity (`^[A-Z0-9]+$`).
   - Enforces length bounds (10–16 characters).
   - Verifies Indian State/UT 2-letter prefixes against the official MoRTH registry (`VALID_INDIAN_STATE_CODES`).
   - Strictly rejects `NULL`, empty strings (`""`), and whitespace-only values (`"   "`).
   - Computes human-readable `displayFormatted` output (e.g., `MH-02-2021-0098765`) while using `canonical` (`MH0220210098765`) for matching and uniqueness.
3. **Database Constraint Hardening (`20261110000000_normalized_license_and_resilient_kyc.sql`):**
   - Adds functional unique index `uq_driver_profiles_clean_license` on `(regexp_replace(UPPER(license_number), '[\s\-\/]', '', 'g'))` to block concurrent race-condition duplicates at the PostgreSQL layer.
   - Adds `CHECK` constraint `chk_driver_profiles_license_not_empty` prohibiting short or empty strings.

### 2.4. Tests Added & Results
- **9 tests** added in [src/tests/kycRemediationTestSuite.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/tests/kycRemediationTestSuite.ts) (Tests 1–9): Exact duplicates, case variations, whitespace padding, hyphen variations, internal space variations, empty strings, NULL inputs, invalid state/format, and concurrent duplicate collisions.
- **Result:** **9 / 9 PASS (100%)**.

### 2.5. Remaining Limitations
- The database migration (`20261110000000_normalized_license_and_resilient_kyc.sql`) is staged locally and has **not** been applied to the remote Supabase database per safety rules.

---

## 3. Finding 2: Authoritative KYC Metadata & Ephemeral Container Recovery

### 3.1. Original Problem
- `getDriverDocuments()` and `getStoredKycDocument()` delegated strictly to the repository selected by `AEROPOOL_KYC_STORAGE_PROVIDER`.
- When switched to `local`, queries read solely from local disk (`kyc_registry.json`), rendering cloud-stored documents invisible if the local registry was empty or restarted on ephemeral disks.
- Startup rehydration never checked PostgreSQL.

### 3.2. Files Changed
- **Modified:** [server/kycStorageService.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L926-L1085)
- **Modified:** [server/index.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1802-L1814)

### 3.3. Implementation Details
1. **Authoritative Merged Listing (`getDriverDocuments`):**
   - Queries `SupabasePostgresMetadataRepository` first as the authoritative source for cloud documents.
   - Queries `LocalJsonMetadataRepository` to preserve legacy local sandbox documents.
   - Deduplicates by `doc.id` using a `Map<string, StoredKycDocument>`, preventing duplicate metadata records during fallback.
   - Preserves each document's original `storageBackend` field without alteration.
2. **Resilient Lookup (`getStoredKycDocument`):**
   - Checks in-memory cache $\to$ authoritative PostgreSQL repository $\to$ local JSON repository.
3. **Startup Rehydration (`rehydrateRegistryFromPostgres`):**
   - Executed asynchronously on Express server boot inside `server/index.ts` to populate in-memory caches from remote PostgreSQL rows when credentials are available.

### 3.4. Tests Added & Results
- **7 tests** added covering local listing, mocked Supabase listing, mixed local/cloud listing without duplication, ephemeral local registry recovery via PostgreSQL, driver isolation (403), and super-admin oversight (200).
- **Result:** **7 / 7 PASS (100%)**.

### 3.5. Remaining Limitations
- Startup rehydration limits pre-warming to the first 500 documents (`limit(500)`) to avoid boot bottlenecks; older documents beyond 500 are lazily retrieved on demand via `getStoredKycDocument` or `getDriverDocuments`.

---

## 4. Finding 3: Mixed-Backend Rollback Resilience & Outage Discrimination

### 4.1. Original Problem
- `getDocumentBinary()` returned raw `Buffer | null`, preventing HTTP route handlers from distinguishing between a missing object (`HTTP 404`) and a temporary backend outage (`HTTP 503`).
- `server/index.ts` returned misleading `"Document file contents not found on disk"` messages even when `supabase_storage` timed out.

### 4.2. Files Changed
- **Modified:** [server/kycStorageService.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L44-L55), [#L315-L355](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L315-L355), [#L492-L545](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L492-L545)
- **Modified:** [server/index.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1307-L1335)

### 4.3. Implementation Details
1. **`DocumentBinaryResult` Interface & Discrimination (`getBinaryDetailed` / `getDocumentBinaryDetailed`):**
   - Explicitly separates three return states: `'FOUND'`, `'NOT_FOUND'`, and `'BACKEND_UNAVAILABLE'`.
   - Checks local disk mount directory availability (`fs.existsSync(STORAGE_ROOT)`).
   - Catches Supabase SDK exceptions and timeouts (`ETIMEDOUT`, `503`) and returns `BACKEND_UNAVAILABLE` with **zero silent fallback** to local disk.
2. **Semantic HTTP Responses (`/api/driver/document-preview/:id`):**
   - Returns **`HTTP 503 Service Unavailable`** with exact backend identification when storage providers experience outages.
   - Returns **`HTTP 404 Not Found`** with vault context when metadata exists without an underlying binary object.
3. **Cutover Rollback Integrity:**
   - Switching `AEROPOOL_KYC_STORAGE_PROVIDER` from `"supabase"` back to `"local"` keeps all cloud-stored documents visible in `getDriverDocuments` and retrievable via `SupabaseStorageAdapter` (directed by `doc.storageBackend`).

### 4.4. Tests Added & Results
- **6 tests** added covering stored-backend routing, Supabase outage (`503` without fallback), missing local file (`404`), missing cloud object (`404`), metadata failure orphan rollback, and simulated cutover rollback.
- **Result:** **6 / 6 PASS (100%)**.

### 4.5. Remaining Limitations
- **Multi-Instance Local Disk Isolation:** While cloud-backed documents remain universally available across all instances during rollback, documents created exclusively on `local_disk` before cutover remain physically tied to the container host that stored them unless a shared network volume is mounted.

---

## 5. Quality Gates & Health Verification

| Verification Check | Command Executed | Outcome |
| :--- | :--- | :--- |
| **TypeScript Static Check** | `npm run lint` (`tsc --noEmit`) | **PASS (0 Errors)** |
| **Production Client Build** | `npm run build` (`vite build`) | **PASS (Built in 813ms)** |
| **Master CLI Test Suite** | `tsx src/tests/runCliTests.ts` | **PASS (267 / 267 Tests — 100%)** |
| **Backend Health Endpoint** | `GET http://localhost:3001/health` | **HEALTHY (`mode: "sandbox"`, uptime 17s)** |

---

## 6. Final Verdict

## **`ALL THREE ISSUES RESOLVED LOCALLY`**

- All code fixes, validation rules, metadata resilience handlers, HTTP error semantics, and 22 new tests are implemented and verified locally.
- Remote cloud readiness remains gated on authorized staging migration execution (`20261109000000` and `20261110000000`).

