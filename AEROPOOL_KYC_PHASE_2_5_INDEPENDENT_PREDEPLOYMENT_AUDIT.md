# AeroPool Phase 2.5 — Independent Pre-Deployment Security & Cloud Readiness Audit

**Audit Date:** November 10, 2026  
**Auditor:** Principal Supabase Architect, Senior Backend Security Engineer, Database Reliability Engineer & DevOps Auditor  
**Scope:** Independent Verification of Driver License Deduplication, Rollback Consistency, and Live Cloud Staging Readiness  
**Target Staging Project:** `rkuzkwggijthbqwlwnps` (`https://rkuzkwggijthbqwlwnps.supabase.co`)  
**Protected Baseline Project:** `krxkxhieyqcytknixqdm` (**STRICTLY UNTOUCHED & CONFIRMED UNREFERENCED**)  
**Current Active Operating Mode:** `sandbox` (`VITE_OPERATING_MODE="sandbox"`)  
**Current Active Storage Provider:** `local` (`AEROPOOL_KYC_STORAGE_PROVIDER="local"`)  
**Automated Master Test Suite:** **245 / 245 PASS (100% Pass Rate)**  
**Final Overall Verdict:** **READY ONLY AFTER SPECIFIED FIXES**

---

## 1. Executive Summary

This independent audit conducted a forensic, read-only examination of the AeroPool platform code, migration files, live staging project schema, and test suites to verify three critical deployment readiness dimensions:

1. **Driver License Deduplication:** Evaluated normalization logic, constraint safety in PostgreSQL, and the sufficiency of duplicate-detection queries.
2. **Rollback & Data Consistency:** Traced the exact lifecycle of documents and metadata when switching between `supabase` and `local` storage providers across process restarts.
3. **Real Supabase Cloud Verification:** Probed the live staging Supabase instance (`rkuzkwggijthbqwlwnps`) using read-only API calls, evaluated schema compatibility, and built an authentic Test Authenticity Matrix for all 245 passing tests.

### Key Conclusions:
- **Zero Cloud Migration Applied:** Live probe confirmed that migration [20261109000000_driver_kyc_and_storage.sql](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/supabase/migrations/20261109000000_driver_kyc_and_storage.sql) has **NOT** been applied to staging project `rkuzkwggijthbqwlwnps`. Neither the `kyc-vault` bucket nor the `storage_path` column exists on the staging database.
- **Premature Switch Hazard:** Switching `AEROPOOL_KYC_STORAGE_PROVIDER="supabase"` prior to applying the migration will cause 100% of driver KYC uploads and metadata writes to fail with fatal PostgreSQL column missing errors.
- **Rollback Asymmetry Identified:** While binary document retrieval and signed URL generation are backend-aware (`doc.storageBackend`), document listing (`getDriverDocuments`) is bound exclusively to the active environment variable. On multi-instance or ephemeral container architectures, switching back to `local` renders Supabase-hosted document listings invisible after a restart.
- **Test Authenticity Clarified:** All 245 passing tests are local unit, mock-adapter, or ephemeral HTTP integration tests. **0 of the 245 tests make live network calls to the staging Supabase project.**

---

## 2. Audit Scope and Safety Confirmation

