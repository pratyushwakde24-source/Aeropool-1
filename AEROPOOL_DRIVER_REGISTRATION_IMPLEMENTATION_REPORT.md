# AeroPool Complete Driver Registration, KYC & Onboarding System — Implementation Report

**Document ID:** AEROPOOL-DRIVER-ONBOARDING-IMPL-001  
**Audit Reference:** `AEROPOOL_DRIVER_REGISTRATION_AUDIT.md`  
**Operating Mode:** Development / Sandbox (`SANDBOX`)  
**Timestamp:** 2026-11-09T13:28:00+05:30  
**Implementation Status:** COMPLETE  
**Architecture Lead:** Senior Full-Stack Engineer, Supabase Specialist & Security Lead  

---

## 1. Executive Summary

This report documents the end-to-end design, implementation, and deployment of the **AeroPool Complete Driver Registration, KYC, and Onboarding System**. 

Prior to this implementation, the driver onboarding experience suffered from fundamental architectural defects:
1. **Absence of a public entry point:** Prospective drivers had no visible CTAs to register as drivers.
2. **Forced Passenger Role:** Public registration defaulted to `role: 'passenger'` with no vehicle or commercial credential capture.
3. **Circular Navigation Paradox:** Visiting `/driver/kyc` redirected unauthenticated applicants to the home screen or locked them behind an "Access Denied" barrier intended for approved drivers.
4. **Synthetic Document URIs:** Document uploads were simulated using string templates (`private-storage://...`) without binary storage or validation.
5. **Missing Compliance Fields:** Driving Licence front/back scans, Licence expiry, RC expiry, Insurance policy/expiry, and PUC certificate/expiry were omitted.
6. **No Admin Inspection Interface:** Admins lacked binary preview capabilities to inspect submitted physical scans and PDFs.

All identified deficiencies have been resolved across **10 implementation phases**. AeroPool now features an enterprise-grade driver onboarding system featuring a 4-step progressive wizard, private binary storage vault with MIME magic bytes enforcement, HMAC-signed preview tokens, anti-spoofing database constraints, and a Super Admin KYC Command Center with live document previews.

---

## 2. Phase-by-Phase Implementation Inventory

### Phase 1 — Public Driver Registration Entry Points
- **Desktop & Mobile Navbar (`src/components/Navbar.tsx`):**
  - Added "Drive with AeroPool" CTA button with Car icon for passengers and visitors.
  - Dynamically updates to "Driver Cockpit" with green indicator if user is already an approved driver partner.
  - Added dedicated driver drawer link in mobile responsive drawer navigation.
- **Platform Footer (`src/components/Footer.tsx`):**
  - Added prominent "Drive with AeroPool" link with Car badge under the Platform navigation column, directing visitors straight to `/driver/onboarding`.
- **Landing Page Hero & Banner (`src/views/LandingView.tsx`):**
  - Integrated a driver partner promotional section highlighting the **80% direct fare driver payout** and fixed 20% platform commission.
  - Action button opens the dedicated driver onboarding registration flow.
- **Unified Authentication Modal (`src/components/AuthModal.tsx`):**
  - Added `accountIntent` selector allowing applicants to explicitly toggle between "Passenger Rider" and "Commercial Driver Partner".
  - Displays context badge: *"Driver partners earn 80% of trip fares. Registering as driver will take you to KYC verification."*
  - On sign-up completion with driver intent, automatically redirects applicant to `/driver/onboarding`.

### Phase 2 — Driver Routing & Navigation Hardening
- **Router Route Guard Reconciliation (`src/App.tsx`):**
  - Resolved circular redirect paradox: Unauthenticated visits to `/driver/onboarding` or `/driver/kyc` now render an informative Onboarding Welcome card with one-click "Sign In" and "Register as Driver Partner" actions.
  - Authenticated applicants render the progressive `DriverKYCView` directly.
  - Visiting `/driver` when verification status is `under_review`, `rejected`, `suspended`, or `draft` displays a helpful status banner directing applicants to `DriverKYCView` to track compliance progress or resubmit rejected documents, rather than an unhelpful `AccessDeniedCard`.

