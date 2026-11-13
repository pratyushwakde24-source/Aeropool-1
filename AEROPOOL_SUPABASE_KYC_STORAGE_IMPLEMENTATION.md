# AeroPool Phase 2: Supabase Private Storage Migration & Storage Abstraction Implementation

**Document ID:** AEROPOOL-SUPABASE-KYC-STORAGE-IMPL-002  
**Implementation Date:** 2026-11-09T16:42:00+05:30  
**Operating Mode:** SANDBOX (`AEROPOOL_KYC_STORAGE_PROVIDER=local`) / STAGING READY  
**Status:** IMPLEMENTED & VERIFIED (230/230 Tests Passing)  
**Lead Roles:** Senior Backend Architect, Supabase Storage Engineer & Security Specialist  

---

## 1. Executive Summary

This implementation delivers an enterprise-grade storage abstraction layer for AeroPool's Driver KYC and compliance document ingestion subsystem. 

In the initial implementation, document uploads were stored solely on the host's local filesystem (`server/storage/kyc-vault/`). While functional in single-node offline development, local filesystem storage poses critical blockers for cloud horizontal scaling, container restarts (ephemeral disks), and automated multi-instance clustering.

To resolve this limitation without breaking existing working offline sandbox functionality, we introduced:
1. **Unified Storage Provider Abstraction (`IKycStorageAdapter`):** A decoupling interface providing consistent `upload()`, `getBinary()`, `createSignedPreview()`, and `delete()` methods.
2. **Local Storage Adapter (`LocalStorageAdapter`):** Preserves zero-dependency offline sandbox disk persistence with binary magic bytes validation, path traversal sanitation, and restart rehydration via `kyc_registry.json`.
3. **Supabase Private Storage Adapter (`SupabaseStorageAdapter`):** Production-ready cloud object storage integration uploading to the private `kyc-vault` bucket with structured object paths:
   ```text
   drivers/<driverId>/<documentType>/<uniqueFileName>
   ```
4. **Explicit Provider Configuration:** Selected via `AEROPOOL_KYC_STORAGE_PROVIDER` (`local` | `supabase`) with **strict zero-fallback rules** in staging and production to prevent silent data bifurcation.
5. **Zero Permanent Signed URLs:** Documents in database records store solely permanent object paths and metadata. Previews are generated dynamically with 15-minute time-to-live (TTL).

---

## 2. Storage Provider Architecture & Abstraction

### 2.1 The `IKycStorageAdapter` Interface
Defined in [server/kycStorageService.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts):

```typescript
export interface StorageUploadParams {
  driverId: string;
  documentType: string;
  documentNumber: string;
  expiryDate?: string;
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
}

export interface StorageUploadResult {
  success: boolean;
  document?: StoredKycDocument;
  error?: string;
}

export interface IKycStorageAdapter {
  readonly backend: 'local_disk' | 'supabase_storage';
  upload(params: StorageUploadParams): Promise<StorageUploadResult>;
  getBinary(doc: StoredKycDocument): Promise<Buffer | null>;
  createSignedPreview(doc: StoredKycDocument, expiresInSeconds?: number): Promise<string | null>;
  delete?(storagePath: string): Promise<boolean>;
}
```

### 2.2 Adapter Comparison Matrix

| Architectural Property | `LocalStorageAdapter` (Sandbox Default) | `SupabaseStorageAdapter` (Cloud Staging/Prod) |
|:---|:---|:---|
| **Storage Target** | Host filesystem `server/storage/kyc-vault/` | Supabase Private Cloud Bucket `kyc-vault` |
| **Object Path Format** | `drivers/<driverId>/<docType>/<filename>` | `drivers/<driverId>/<docType>/<uniqueFileName>` |
| **Backend Flag** | `local_disk` | `supabase_storage` |
| **Multi-Node Ready** | No (Single server instance only) | **Yes** (Shared cloud storage across all pods) |
| **Process Restart Survival** | Rehydrated via `kyc_registry.json` | Native cloud persistence in Supabase |
| **Preview Mechanism** | 15-minute HMAC-SHA256 signed tokens | 15-minute Supabase signed URLs (`createSignedUrl`) |
| **Failure Behavior** | Fails closed with descriptive I/O error | **Zero silent fallback** (Returns explicit cloud error) |
| **Test Mocking Support** | Real filesystem operations | Dedicated mock client injection (`setMockSupabaseStorageClient`) |

---

