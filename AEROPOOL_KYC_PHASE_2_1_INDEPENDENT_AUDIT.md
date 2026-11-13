# AeroPool Phase 2.1 — Independent KYC Storage Security & Implementation Audit

**Audit Date**: November 9, 2026  
**Auditor Role**: Principal Backend Security Engineer, Supabase Architect & Reliability Auditor  
**Audit Scope**: Read-Only Source Code & Architecture Inspection of KYC Storage Subsystem  
**Application Operating Mode**: Sandbox (`AEROPOOL_KYC_STORAGE_PROVIDER="local"`)  
**Target Cloud Backend**: Supabase Private Storage (`kyc-vault`)  
**Executive Verdict**: **PARTIAL PASS (CONDITIONAL — ACTION REQUIRED BEFORE STAGING DEPLOYMENT)**  

---

## 1. Executive Summary & Verdict

An exhaustive, read-only architectural and security audit of the AeroPool KYC storage subsystem was performed across the server storage adapters, middleware guards, Express API routes, frontend upload handlers, database migrations, and automated test suites.

### Verdict Rationale:
- **What Passed**: The dual storage provider abstraction ([`IKycStorageAdapter`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L44-L50)), binary magic-byte validation (CWE-434), path traversal sanitization (CWE-22), short-lived HMAC capability tokens (CWE-639), zero silent fallback to local disk in cloud mode, and server-only credential isolation are solidly implemented.
- **Why Partial Pass (Not Full Pass)**:
  1. **Frontend Auth Omission**: The frontend client ([`DriverKYCView.tsx`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/views/DriverKYCView.tsx#L249-L262)) fails to attach an `Authorization: Bearer <token>` header to document upload calls. In production, this causes uploads to fail with HTTP 401 and silently fall back to inline base64 in the browser.
  2. **Sandbox Endpoint Auth Bypass**: In development and sandbox modes, `authenticateJwt({ optional: true })` on `/api/driver/upload-document` and `/api/driver/documents/:driverId` allows unauthenticated callers to bypass driver ownership checks entirely.
  3. **Role Enforcement Gap**: `/api/driver/upload-document` does not enforce `role === 'driver'`. A user with `role === 'passenger'` can upload KYC documents under their own user ID.
  4. **Database Metadata Disconnect**: The backend storage service does not persist document records to PostgreSQL table `driver_documents`. Document metadata exists only in a local file (`kyc_registry.json`), creating data loss risks on ephemeral container restarts.
  5. **Test Suite Mocking Disconnect**: The 11 storage adapter tests evaluate internal class methods with mocked cloud clients. Zero HTTP endpoint integration or authorization tests exist in the test suite.

---

## 2. Summary of Findings

| ID | Severity | Category | Title | Affected File(s) |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **CRITICAL** | Integration / Auth | Frontend upload handler omits `Authorization` header, breaking production uploads | [`src/views/DriverKYCView.tsx`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/views/DriverKYCView.tsx#L249-L262) |
| **SEC-02** | **CRITICAL** | Authorization | Optional JWT in sandbox permits unauthenticated document upload and retrieval | [`server/index.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1206-L1224), [`server/index.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1313-L1322) |
| **SEC-03** | **HIGH** | Architecture | Backend stores metadata in local JSON file instead of PostgreSQL `driver_documents` | [`server/kycStorageService.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L415-L434) |
| **SEC-04** | **HIGH** | Authorization | Missing `requireRole(['driver', 'admin'])` allows passengers to upload driver KYC | [`server/index.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1204-L1224) |
| **SEC-05** | **HIGH** | Test Fidelity | Storage tests test internal class logic and mocks; zero HTTP endpoint auth tests | [`src/tests/kycStorageAdapterTestSuite.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/tests/kycStorageAdapterTestSuite.ts) |
| **SEC-06** | **MEDIUM** | Cryptography | Fallback to hardcoded secret for HMAC token signing if env variables missing | [`server/kycStorageService.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L101-L102) |
| **SEC-07** | **MEDIUM** | Database / RLS | Storage policy uses subquery on `public.profiles` instead of `public.is_admin()` | [`supabase/migrations/20261109000000_driver_kyc_and_storage.sql`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/supabase/migrations/20261109000000_driver_kyc_and_storage.sql#L108-L113) |
| **SEC-08** | **MEDIUM** | Migration | `UNIQUE (license_number)` constraint will fail if staging has duplicate records | [`supabase/migrations/20261109000000_driver_kyc_and_storage.sql`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/supabase/migrations/20261109000000_driver_kyc_and_storage.sql#L47-L57) |
| **SEC-09** | **LOW** | Storage Lifecycle | Non-destructive replacement (`upsert: false`) creates orphan files without purge | [`server/kycStorageService.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L401) |

---

## 3. Detailed Technical Findings

### Finding SEC-01 [CRITICAL]: Frontend Upload Handler Omits Authorization Header
- **File & Lines**: [`src/views/DriverKYCView.tsx:249-262`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/views/DriverKYCView.tsx#L249-L262)
- **Code Inspection**:
  ```typescript
  const apiRes = await fetch('/api/driver/upload-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      driverId: currentUser.id,
      documentType: docType,
      documentNumber: docNumberVal || docType,
      expiryDate: expiryVal,
      fileName: file.name,
      mimeType: file.type,
      fileBase64: base64Data,
      callerRole: 'driver',
    }),
  });
  ```
- **Analysis**:
  The request sends only `Content-Type: application/json`. No `Authorization: Bearer <sessionToken>` is included.
- **Production Impact**:
  In production (`OPERATING_MODE="production"`), the backend route ([`server/index.ts:1206`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1206)) evaluates `authenticateJwt({ optional: false })`, which strictly returns HTTP 401 Unauthorized for missing bearer tokens ([`server/authMiddleware.ts:65`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/authMiddleware.ts#L65)).
  In `DriverKYCView.tsx`, lines 271-273 catch this rejection and silently fall back to client-side local state base64 (`setDocsMap`). **In a production deployment, no documents will ever reach Supabase Storage.**

---

### Finding SEC-02 [CRITICAL]: Sandbox Optional JWT Permits Unauthenticated Upload and Cross-Driver Inspection
- **File & Lines**: 
  - [`server/index.ts:1206, 1219-1224`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1206-L1224)
  - [`server/index.ts:1313, 1317-1322`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1313-L1322)
- **Code Inspection**:
  ```typescript
  // server/index.ts line 1206:
  authenticateJwt({ optional: OPERATING_MODE !== 'production' })
  ...
  // server/index.ts line 1219:
  if (req.user && req.user.role !== 'admin' && req.user.id !== driverId) {
    return res.status(403).json({ error: 'Forbidden: You cannot upload documents for another driver account.' });
  }
  ```
- **Analysis**:
  In development and sandbox mode (`OPERATING_MODE !== 'production'`), `optional` is `true`. When an unauthenticated caller sends an HTTP request without an Authorization header, `req.user` is `undefined`.
  Because the guard checks `if (req.user && ...)`, the check evaluates to `false` when `req.user` is `undefined`!
- **Security Implications**:
  1. An anonymous attacker in sandbox/staging can POST to `/api/driver/upload-document` with any arbitrary `driverId` and upload arbitrary files.
  2. An anonymous attacker in sandbox/staging can GET `/api/driver/documents/:driverId`. Since `caller` (`req.user`) is `undefined`, the check `if (caller && caller.role !== 'admin' && caller.id !== driverId)` is bypassed. The endpoint returns the driver's full document list and generates active 15-minute HMAC preview URLs for all of their documents.

---

### Finding SEC-03 [HIGH]: Backend Storage Disconnected from PostgreSQL Database
- **File & Lines**: [`server/kycStorageService.ts:415-434`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L415-L434)
- **Code Inspection**:
  ```typescript
  kycDocumentRegistry.set(docId, docRecord);
  persistRegistry(); // writes to server/storage/kyc-vault/kyc_registry.json
  ```
- **Analysis**:
  Even when `AEROPOOL_KYC_STORAGE_PROVIDER="supabase"` is active and document binaries are uploaded to the `kyc-vault` Supabase Storage bucket, the document record is **only written to the local disk file `kyc_registry.json`**.
  Zero SQL statements (`INSERT INTO driver_documents ...`) or Supabase client calls (`client.from('driver_documents').insert(...)`) exist in `server/kycStorageService.ts` or `server/index.ts`.
- **Reliability & Multi-Instance Impact**:
  1. The database table `driver_documents` remains empty.
  2. If the backend runs in a stateless container or multi-pod setup, server reboots or horizontal scaling will lose registry synchronization, causing `/api/driver/document-preview/:id` to return 404 even though the binary is safely present in Supabase Storage.
  3. Migration `20261109000000_driver_kyc_and_storage.sql` adds metadata columns to `driver_documents`, but lacks `storage_path` and `storage_backend` columns.

---

### Finding SEC-04 [HIGH]: Missing Role Enforcement Allows Passengers to Upload Driver KYC
- **File & Lines**: [`server/index.ts:1204-1224`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1204-L1224)
- **Analysis**:
  Even in production mode with a verified JWT, the endpoint only checks `req.user.id !== driverId`. It **never checks** `req.user.role`.
  A passenger with a valid user token can call `/api/driver/upload-document` passing `driverId: req.user.id`. Since `req.user.id === driverId`, the request succeeds and creates a driver KYC record for a passenger account.
- **Remediation**:
  Apply role guard `requireRole(['driver', 'admin'])` to `/api/driver/upload-document`.

---

### Finding SEC-05 [HIGH]: Test Suite Mocking Gap & Lack of Endpoint Verification
- **File & Lines**: [`src/tests/kycStorageAdapterTestSuite.ts:1-419`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/tests/kycStorageAdapterTestSuite.ts#L1-L419)
- **Breakdown of the 11 Tests**:
  - **Tests 2, 3, 4, 5**: Real local filesystem tests (write, read, hash, CWE-434 magic bytes, CWE-22 path traversal).
  - **Tests 6, 7, 8, 9, 10, 11**: Completely mocked Supabase tests using in-memory mock client (`mockSupabaseClient`). No network calls or real Supabase SDK integrations are executed.
  - **Zero Tests**: No tests make HTTP calls to `/api/driver/upload-document`, `/api/driver/document-preview/:id`, or `/api/driver/documents/:driverId`.
- **Finding**:
  The reported "230 / 230 passing tests" verified the isolated internal adapter methods and file algorithms, but left the actual HTTP route handlers and middleware layers completely unexercised.

---

### Finding SEC-06 [MEDIUM]: Fallback to Static Secret in HMAC Capability Token Engine
- **File & Lines**: [`server/kycStorageService.ts:101-103`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L101-L103)
- **Code Inspection**:
  ```typescript
  const SIGNATURE_SECRET =
    process.env.JWT_SECRET || process.env.RAZORPAY_KEY_SECRET || 'aeropool_kyc_vault_secret_2026';
  ```
- **Analysis**:
  If `JWT_SECRET` and `RAZORPAY_KEY_SECRET` are not set, HMAC tokens are signed with the public repository string `'aeropool_kyc_vault_secret_2026'`. Any third party could forge valid capability tokens to preview any document.
- **Remediation**:
  Require `KYC_TOKEN_SECRET` or `JWT_SECRET` in [`server/envValidator.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/envValidator.ts), and throw an error on startup if unconfigured in staging/production.

---

### Finding SEC-07 [MEDIUM]: Storage RLS Policy Inconsistency with Existing Security Architecture
- **File & Lines**: [`supabase/migrations/20261109000000_driver_kyc_and_storage.sql:108-112`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/supabase/migrations/20261109000000_driver_kyc_and_storage.sql#L108-L112)
- **Code Inspection**:
  ```sql
  CREATE POLICY "Super Admins have full access to kyc-vault"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'kyc-vault'
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );
  ```
- **Analysis**:
  The existing platform architecture (`20261016000001_production_rls_and_rpc_alignment.sql`) defines a `SECURITY DEFINER` function `public.is_admin()`. Querying `public.profiles` directly within a storage RLS policy can cause recursion or access failures if table-level RLS on `profiles` is triggered.
- **Remediation**:
  Use `AND public.is_admin()` in Policy C.

---

### Finding SEC-08 [MEDIUM]: Unique License Number Migration Vulnerability to Existing Dirty Data
- **File & Lines**: [`supabase/migrations/20261109000000_driver_kyc_and_storage.sql:47-57`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/supabase/migrations/20261109000000_driver_kyc_and_storage.sql#L47-L57)
- **Analysis**:
  `ALTER TABLE driver_profiles ADD CONSTRAINT uq_driver_profiles_license_number UNIQUE (license_number);` will immediately fail on staging if pre-existing test/seed data contains duplicate non-null `license_number` strings.
- **Remediation**:
  Run a pre-check query or data migration to clean duplicate placeholder licenses prior to applying the constraint.

---

## 4. Critical Authorization Matrix (Verified vs. Code)

| Verification Scenario | Implementation Status | Mechanism & Code Reference |
| :--- | :--- | :--- |
| **1. Unauthenticated users cannot upload** | ⚠️ **PARTIAL** | Protected in production (`authenticateJwt`), but **VULNERABLE** in sandbox/dev due to `optional: true` ([`server/index.ts:1206`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1206)). |
| **2. Passengers cannot upload driver KYC** | ❌ **FAIL** | Endpoint only verifies `req.user.id !== driverId`, not `req.user.role === 'driver'` ([`server/index.ts:1219`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1219)). |
| **3. Driver A cannot read Driver B's docs** | ⚠️ **PARTIAL** | Protected in production, but in sandbox unauthenticated requests can query `/api/driver/documents/:driverId` and obtain preview URLs ([`server/index.ts:1317`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1317)). |
| **4. Drivers cannot access admin operations** | ✅ **PASS** | Admin endpoints enforce `requireRole(['admin'])` derived from verified JWT `app_metadata` ([`server/authMiddleware.ts:164-177`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/authMiddleware.ts#L164-L177)). |
| **5. Only admins can review other drivers** | ✅ **PASS** | Review and approval endpoints require `role === 'admin'`. Direct document preview without capability token requires admin role ([`server/index.ts:1277`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1277)). |
| **6. Expired / tampered tokens rejected** | ✅ **PASS** | `verifyPreviewToken()` verifies expiry timestamp and HMAC signature using `crypto.timingSafeEqual` ([`server/kycStorageService.ts:200-229`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L200-L229)). |
| **7. Signed URL cannot generate without auth** | ⚠️ **PARTIAL** | Tokens are issued on upload or via `/api/driver/documents/:driverId`. In sandbox mode, unauthenticated callers can obtain tokens due to SEC-02. |
| **8. Document ID substitution prevented** | ✅ **PASS** | HMAC payload binds token to exact `docId`. Calling `/api/driver/document-preview/:id` with another document's token fails with `Token document mismatch` ([`server/kycStorageService.ts:208`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L208)). |

---

## 5. Supabase Configuration & Storage API Audit

1. **Supabase Client Usage**:
   - `SupabaseStorageAdapter` correctly initializes `@supabase/supabase-js` `createClient` with `persistSession: false` and `autoRefreshToken: false` ([`server/kycStorageService.ts:366-371`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L366-L371)).
2. **Credential Boundary**:
   - Server-only credentials (`SUPABASE_SERVICE_ROLE_KEY`) are verified to NOT have the `VITE_` prefix. [`server/envValidator.ts:70-84`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/envValidator.ts#L70-L84) halts startup if any server secret is leaked into the browser bundle.
3. **Storage Bucket**:
   - Private bucket name defaults to `'kyc-vault'` and is configurable via `SUPABASE_KYC_BUCKET`.
   - Migration creates the bucket with `public = FALSE`, 5 MB limit, and restricted MIME types.
4. **Storage API Calls**:
   - `client.storage.from(bucket).upload(path, buffer, { contentType, upsert: false })`
   - `client.storage.from(bucket).download(path)`
   - `client.storage.from(bucket).createSignedUrl(path, expiresIn)`
   - All method signatures conform strictly to `@supabase/storage-js` v2 specifications.
5. **Zero Silent Fallback**:
   - Verified in [`server/kycStorageService.ts:404-410`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L404-L410): Any Supabase storage failure immediately returns an explicit error string. No local disk fallback occurs in cloud mode.
6. **Object Paths vs Signed URLs**:
   - Only object paths (`drivers/<driverId>/<docType>/<filename>`) are saved. Signed URLs are never persisted in the document registry.

---

## 6. Test Suite Quality Audit (Fact vs. Assumption)

| Test # | Stated Name | Actual Implementation | Real Test vs. Mock |
| :---: | :--- | :--- | :--- |
| **206** | Adapter Resolution | Inspects object properties returned by factory | Unit check (In-memory) |
| **207** | Local Storage Adapter | Writes 10 bytes to local disk, reads back, checks SHA-256 | **REAL Local Filesystem Test** |
| **208** | Registry Rehydration | Verifies `kyc_registry.json` was written to disk | **REAL Local Filesystem Test** |
| **209** | Magic Bytes Validation | Passes bash script with jpeg header; asserts rejection | **REAL Local Security Test** |
| **210** | Path Traversal Sanitization | Passes `../../etc/shadow.jpg`; asserts `../` stripped | **REAL Local Security Test** |
| **211** | Supabase Object Path | Captures path passed to mock storage client | **MOCKED** Supabase Test |
| **212** | Signed Preview URL | Asserts mock URL format and absence in `storagePath` | **MOCKED** Supabase Test |
| **213** | Cloud Binary Download | Asserts mock download returns sample buffer | **MOCKED** Supabase Test |
| **214** | Zero Silent Fallback | Mock throws bucket error; asserts no local disk file created | **MOCKED Client + REAL Disk Check** |
| **215** | Network Resilience | Mock throws timeout error; asserts structured error response | **MOCKED** Supabase Test |
| **216** | Non-Destructive Replace | Mock receives 2 uploads; asserts 2 distinct paths & `upsert: false` | **MOCKED** Supabase Test |

> [!WARNING]
> While the test suite passes 230/230 tests, **none of these tests invoke the Express HTTP endpoints or verify that the frontend actually sends authentication headers**. The security bugs identified in SEC-01, SEC-02, SEC-03, and SEC-04 were completely unmasked by the existing test suite.

---

## 7. Migration Readiness Checklist

| Item | Status | Action Required Prior to Remote Execution |
| :--- | :---: | :--- |
| **SQL Syntax & Idempotency** | ✅ Pass | Safe `IF NOT EXISTS` guards used on columns and constraints. |
| **Bucket Definition** | ✅ Pass | `kyc-vault` created as `public = FALSE`, 5MB limit, 4 allowed MIME types. |
| **RLS Policy Syntax** | ⚠️ Warning | Replace `EXISTS (SELECT 1 FROM public.profiles ...)` with `public.is_admin()`. |
| **Database Sync Gap** | ❌ Blocked | Backend must actually write records to `driver_documents` table. |
| **Unique License Constraint** | ⚠️ Warning | Audit staging table for duplicate license numbers before applying constraint. |

---

## 8. Action Plan & Recommendations Prior to Staging Deployment

Before applying migration `20261109000000_driver_kyc_and_storage.sql` or switching `AEROPOOL_KYC_STORAGE_PROVIDER="supabase"` in staging, the following remediation steps are recommended:

1. **Fix Frontend Auth Header** ([`src/views/DriverKYCView.tsx`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/src/views/DriverKYCView.tsx#L251)):
   Attach the active session bearer token:
   ```typescript
   headers: {
     'Content-Type': 'application/json',
     'Authorization': `Bearer ${sessionToken}`,
   }
   ```
2. **Enforce Role and Strict Auth on Endpoints** ([`server/index.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts#L1204-L1224)):
   - Remove `optional: true` on `/api/driver/upload-document` and `/api/driver/documents/:driverId` across all environments.
   - Add `requireRole(['driver', 'admin'])`.
   - Derive the target driver ID directly from `req.user.id` when the caller is a driver.
3. **Bridge Storage Service to PostgreSQL Table**:
   - Update `storeKycDocument` to execute an `INSERT` into `driver_documents` with `storage_path`, `mime_type`, `file_size_bytes`, and `sha256_checksum`.
4. **Implement HTTP Endpoint Integration Tests**:
   - Add end-to-end HTTP tests using `supertest` or `fetch` against the Express server to verify that unauthenticated calls, passenger calls, and cross-driver document lookups return HTTP 401/403.
5. **Update Policy C in Migration**:
   - Use `public.is_admin()` in `20261109000000_driver_kyc_and_storage.sql`.

---

**Audit Conclusion**:
The KYC storage abstraction provides a solid foundation with correct low-level cryptography and file validation. However, due to critical authorization omissions at the Express endpoint and frontend client layers (SEC-01, SEC-02, SEC-04) and the database metadata disconnect (SEC-03), staging migration is **not yet ready** and should be gated on these remediations.