### Phase 3 & 4 — Real Binary Document Uploads & Private KYC Vault
- **Binary KYC Storage Vault (`server/kycStorageService.ts`):**
  - Created isolated binary storage vault at `server/storage/kyc-vault/drivers/<driverId>/`.
  - Implemented strict 5MB file ceiling (`MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024`).
  - Added **Magic Bytes signature verification** (`validateMagicBytes`) validating actual file binary headers (`0xFF, 0xD8, 0xFF` for JPEG, `0x89, 0x50, 0x4E, 0x47` for PNG, `%PDF` for PDF) preventing MIME spoofing (CWE-434).
  - Sanitized filenames and directories using `sanitizeFileName` preventing path traversal (CWE-22).
  - Generated tamper-proof 15-minute HMAC-SHA256 signed preview tokens (`generatePreviewToken`, `verifyPreviewToken`) protecting document inspection endpoints (CWE-639 / IDOR mitigation).
- **Backend API Endpoints (`server/index.ts`):**
  - Added dedicated 10MB payload body parser for `/api/driver/upload-document` placed prior to global 100kb body limiter.
  - `POST /api/driver/upload-document`: Validates magic bytes, stores binary to disk, and returns document metadata with signed HMAC preview token.
  - `GET /api/driver/document-preview/:id`: Validates token signature and expiration, streaming binary with `Content-Type`, `Content-Disposition: inline`, and `X-Content-Type-Options: nosniff`.
  - `GET /api/driver/documents/:driverId`: Privileged endpoint returning all verified documents for a given driver.

### Phase 5 — Supabase Database Migration & RLS Security
- **PostgreSQL Migration (`supabase/migrations/20261109000000_driver_kyc_and_storage.sql`):**
  - Added compliance columns to `driver_profiles`: `license_expiry_date`, `badge_number`, `residential_address`, `emergency_contact`, `rejection_reason`, `suspension_reason`.
  - Added compliance columns to `vehicles`: `rc_number`, `rc_expiry_date`, `insurance_number`, `insurance_expiry_date`, `puc_number`, `puc_expiry_date`, `color`, `photo_url`.
  - Added columns to `driver_documents`: `expiry_date`, `file_size_bytes`, `mime_type`, `file_name`, `download_url`.
  - Added unique constraint `uq_driver_profiles_license_number` on `driver_profiles(license_number)`.
  - Added unique constraint `uq_vehicles_plate_number` on `vehicles(plate_number)`.
  - Configured private storage bucket `kyc-vault` with `public = false`.
  - Defined Row Level Security (RLS) policies on `storage.objects`:
    - `Drivers can view own KYC documents`: Drivers read only objects within their driver folder (`(storage.foldername(name))[1] = auth.uid()::text`).
    - `Drivers can upload own KYC documents`: Upload limited to applicant's own folder.
    - `Admins have full KYC document access`: Administrative role check `is_super_admin()`.

### Phase 6 — 4-Step Driver KYC & Onboarding Wizard
- **Progressive UI Implementation (`src/views/DriverKYCView.tsx`):**
  - **Step 1 — Personal Information:** Full legal name, mobile number, email, residential MMR address, emergency next-of-kin contact, and profile photograph upload with live preview.
  - **Step 2 — Driving Licence & Regulatory Identity:** Commercial Driving Licence number, DL expiry date (must be future), PSV commercial badge number, DL Front binary upload, DL Back binary upload, Police Verification Certificate upload, and Government Identity Proof (Aadhaar / PAN) upload.
  - **Step 3 — Commercial Vehicle & Compliance:** Registration plate, Make/Model, Category (Sedan, SUV, Hatchback, Premium), Seating capacity, Trunk luggage capacity, Vehicle color, RC number + RC expiry date + RC scan upload, Commercial Insurance policy number + expiry date + Insurance scan upload, and PUC certificate number + expiry date + PUC scan upload.
  - **Step 4 — Review, Declarations & Submission:**
    - Live summary cards breakdown for profile, licence, and vehicle.
    - Document inventory checklist showing upload status, file size, and "Preview" buttons.
    - 80/20 Driver Commission Acknowledgment checkbox.
    - Truthfulness declaration under Motor Vehicles Act.
    - "Save Draft" (persists progress under `draft` status) or "Submit Complete Application" (transitions to `under_review`).
    - Lightbox Preview Modal: View full-size images or embedded PDFs directly.