## 3. Environment Configuration & Staging Setup

### 3.1 Environment Variables Matrix

| Variable | Environment | Default | Description & Security Boundaries |
|:---|:---:|:---:|:---|
| `AEROPOOL_KYC_STORAGE_PROVIDER` | All | `local` | Storage provider selector. Must be either `local` or `supabase`. Strictly validated by [server/envValidator.ts](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/envValidator.ts). |
| `SUPABASE_KYC_BUCKET` | Cloud | `kyc-vault` | Target private storage bucket. Defaults to `kyc-vault`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Only | *Secret* | Required when `AEROPOOL_KYC_STORAGE_PROVIDER=supabase`. Server-side only (rejected if prefixed with `VITE_`). |
| `VITE_SUPABASE_URL` | Frontend & Server | *HTTPS URL* | Remote Supabase project API endpoint. |

### 3.2 Activating Supabase Storage in Staging (Step-by-Step)

When authorized to transition a staging environment from local disk to Supabase Storage:

1. **Verify Database Migration:** Execute `supabase/migrations/20261109000000_driver_kyc_and_storage.sql` on the target Supabase project to ensure the `kyc-vault` bucket and CHECK constraint expansions are created.
2. **Update Environment File (`.env`):**
   ```bash
   AEROPOOL_KYC_STORAGE_PROVIDER="supabase"
   SUPABASE_KYC_BUCKET="kyc-vault"
   SUPABASE_SERVICE_ROLE_KEY="<your-staging-service-role-key>"
   ```
3. **Restart Backend Server:**
   ```bash
   npm run server
   ```
4. **Zero Fallback Guarantee:** If the bucket does not exist or credentials are invalid, uploads will immediately return HTTP 400/500 with descriptive error messages; the server will **never** silently write files to local disk.

---

## 4. Modified & Created Files Inventory

| File Path | Type | Role & Architectural Changes |
|:---|:---:|:---|
| `server/kycStorageService.ts` | **Refactored** | Implemented `IKycStorageAdapter`, `LocalStorageAdapter`, `SupabaseStorageAdapter`, provider factory, and mock client injection. |
| `server/index.ts` | **Updated** | Updated upload and preview routes to support async binary streaming and redirect support for Supabase signed preview URLs. |
| `server/envValidator.ts` | **Updated** | Added validation for `AEROPOOL_KYC_STORAGE_PROVIDER` and `SUPABASE_KYC_BUCKET` with client bundle leak prevention. |
| `.env.example` | **Updated** | Added Section 7 documenting KYC storage provider configurations. |
| `supabase/migrations/20261109000000_driver_kyc_and_storage.sql` | **Hardened** | Expanded `driver_documents_document_type_check` to permit all 9 document types (`DRIVING_LICENSE_FRONT`, `VEHICLE_INSURANCE`, etc.). |
| `src/tests/kycStorageAdapterTestSuite.ts` | **New** | 11 comprehensive automated tests verifying both adapters, path formatting, error handling, signed previews, and lifecycle. |
| `src/tests/testSuite.ts` | **Updated** | Integrated `runKycStorageAdapterTests` into the main test runner. |
| `src/tests/runCliTests.ts` | **Updated** | Runs the complete 230-test suite across pricing, matching, capacity, KYC, and storage adapters. |

---

## 5. Verification & Health Summary

```bash
# 1. TypeScript Static Verification
npm.cmd run lint
# -> 0 errors

# 2. Automated Test Suite (Total: 230 tests)
node_modules\.bin\tsx.cmd src/tests/runCliTests.ts
# -> 230 total tests | 230 passed | 0 failed | 4212.6ms (100% Pass Rate)

# 3. Production Vite Client Build
npm.cmd run build
# -> built in 716ms (0 errors)

# 4. Backend Health Check
Invoke-RestMethod -Uri "http://localhost:3001/health"
# -> status: HEALTHY (sandbox mode)
```

---

## 6. Migration Status & Next Steps

Per strict safety constraints:
- **No remote database writes were performed.**
- **No remote migrations were executed.**
- **Protected baseline Supabase project `krxkxhieyqcytknixqdm` was not accessed.**
- **The active operating mode remains `SANDBOX` with `AEROPOOL_KYC_STORAGE_PROVIDER=local`.**

The code is fully staged, tested, and ready to switch to `AEROPOOL_KYC_STORAGE_PROVIDER=supabase` the moment the remote database migration is applied on staging.

