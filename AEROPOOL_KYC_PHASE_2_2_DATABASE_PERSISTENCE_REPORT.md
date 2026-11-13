# AeroPool Phase 2.2 — KYC Metadata Database Persistence Architecture Report

**Module**: [`server/kycStorageService.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts)  
**Schema Definition**: [`supabase/migrations/20261109000000_driver_kyc_and_storage.sql`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/supabase/migrations/20261109000000_driver_kyc_and_storage.sql)  
**Target Table**: `public.driver_documents`  
**Active Mode**: Sandbox (`LocalJsonMetadataRepository`)  
**Production Ready Target**: PostgreSQL Cloud Database (`SupabasePostgresMetadataRepository`)  

---

## 1. Architectural Problem & Resolution

### Problem (Identified in Audit SEC-03)
In the initial Phase 2 implementation, document records were written only to an in-memory Map and serialized to a local JSON file (`server/storage/kyc-vault/kyc_registry.json`). When running in cloud mode with `AEROPOOL_KYC_STORAGE_PROVIDER="supabase"`, the binary was uploaded to Supabase Storage, but the metadata record was never inserted into PostgreSQL table `driver_documents`. In containerized or horizontally scaled environments, restarts or multi-pod routing caused document lookups to fail with HTTP 404 despite the files existing in the storage bucket.

### Solution (Implemented in Phase 2.2)
Phase 2.2 established a formal **Metadata Repository Abstraction** with two distinct implementations:
1. **`LocalJsonMetadataRepository`**: Preserves zero-dependency offline resilience in local development and sandbox environments by writing to `kyc_registry.json`.
2. **`SupabasePostgresMetadataRepository`**: Persists document records to PostgreSQL table `public.driver_documents` using the server Supabase client (`SUPABASE_SERVICE_ROLE_KEY`), enabling multi-pod synchronization and database queryability.

---

## 2. Repository Interface Specification

The abstraction is defined by `IKycMetadataRepository` in [`server/kycStorageService.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/kycStorageService.ts#L525-L535):

```typescript
export interface IKycMetadataRepository {
  readonly backend: 'local_json' | 'supabase_postgres';
  findById(id: string): Promise<StoredKycDocument | null>;
  findByDriverId(driverId: string): Promise<StoredKycDocument[]>;
  save(doc: StoredKycDocument): Promise<{ success: boolean; error?: string }>;
  updateStatus(id: string, status: StoredKycDocument['status'], rejectionReason?: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
```

Factory function `getKycMetadataRepository()` automatically resolves the active repository based on `process.env.AEROPOOL_KYC_STORAGE_PROVIDER`.

---

## 3. Database Schema & Column Mapping

The PostgreSQL schema definition in [`supabase/migrations/20261109000000_driver_kyc_and_storage.sql`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/supabase/migrations/20261109000000_driver_kyc_and_storage.sql#L12-L19) maps to the `StoredKycDocument` interface as follows:

| PostgreSQL Column (`driver_documents`) | Data Type | `StoredKycDocument` Field | Description / Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `id` | Primary key generated via `crypto.randomUUID()` |
| `driver_id` | `UUID` | `driverId` | Foreign key referencing `driver_profiles(id)` |
| `document_type` | `TEXT` | `documentType` | Validated against expanded CHECK constraint (9 types) |
| `document_number` | `TEXT` | `documentNumber` | Normalized uppercase identifier (DL, RC, etc.) |
| `expiry_date` | `DATE` | `expiryDate` | Expiration date of document (`YYYY-MM-DD` or null) |
| `file_url` | `TEXT` | `storagePath` | Object path for backward compatibility |
| `storage_path` | `TEXT` | `storagePath` | Canonical object path: `drivers/<id>/<type>/<filename>` |
| `storage_backend` | `TEXT` | `storageBackend` | `'local_disk'` or `'supabase_storage'` |
| `file_name` | `TEXT` | `fileName` | Original sanitized file basename |
| `mime_type` | `TEXT` | `mimeType` | Validated MIME type (`image/jpeg`, etc.) |
| `file_size_bytes` | `INT` | `fileSizeBytes` | Binary payload size in bytes (max 5 MB) |
| `sha256_checksum` | `TEXT` | `sha256Checksum` | Cryptographic SHA-256 hash of binary |
| `status` | `verification_status` | `status` | `'pending'` \| `'under_review'` \| `'approved'` \| `'rejected'` |
| `submitted_at` | `TIMESTAMPTZ` | `submittedAt` | ISO 8601 submission timestamp |
| `reviewed_at` | `TIMESTAMPTZ` | — | Timestamp of admin approval or rejection |
| `rejection_reason` | `TEXT` | `rejectionReason` | Actionable feedback supplied by reviewing admin |

### Strict Storage Boundaries
- **Zero Signed URLs**: Pre-signed URLs (`createSignedUrl`) with temporary tokens are **never** persisted in the database.
- **Zero Raw Binaries**: Binary file contents are never stored in PostgreSQL columns; binaries reside exclusively in Supabase Storage.
- **Zero Access Tokens or Secrets**: No auth credentials or session secrets are recorded in metadata.

---

## 4. Safe Upload Sequencing & Rollback Lifecycle

To prevent orphan objects or database desynchronization, `storeKycDocument()` enforces strict two-phase commit ordering:

```
Step 1: Input Validation
  ├── Validate MIME type (JPEG, PNG, WebP, PDF)
  ├── Validate magic bytes (CWE-434 mitigation)
  ├── Validate file size (< 5 MB)
  └── Sanitize paths & identifiers (CWE-22 mitigation)

Step 2: Binary Upload
  ├── Generate unique path: drivers/<driverId>/<docType>/<safeFilename>
  ├── Non-destructive upload: upsert = false
  └── Calculate SHA-256 binary hash

Step 3: Metadata Persistence
  └── Insert record into IKycMetadataRepository
        ├── SUCCESS: Return { success: true, document: docRecord }
        └── FAILURE: Trigger Step 4 Rollback

Step 4: Rollback Cleanup (On Metadata Failure)
  ├── Invoke storageAdapter.delete(storagePath)
  ├── Log sanitized error without leaking credentials
  └── Return { success: false, error: "Metadata persistence failed..." }
```

This sequence guarantees that if a database timeout or connection failure occurs, the uploaded object in the bucket is deleted immediately.

---

## 5. Automated Verification Evidence

The metadata persistence and rollback lifecycle were verified in tests **229, 230, and 231** of the automated test suite:

- **Test 229**: Injected an intentional database connection error into `SupabasePostgresMetadataRepository`. Verified that `storeKycDocument` returned a failure message and invoked `storageAdapter.delete()`, successfully removing the orphan object.
- **Test 230**: Injected a storage bucket failure (`Bucket quota exceeded`). Verified that the upload halted before invoking the database repository, resulting in zero orphan database records.
- **Test 231**: Verified that re-uploading documents with the same name generated distinct storage paths and UUIDs, preventing collision or silent overwrites.

---

## 6. Staging Migration Runbook

When authorized to transition from local sandbox to remote staging:

1. **Apply Migration**: Execute `supabase db push` or run `20261109000000_driver_kyc_and_storage.sql` against the staging project.
2. **Set Environment Configuration**:
   ```bash
   AEROPOOL_KYC_STORAGE_PROVIDER="supabase"
   SUPABASE_KYC_BUCKET="kyc-vault"
   KYC_TOKEN_SECRET="<cryptographically_generated_32_char_secret>"
   ```
3. **Verify Health**: Send a GET request to `/health` and verify `AEROPOOL_KYC_STORAGE_PROVIDER` reports `supabase`.