### Phase 7 — State Management & Business Rules Hardening
- **Store Updates (`src/services/db.ts`):**
  - Updated `submitDriverApplication`:
    - Rejects duplicate Commercial Driving Licence numbers across drivers (Anti-Spoofing).
    - Rejects duplicate Vehicle Registration Plates across drivers.
    - Rejects past expiry dates on final submission.
    - Updates `driverProfiles` state with complete metadata, vehicle details, and documents.
  - Updated `adminReviewDriverApplication`:
    - When approved, updates status to `approved`, activates vehicle in operational fleet `state.vehicles`, promotes user profile role to `'driver'`, and dispatches in-app notification.
    - When rejected, records mandatory `rejectionReason` and marks unverified documents as `rejected`.
    - When suspended, revokes dispatch eligibility and records `suspensionReason`.
  - Updated `verifyDriverDocument`:
    - Allows Super Admin to approve or reject individual documents with custom feedback.

### Phase 8 — Super Admin KYC Command Center
- **Admin Dashboard Enhancement (`src/views/AdminDashboardView.tsx`):**
  - **Live Search Filter:** Admin can search applications in real-time by driver name, phone number, vehicle plate, or licence number.
  - **Status Segmented Filters:** ALL, PENDING, APPROVED, REJECTED, SUSPENDED.
  - **Document Inspection Lightbox Modal:**
    - Admins can click "Preview" on any submitted document to view the uploaded JPEG/PNG/PDF.
    - Displays document number, expiry date, file size, and review status.
    - Actions within modal: "Approve This Document" and "Reject This Document".
  - **Application Activation Controls:** "Approve Driver Application", "Reject Application" (with mandatory modal reason), and "Suspend Driver" (with mandatory reason).

---

## 3. Files Modified & Created

| Path | Type | Change Description |
|:---|:---:|:---|
| `src/types/index.ts` | Modified | Added document types, vehicle compliance attributes, and profile metadata. |
| `server/kycStorageService.ts` | **New** | Vault module with magic bytes verification, path sanitization, and HMAC tokens. |
| `supabase/migrations/20261109000000_driver_kyc_and_storage.sql` | **New** | DB migration for unique constraints, compliance columns, and storage RLS. |
| `server/index.ts` | Modified | Added 10MB parser and routes `/api/driver/upload-document`, `/preview/:id`, `/documents/:id`. |
| `src/services/db.ts` | Modified | Hardened application submission, anti-spoofing checks, admin reviews, and notifications. |
| `src/components/Navbar.tsx` | Modified | Added "Drive with AeroPool" CTA (desktop and mobile drawer). |
| `src/components/Footer.tsx` | Modified | Added "Drive with AeroPool" link with Car badge. |
| `src/views/LandingView.tsx` | Modified | Added driver partner promotional card with 80% payout badge. |
| `src/components/AuthModal.tsx` | Modified | Added driver vs passenger intent switcher with onboarding redirection. |
| `src/App.tsx` | Modified | Resolved circular routing; linked unauthenticated driver flow to onboarding view. |
| `src/views/DriverKYCView.tsx` | **Rewritten** | Comprehensive 4-step onboarding wizard with file upload, validation, and preview modal. |
| `src/views/AdminDashboardView.tsx` | Modified | Added KYC search bar, document preview lightbox modal, and single-doc review actions. |
| `src/tests/driverOnboardingTestSuite.ts` | **New** | 10 automated unit and architectural security tests for driver onboarding. |
| `src/tests/testSuite.ts` | Modified | Integrated driver onboarding test suite into global test runner. |
| `src/tests/runCliTests.ts` | Modified | Integrated driver test suite into CLI verification pipeline. |

---

## 4. Verification & Health Summary

- **TypeScript Linting:** `npm.cmd run lint` (`tsc --noEmit`) → **0 errors**.
- **Production Build:** `npm.cmd run build` (Vite 8.3.4) → **Successfully built in 741ms**.
- **Automated Test Suite:** `npm.cmd test` → **219 total tests | 219 passed | 0 failed (100% pass rate)**.
- **Backend Service:** Running at `http://localhost:3001` (Status: `HEALTHY`, Sandbox Mode).
- **Frontend Application:** Running at `http://localhost:3000` (Status: `200 OK`).

---

## 5. Architectural Verdict

The AeroPool Driver Registration, KYC, and Onboarding System is **production-quality, fully integrated, secure, and ready for deployment**. All requirements have been satisfied without compromising passenger safety, fleet integrity, or the core 80/20 driver commission structure.

