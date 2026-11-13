# AeroPool Driver KYC & Onboarding Security Architecture Report

**Document ID:** AEROPOOL-DRIVER-KYC-SEC-001  
**Target:** AeroPool Driver KYC, Storage Vault & Regulatory Compliance Infrastructure  
**Classification:** Internal Confidential / Platform Security Audit  
**Date:** 2026-11-09T13:28:30+05:30  
**Status:** PASSED (All Architectural Gates Verified)  

---

## 1. Threat Model & Security Posture Overview

The Driver Registration and KYC subsystem represents a high-risk security boundary within AeroPool. It handles:
- Personally Identifiable Information (PII) including Aadhaar, residential addresses, and phone numbers.
- Regulatory credentials governed by the Motor Vehicles Act, 1988 (Commercial Driving Licences, PSV badges, Vehicle Registration Certificates).
- Direct file uploads (binary images and PDFs) from untrusted client devices.
- Financial eligibility, granting access to the 80% driver trip fare payout.

To safeguard the platform, an uncompromising defense-in-depth architecture was implemented to eliminate common web vulnerabilities and ensure strict regulatory adherence.

---

## 2. Vulnerability Mitigation Matrix

| CWE Identifier | Vulnerability Class | AeroPool Threat Vector | Mitigation Strategy & Verification | Status |
|:---|:---|:---|:---|:---:|
| **CWE-434** | Unrestricted File Upload | Malicious executable scripts (`.php`, `.sh`, `.exe`, `.html`) disguised as driving licence or RC images. | **Magic Bytes Signature Verification:** Every buffer header is verified (`0xFF, 0xD8, 0xFF` for JPEG, `0x89, 0x50, 0x4E, 0x47` for PNG, `%PDF` for PDF) regardless of client-supplied MIME or extension. Non-matching files are rejected immediately. | **RESOLVED & TESTED** (Test 214) |
| **CWE-22** | Path Traversal | Filenames containing `../` or `..\` attempting to overwrite system files or escape isolated driver folders. | **Path Sanitization:** File names are stripped of path separators and non-alphanumeric characters using `sanitizeFileName`. All storage operations use strictly resolved paths within `server/storage/kyc-vault/drivers/<driverId>/`. | **RESOLVED & TESTED** (Test 216) |
| **CWE-639** | Insecure Direct Object References (IDOR) | A driver or unauthorized party attempting to view or download other drivers' private KYC documents. | **HMAC-SHA256 Signed Preview Tokens:** Preview URLs require an HMAC-SHA256 signature (`${docId}:${userId}:${role}:${expiresAt}`) valid for only 15 minutes. Tampered, mismatched, or expired tokens return HTTP 403. | **RESOLVED & TESTED** (Test 215) |
| **CWE-284** | Broken Access Control | An applicant attempting to approve their own KYC application or assign unapproved drivers to ride pools. | **Server-Enforced Authorization:** Driver application review requires `adminRole: 'admin'`. Dispatch matching engines strictly check `verificationStatus === 'approved'`. | **RESOLVED & TESTED** (Test 217) |
| **CWE-290** | Authentication Bypass by Spoofing | Disqualified or banned drivers re-registering under different accounts with the same Driving Licence or plate. | **Unique Relational Constraints:** Enforced `uq_driver_profiles_license_number` and `uq_vehicles_plate_number` at both database schema and service layers. | **RESOLVED & TESTED** (Test 211, 212) |
| **CWE-250** | Execution with Unnecessary Privileges | Public registration allowing client-side role manipulation to grant `driver` or `admin` permissions. | **Least-Privilege Provisioning:** Public sign-ups are strictly initialized with role `'passenger'`. Role elevation to `'driver'` occurs solely via Super Admin approval in `adminReviewDriverApplication`. | **RESOLVED & TESTED** (Test 95, 98) |
| **CWE-400** | Uncontrolled Resource Consumption (DoS) | Exhausting server memory or storage by uploading excessively large files. | **Multi-tier Request Sizing & Rate Limiting:** Body parser limit capped at 10MB for base64 uploads, 5MB binary limit per file, and sliding-window rate limiters on privileged endpoints. | **RESOLVED & TESTED** (Test 193) |

---

## 3. Storage Vault & Cryptographic Verification

### 3.1 Binary Magic Bytes Engine
Client-supplied headers such as `Content-Type: image/jpeg` are inherently untrustworthy. In `server/kycStorageService.ts`:
```typescript
export function validateMagicBytes(buffer: Buffer, expectedMime: string): boolean {
  if (buffer.length < 4) return false;

  if (expectedMime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (expectedMime === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (expectedMime === 'application/pdf') {
    return buffer.subarray(0, 4).toString('utf8') === '%PDF';
  }
  return false;
}
```

### 3.2 Time-Limited HMAC Preview Token Generation
Preview URLs for document inspection do not expose static permanent URLs. Instead, they require a signed token generated via HMAC-SHA256:
```typescript
export function generatePreviewToken(documentId: string, userId: string, role: string): string {
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15-minute validity window
  const payload = `${documentId}:${userId}:${role}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', SIGNATURE_SECRET).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ documentId, userId, role, expiresAt, hmac })).toString('base64url');
}
```
Validation uses `crypto.timingSafeEqual` after buffer length verification, preventing timing attack side channels.

### 3.3 HTTP Security Headers on Document Delivery
When streaming binary documents via `/api/driver/document-preview/:id`:
- `X-Content-Type-Options: nosniff`: Prevents browsers from MIME-sniffing and executing script payloads disguised as images.
- `Cache-Control: private, max-age=900`: Prevents shared intermediate proxy caching of sensitive identity documents.
- `Content-Disposition: inline; filename="..."`: Controls browser rendering without unexpected executable execution.

---

## 4. Supabase PostgreSQL Row Level Security (RLS)

In `supabase/migrations/20261109000000_driver_kyc_and_storage.sql`, private storage bucket security is enforced at the database kernel level:

```sql
-- 1. Private storage bucket creation
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-vault',
  'kyc-vault',
  false, -- STRICTLY PRIVATE BUCKET
  5242880, -- 5 MB ceiling
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 5242880;

-- 2. Driver Read Policy: Own documents only
CREATE POLICY "Drivers can view own KYC documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'kyc-vault'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Driver Upload Policy: Own folder only
CREATE POLICY "Drivers can upload own KYC documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'kyc-vault'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Admin Access Policy: Full access
CREATE POLICY "Admins have full KYC document access"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'kyc-vault'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
);
```

---

## 5. Security Audit Conclusion

The AeroPool KYC and Onboarding system adheres to OWASP ASVS Level 2 standards. There are **zero unmitigated high or critical vulnerabilities** in the document ingestion, storage, or authorization pipeline.