### 2.1. Strict Safety Adherence
- **Read-Only Inspection:** No DDL (`CREATE`, `ALTER`, `DROP`) or DML (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`) statements were executed against any database.
- **No Bucket Mutations:** No Supabase storage buckets or storage objects were created, modified, or deleted.
- **No Provider Switch:** Configuration remained `AEROPOOL_KYC_STORAGE_PROVIDER="local"` and `VITE_OPERATING_MODE="sandbox"`.
- **Protected Baseline Project:** Project `krxkxhieyqcytknixqdm` was confirmed unreferenced in `.env`, build scripts, and runtime services.
- **Zero Secret Disclosures:** All tokens, keys, and connection strings inspected during runtime checks were strictly masked.

---

## 3. Audit 1 — Driver License Number Deduplication Findings

### 3.1. Null, Empty-Value, and Normalization Analysis

Forensic inspection of [src/services/db.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/services/db.ts#L1898-L1914) and [src/views/DriverKYCView.tsx](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/views/DriverKYCView.tsx#L457):

```typescript
// src/services/db.ts:1900-1906
const cleanLicense = params.licenseNumber ? params.licenseNumber.trim().toUpperCase() : '';

// Security Check: Duplicate Driving Licence Number prevention
if (cleanLicense) {
  const existingLicenseDriver = this.state.driverProfiles.find(
    (d) => d.userId !== params.userId && d.licenseNumber?.trim().toUpperCase() === cleanLicense
  );
  if (existingLicenseDriver) { ... }
}
```

#### Evaluation Matrix:

| Input Value Type | Application Behavior (`db.ts`) | Database Schema Behavior (`driver_profiles`) | Security / Integrity Risk |
| :--- | :--- | :--- | :--- |
| **SQL NULL** | Replaced with empty string `''`. | Base table has `license_number TEXT NOT NULL`. Inserts fail if `NULL`. | **Low** (Postgres enforces NOT NULL). |
| **Empty string `''`** | `cleanLicense = ''`. Check `if (cleanLicense)` evaluates to `false`. Duplicate check is **bypassed**. | Postgres allows `''`. If multiple records have `''`, the `UNIQUE` constraint will fail! | **HIGH:** In PostgreSQL, two empty strings `''` violate `UNIQUE (license_number)`. |
| **Whitespace-only (`'   '`)** | Trimmed to `''`. Duplicate check is bypassed. | If entered raw, stored as spaces or empty string. | **Medium:** Allows duplicate placeholder entries. |
| **Case variants (`mh02...` vs `MH02...`)** | Normalized to uppercase (`toUpperCase()`). | Standard `UNIQUE (license_number)` in Postgres is **case-sensitive byte comparison**. | **HIGH:** Postgres unique constraint does NOT prevent `'mh02...'` and `'MH02...'` coexisting. |
| **Hyphens and spaces (`MH-02 2021` vs `MH022021`)** | **NOT normalized.** Hyphens and internal spaces are retained intact. | Stored as distinct strings. | **HIGH:** Trivial formatting variations bypass both application check and DB constraint. |

### 3.2. Sufficiency of Existing Duplicate Detection Query

The query proposed in deployment documentation:
```sql
SELECT license_number, COUNT(*) FROM driver_profiles GROUP BY license_number HAVING COUNT(*) > 1;
```

#### Identified Deficiencies:
1. **Misses Case Variations:** Because PostgreSQL performs byte-level grouping, `'MH0220210098765'` and `'mh0220210098765'` form separate groups of 1.
2. **Misses Spacing and Delimiter Differences:** `'MH02 20210098765'` and `'MH0220210098765'` are not grouped together.
3. **Misses Surrounding Whitespace:** `'MH0220210098765 '` is not grouped with `'MH0220210098765'`.
4. **Hides Empty String Collisions:** If two rows have empty strings `''`, it groups them, but does not distinguish valid commercial licenses from invalid empty placeholders.

### 3.3. Constraint Safety in Migration [20261109000000_driver_kyc_and_storage.sql](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/supabase/migrations/20261109000000_driver_kyc_and_storage.sql#L49-L59)

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_driver_profiles_license_number'
  ) THEN
    ALTER TABLE driver_profiles
      ADD CONSTRAINT uq_driver_profiles_license_number UNIQUE (license_number);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;
```

- **Permitted NULLs:** PostgreSQL unique constraints allow multiple `NULL` rows. However, `license_number` has a `NOT NULL` constraint in baseline `20261015000000_aeropool_schema.sql` (Line 86).
- **Migration Failure Risk:** If existing records in staging contain identical values, empty strings `''`, or un-trimmed spaces, `ALTER TABLE ... ADD CONSTRAINT` will throw error `23505` (`unique_violation`) and fail the entire migration.
- **Staging Probe Finding:** Direct live probe of staging database `rkuzkwggijthbqwlwnps` revealed **exactly 1 driver record** (`id_prefix: d70e0dce`, status: `approved`, length: 16 characters, uppercase, zero whitespace). **There are currently 0 duplicate, 0 null, and 0 empty license records in staging.**

### 3.4. Audit 1 Verdict: `PASS WITH WARNINGS`
- **Justification:** While the staging database currently contains only 1 valid record and will not fail constraint creation, the application lacks regex-level license normalization (hyphens/spaces) and the database constraint is case-sensitive. Enhanced diagnostic queries and functional index hardening must be adopted.

---

## 4. Audit 2 — Rollback, Document Availability and Data Consistency Findings

### 4.1. Provider-Switch Behavior Analysis

Code paths in [server/kycStorageService.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts):

1. **Binary Retrieval ([Lines 877-883](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L877-L883)):**
   ```typescript
   export async function getDocumentBinary(doc: StoredKycDocument): Promise<Buffer | null> {
     if (doc.storageBackend === 'supabase_storage') {
       const adapter = getKycStorageProvider('supabase'); // Forced override!
       return adapter.getBinary(doc);
     }
     return localAdapterInstance.getBinary(doc);
   }
   ```
   **Finding: Backend-Aware (PASS).** It checks `doc.storageBackend`. If a document was uploaded to Supabase, it explicitly invokes `SupabaseStorageAdapter` regardless of the active environment variable.

2. **Signed Preview Generation ([Lines 888-897](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L888-L897)):**
   ```typescript
   export async function createDocumentSignedPreview(doc: StoredKycDocument, expiresInSeconds = 900): Promise<string | null> {
     if (doc.storageBackend === 'supabase_storage') {
       const adapter = getKycStorageProvider('supabase'); // Forced override!
       return adapter.createSignedPreview(doc, expiresInSeconds);
     }
     return localAdapterInstance.createSignedPreview(doc, expiresInSeconds);
   }
   ```
   **Finding: Backend-Aware (PASS).** Correctly resolves the appropriate adapter based on document metadata.

3. **Driver Document Listing ([Lines 902-905](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L902-L905)):**
   ```typescript
   export async function getDriverDocuments(driverId: string): Promise<StoredKycDocument[]> {
     const repo = getKycMetadataRepository(); // Uses process.env.AEROPOOL_KYC_STORAGE_PROVIDER!
     return repo.findByDriverId(driverId);
   }
   ```
   **Finding: NOT Backend-Aware (ARCHITECTURAL GAP).** When rolled back to `local`, `getKycMetadataRepository()` returns `LocalJsonMetadataRepository`. It only reads the in-memory map or local `kyc_registry.json`. **It never queries PostgreSQL.**

### 4.2. Document Availability Scenario Matrix

| Scenario | Expected Behavior | Actual Code Behavior | Risk Level | Data Loss / Orphan Risk |
| :--- | :--- | :--- | :--- | :--- |
| **1. Driver uploads locally before cutover** | Stored on local disk & local registry. | Stored in `server/storage/kyc-vault/`. Postgres has zero rows. | Low | None on single host. |
| **2. Driver uploads to Supabase after cutover** | Stored in `kyc-vault` bucket & Postgres. | Uploaded to bucket + inserted into `driver_documents` + cached in local registry. | Low | None. |
| **3. Admin previews older local document after cutover** | Retrieved from local disk. | `doc.storageBackend === 'local_disk'` routes to `LocalStorageAdapter`. | Low | Accessible if local disk intact. |
| **4. Admin previews newer Supabase document after cutover** | Retrieved from Supabase bucket. | `doc.storageBackend === 'supabase_storage'` routes to `SupabaseStorageAdapter`. | Low | Accessible. |
| **5. App switches back to local storage after Supabase uploads** | All historical documents listed and accessible. | Binary preview works via doc metadata. **However**, `getDriverDocuments()` only searches local JSON. If server restarted on ephemeral disk, documents become invisible. | **HIGH** | Metadata invisibility on container restart. |
| **6. Supabase bucket temporarily unavailable** | Graceful error handling. | `SupabaseStorageAdapter` catches `ETIMEDOUT` and returns structured error. | Low | No crashes. |
| **7. Metadata exists but storage object missing** | 404 returned cleanly. | `getBinary()` returns `null`, route returns HTTP 404. | Low | Handled cleanly. |
| **8. Storage object exists but metadata missing** | Cleaned up on upload failure. | Two-phase upload calls `storageAdapter.delete()` on metadata failure. | Low | Automated rollback cleans orphans. |

### 4.3. Registry Startup Rehydration Vulnerability

In [server/kycStorageService.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L64-L80):
```typescript
function loadRegistry() {
  if (fs.existsSync(REGISTRY_FILE)) {
    const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    ...
  }
}
loadRegistry();
```
- **Vulnerability:** Startup rehydration occurs **exclusively from local disk** (`kyc_registry.json`).
- If deployed to modern cloud container hosts (e.g., Render, Railway, Vercel, Docker containers) without persistent volume attachments, the filesystem is ephemeral. Upon container restart, the local JSON file is wiped.
- If the provider is rolled back to `local`, the registry starts completely empty, even though documents remain safely stored in Supabase Storage and PostgreSQL.

### 4.4. Audit 2 Verdict: `PASS WITH WARNINGS`
- **Justification:** Binary download and signed preview are completely backend-aware and safe. However, metadata listing and startup rehydration rely on local disk files, which is insufficient for multi-instance or ephemeral hosting rollback.

---

## 5. Audit 3 — Real Supabase Cloud Verification Findings

### 5.1. Cloud Access Configuration Audit

| Configuration Item | Status | Verification Detail |
| :--- | :--- | :--- |
| **Staging URL** | **CONFIGURED** | `https://rkuzkwggijthbqwlwnps.supabase.co` |
| **Staging Project Reference** | **VERIFIED** | `rkuzkwggijthbqwlwnps` |
| **Anon Public Key** | **CONFIGURED** | 208-character valid JWT present in `.env` |
| **Service Role Key** | **CONFIGURED** | Valid service-role JWT present in `.env` |
| **Database Direct URI** | **CONFIGURED** | `db.rkuzkwggijthbqwlwnps.supabase.co:5432` |
| **Protected Baseline** | **STRICTLY PRESERVED** | `krxkxhieyqcytknixqdm` is unreferenced in `.env` or codebase. |

### 5.2. Live Staging Database Probe Evidence (Read-Only)

A read-only diagnostic probe was executed against staging project `rkuzkwggijthbqwlwnps`.

#### Verified Live Evidence:
1. **`storage.buckets` Check:**
   - Query: `supabase.storage.listBuckets()`
   - Result: `buckets: []`
   - **Finding:** **Bucket `kyc-vault` does NOT exist in staging.**
2. **`driver_documents` Column Check:**
   - Query: `SELECT id, storage_path, storage_backend FROM driver_documents LIMIT 1`
   - Result: `ERROR: column driver_documents.storage_path does not exist`
   - **Finding:** **Columns `storage_path` and `storage_backend` do NOT exist in staging.**
3. **`public.is_admin()` Function Check:**
   - Query: `supabase.rpc('is_admin')`
   - Result: Returned `false` (valid boolean execution).
   - **Finding:** Helper function `public.is_admin()` **DOES exist** and is functional.
4. **`driver_profiles` Data Check:**
   - Query: `SELECT id, license_number, verification_status FROM driver_profiles`
   - Result: Exactly 1 driver row (`d70e0dce-...`, status: `approved`, valid 16-char license). Zero duplicates.
   - **Finding:** Staging data is clean.

### 5.3. Audit 3 Verdict: `CODE VERIFIED, CLOUD NOT VERIFIED`
- **Justification:** The code and migrations are fully written and syntactically verified, but the cloud migration has **not** been applied. Staging cloud integration cannot be claimed as verified until the migration is executed.

---

## 6. Test Authenticity Matrix (245 Total Tests)

A complete breakdown of all 245 passing tests reported by `runCliTests.ts`:

| Test Suite / File | Test Count | Test Type | External Services (Mocks vs Real) | Authentic Capability Established |
| :--- | :---: | :--- | :--- | :--- |
| [src/tests/testSuite.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/tests/testSuite.ts) | **195** | Unit / In-Memory State Machine | **Mocked / In-Memory** (`db.ts` test fixtures). Zero network calls. | Pricing math, matching score algorithms, cancellation refund policies, optimistic locking, ledger reconciliation. |
| [src/tests/driverOnboardingTestSuite.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/tests/driverOnboardingTestSuite.ts) | **10** | Integration / Domain Logic | **In-Memory Store** (`db.ts`). Zero network calls. | Driver registration validation, duplicate plate/license check, document expiry enforcement, draft status transitions. |
| [src/tests/kycStorageAdapterTestSuite.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/tests/kycStorageAdapterTestSuite.ts) | **11** | Adapter Unit & Mock Test | **Local Disk + Mock Supabase** (`setMockSupabaseStorageClient`). Zero cloud calls. | Local disk storage adapter, byte verification, magic byte MIME checks, path sanitization, mock Supabase upload/error handling. |
| [src/tests/kycHttpSecurityTestSuite.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/tests/kycHttpSecurityTestSuite.ts) | **15** | HTTP Security Integration | **Real Local HTTP (Port 0) + Mock Supabase DB/Storage** (`setMockSupabaseDbClient`). | Express middleware authorization (401, 403), role enforcement, driver identity ownership, HMAC preview token verification, safe upload rollback on metadata failure. |
| [src/tests/womenOnlyPoolTestSuite.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/tests/womenOnlyPoolTestSuite.ts) | **14** | Integration & UI Logic | **In-Memory Store**. Zero network calls. | Women-Only pool isolation, gender verification, atomic concurrency booking, no silent downgrade. |
| **Total Test Suite** | **245** | **100% PASS** | **0 Cloud Tests** | **Zero tests execute against live staging project `rkuzkwggijthbqwlwnps`.** |

> [!IMPORTANT]
> **Audit Finding:** The 245 passing tests prove local code correctness, HTTP security boundaries, and algorithm robustness. They **do not prove** live Supabase Storage connectivity, remote RLS enforcement, or PostgreSQL schema compatibility.

---

## 7. Critical, High, Medium, and Low Findings

```
CRITICAL (0) ── None. Codebase contains no active exploits or secrets.
HIGH (2)     ── 1. Cloud migration unapplied (switching provider causes 100% failure).
             ── 2. Metadata listing asymmetry during rollback on ephemeral containers.
MEDIUM (2)   ── 1. Lack of regex normalization on license numbers (hyphens/spaces bypass check).
             ── 2. Startup registry rehydration does not query PostgreSQL.
LOW (1)      ── 1. Missing Section 7 in `.env.staging.example`.
```

---

## 8. Implementation Evidence (Exact Paths & Lines)

1. **Staging Bucket Non-Existence:** Verified via `supabase.storage.listBuckets()` returning `[]`.
2. **Missing Database Columns:** Verified via `supabase.from('driver_documents').select('storage_path')` returning `column driver_documents.storage_path does not exist`.
3. **Backend-Aware Download Override:** [server/kycStorageService.ts:877-883](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L877-L883).
4. **Backend-Aware Preview Override:** [server/kycStorageService.ts:888-897](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L888-L897).
5. **Non-Backend-Aware Listing:** [server/kycStorageService.ts:902-905](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L902-L905).
6. **Local Disk Registry Startup Dependency:** [server/kycStorageService.ts:64-80](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L64-L80).
7. **License Number Trimming without Regex:** [src/services/db.ts:1900](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/services/db.ts#L1900).
8. **HTTP Test Ephemeral Port & Mock Injection:** [src/tests/kycHttpSecurityTestSuite.ts:28-31](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/tests/kycHttpSecurityTestSuite.ts#L28-L31), [467-468](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/tests/kycHttpSecurityTestSuite.ts#L467-L468).

---

## 9. Required Fixes Before Production Deployment

### Fix 1: Database Migration Application (Mandatory Operational Fix)
Migration [20261109000000_driver_kyc_and_storage.sql](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/supabase/migrations/20261109000000_driver_kyc_and_storage.sql) must be applied to staging project `rkuzkwggijthbqwlwnps` via `npx supabase db push` or direct `psql` execution prior to toggling any storage provider setting.

### Fix 2: Staging Environment Variable Configuration
The following variables must be added to `.env` / host secrets:
```env
AEROPOOL_KYC_STORAGE_PROVIDER="supabase"
SUPABASE_KYC_BUCKET="kyc-vault"
KYC_TOKEN_SECRET="<generate-random-high-entropy-32-character-secret>"
```

### Fix 3: Robust License Number Normalization (Recommended Code Improvement)
Update normalization in `src/services/db.ts` and `src/views/DriverKYCView.tsx` to strip all non-alphanumeric characters:
```typescript
const cleanLicense = params.licenseNumber 
  ? params.licenseNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase() 
  : '';
```
And add a functional unique index in PostgreSQL:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_profiles_clean_license
ON driver_profiles (regexp_replace(UPPER(license_number), '[^A-Z0-9]', '', 'g'));
```

### Fix 4: Resilient Metadata Listing in Fallback Mode (Recommended Code Improvement)
In `server/kycStorageService.ts`, update `getDriverDocuments(driverId)` to query PostgreSQL if the active provider is `local` but PostgreSQL is reachable:
```typescript
export async function getDriverDocuments(driverId: string): Promise<StoredKycDocument[]> {
  const localDocs = await localMetadataRepoInstance.findByDriverId(driverId);
  if (localDocs.length > 0) return localDocs;
  // Fall back to PostgreSQL to ensure Supabase documents remain visible
  return supabaseMetadataRepoInstance 
    ? supabaseMetadataRepoInstance.findByDriverId(driverId) 
    : [];
}
```

---

## 10. Read-Only Diagnostic SQL Queries

Execute these diagnostic queries via Supabase SQL Editor or `psql` to audit staging before and after migration:

### Diagnostic Query 1: Comprehensive License Number Integrity Audit
```sql
-- 1. Check for duplicate normalized license numbers (strips spaces, hyphens, ignores case)
SELECT 
  regexp_replace(UPPER(license_number), '[^A-Z0-9]', '', 'g') AS normalized_license,
  COUNT(*) AS duplicate_count,
  array_agg(id) AS driver_profile_ids,
  array_agg(license_number) AS raw_variations
FROM driver_profiles
WHERE license_number IS NOT NULL AND TRIM(license_number) <> ''
GROUP BY regexp_replace(UPPER(license_number), '[^A-Z0-9]', '', 'g')
HAVING COUNT(*) > 1;

-- 2. Detect empty or whitespace-only records
SELECT id, license_number, verification_status 
FROM driver_profiles 
WHERE license_number IS NULL OR TRIM(license_number) = '';
```

### Diagnostic Query 2: Pre-Flight KYC Schema & Bucket Verification
```sql
-- Verify storage_path column exists
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'driver_documents'
  AND column_name IN ('storage_path', 'storage_backend', 'expiry_date', 'file_size_bytes', 'sha256_checksum');

-- Verify kyc-vault bucket exists and is private
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'kyc-vault';

-- Verify RLS policies on storage.objects
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%kyc-vault%';
```

---

## 11. Controlled Staging Verification Steps (Post-Authorization)

When deployment is authorized, execute these verified steps:

1. **Step 1:** Run Diagnostic Query 1 (Verify 0 duplicate licenses in staging).
2. **Step 2:** Apply migration `20261109000000_driver_kyc_and_storage.sql` to staging `rkuzkwggijthbqwlwnps`.
3. **Step 3:** Run Diagnostic Query 2 (Verify `kyc-vault` bucket and columns exist).
4. **Step 4:** Set `AEROPOOL_KYC_STORAGE_PROVIDER="supabase"`, `SUPABASE_KYC_BUCKET="kyc-vault"`, and `KYC_TOKEN_SECRET="<secret>"` in `.env`.
5. **Step 5:** Restart backend daemon (`http://localhost:3001`).
6. **Step 6:** Perform isolated live document upload smoke test with `test-token-driver`.
7. **Step 7:** Inspect Supabase Dashboard to confirm file presence in `kyc-vault` bucket.

---

## 12. Final Deployment Recommendation & Verdict

### Final Overall Verdict:
## **`READY ONLY AFTER SPECIFIED FIXES`**

### Summary of Conditions:
1. **Blocking Fix 1 (Operational):** Migration `20261109000000_driver_kyc_and_storage.sql` MUST be executed against staging database `rkuzkwggijthbqwlwnps`.
2. **Blocking Fix 2 (Operational):** Staging environment variables (`AEROPOOL_KYC_STORAGE_PROVIDER`, `SUPABASE_KYC_BUCKET`, `KYC_TOKEN_SECRET`) MUST be configured.
3. **Quality Fix 3 (Code):** Adopt regex license normalization and PostgreSQL fallback in `getDriverDocuments`.

Once Operational Fixes 1 and 2 are executed in sequence, the system advances directly to **`CONTROLLED STAGING DEPLOYMENT`**.

*Stop Condition Reached: Audit completed in read-only mode. No remote migrations were applied, no database writes performed, and no credentials modified.*

