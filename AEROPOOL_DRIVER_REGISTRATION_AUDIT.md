# AeroPool Complete Driver Registration & Onboarding Audit Report

**Date:** November 9, 2026  
**Audit Scope:** End-to-end Driver Registration, KYC Submission, Document Storage, Vehicle Onboarding, Backend APIs, Supabase Database & RLS, Super Admin Approvals, and Driver Cockpit Activation  
**Auditor:** Senior Full-Stack Engineer, QA Architect, Backend Security Engineer & Product Auditor  
**Operating Mode:** SANDBOX / STAGING  
**Verdict:** **PARTIALLY COMPLETE** (Core state machines, lifecycle gates, admin KYC queue, and driver cockpit functions are fully operational; however, public driver entry navigation is missing, binary document uploads rely on pseudo-URIs, and storage buckets are not configured).

---

## 1. Overall Driver Registration Status

The AeroPool platform possesses a robust, secure architectural foundation for driver verification and operational lifecycle management. The system strictly adheres to the principle of least privilege: public sign-up cannot self-escalate to driver or admin status, unapproved drivers are barred from going online or receiving dispatches, and Super Admins have a dedicated review queue with audit logging.

However, the user-facing journey contains architectural gaps that prevent it from being classified as "Complete":
1. **No Public Driver Sign-Up Entry Point:** There is no dedicated driver registration page or "Drive with Us" link in the public header, hero, or bottom navigation.
2. **Public Auth Defaults to Passenger:** `AuthModal.tsx` strictly provisions all new signups as `passenger`. There is no role selection or driver onboarding toggle in the authentication dialog.
3. **Orphaned KYC Route:** The onboarding form exists at `/driver/kyc` (`DriverKYCView.tsx`), but is only linked from inside the Driver Dashboard (`/driver`), which itself is guarded and blocked for non-drivers.
4. **Pseudo Document Storage:** Document collection for Driving Licence, RC, and Police Verification takes textual license/card numbers and generates synthetic `private-storage://drivers/...` URIs. No actual binary file upload (PDF/JPEG) to Supabase Storage or server disk is wired.
5. **No Document Preview in Admin Console:** Because files are synthetic URIs, administrators can only approve/reject document numbers; they cannot view actual document scans.

---

## 2. Driver Registration Page & Route Inventory

| Route | View Component | Guard / Access Control | Discovery / Navigation Visibility | Functional Status |
|---|---|---|---|---|
| `/driver` | `DriverDashboardView.tsx` | Restricted to `driver` or `admin` (`App.tsx:267`) | Shown in Navbar user menu **only** if logged-in user has `role === 'driver'` | **Fully Functional** for approved drivers. Blocks unapproved drivers from going online or accepting dispatch. |
| `/driver/kyc` | `DriverKYCView.tsx` | Restricted to authenticated users (`currentUser != null`, `App.tsx:279`) | **Orphaned / Hidden**: Not linked in Header, Footer, Hero, or Auth Modal. Only linked from inside `/driver`. | **Partially Functional**: Form validation, photo data-URL preview, draft saving, and admin submission work. Generates synthetic URIs for documents. |
| `/driver-register` | *None* | *Route does not exist* | None | **Missing** |
| `/app/admin` | `AdminDashboardView.tsx` | Restricted to `admin` (`App.tsx:309`) | Shown in Navbar user menu if `role === 'admin'` | **Fully Functional**: KYC tab lists applications, filters by status, enables document review, application approval, rejection, and suspension. |
| `/fleet` | `FleetDashboardView.tsx` | Restricted to `fleet_operator` or `admin` (`App.tsx:294`) | Shown in Navbar user menu for fleet operators | **Fully Functional**: Commercial vehicle registration and driver assignment. |
| `/fleet-partners` | `FleetPartnersPublicView.tsx` | Public | Footer & Information Centre modal | **Fully Functional**: Informational landing page with fleet partner inquiry modal. |

---

## 3. Feature-by-Feature Implementation Matrix

| Category | Feature / Requirement | Status | Implementation Details |
|---|---|---|---|
| **1. UI & Authentication** | Driver registration / sign-up page | **Partially Implemented** | `AuthModal.tsx` handles signup, but provisions as `passenger`. Dedicated driver registration page is missing. |
| | Name, Mobile, Email, Password fields | **Fully Implemented** | Present in both `AuthModal.tsx` and `DriverKYCView.tsx`. |
| | OTP / Email authentication | **Fully Implemented** | Supabase Auth email confirmation with resend cooldowns and staging bypass support. |
| | Driver login and logout | **Fully Implemented** | `authService.signIn` authenticates; redirects automatically to `/driver` if `user.role === 'driver'`. |
| | Forgot password / recovery | **Fully Implemented** | Handled via `/forgot-password` (`ForgotPasswordView.tsx`) and `/auth/reset-password` (`PasswordResetView.tsx`). |
| | Onboarding progress indicator | **Partially Implemented** | Status banner displays `DRAFT`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `SUSPENDED`. Step wizard missing. |
| | Form validation & useful errors | **Fully Implemented** | Validates mandatory fields, DL format, vehicle plate format, and phone format. |
| | Responsive mobile experience | **Fully Implemented** | Responsive cards, bottom-sheet layouts, touch-manipulation, and mobile safe-area paddings. |
| | Driver profile creation & editing | **Fully Implemented** | `db.submitDriverApplication` creates or edits driver profile in memory and DB state. |
| **2. Document & KYC** | Driving Licence Number | **Fully Implemented** | Text input with uppercase formatting in `DriverKYCView.tsx`. |
| | DL front & back image upload | **Missing** | Generates synthetic URI `private-storage://drivers/{id}/dl_{number}.pdf`; no binary file input. |
| | Driving Licence expiry date | **Missing** | Field does not exist on `DriverKYCView` or `DriverDocument` type. |
| | Aadhaar / Identity document | **Partially Implemented** | Single text field labeled "Police Verification / Aadhaar" (`policeDocNumber`). |
| | PAN Card | **Missing in Driver KYC** | Exists in Fleet Operator registration, but omitted from solo driver KYC. |
| | Driver Profile Photograph | **Partially Implemented** | Supported via local `FileReader.readAsDataURL` with client-side MIME checks (JPEG/PNG/WebP, max 5MB). |
| | Police Clearance certificate | **Partially Implemented** | Certificate number text field; no file upload. |
| | Vehicle RC (Registration Certificate) | **Partially Implemented** | Smart card number text field; no file upload. |
| | Vehicle Insurance | **Missing** | Not collected in `DriverKYCView`. |
| | Vehicle PUC certificate | **Missing** | Not collected in `DriverKYCView`. |
| | Secure Storage Configuration | **Missing** | No Supabase storage bucket (`kyc-documents`) or storage RLS policies exist. |
| | Admin document review & rejection | **Fully Implemented** | Admin can approve or reject individual documents with reason modal. |
| **3. Vehicle Registration** | Vehicle Type & Category | **Fully Implemented** | Category dropdown: Sedan, SUV, XL, EV. |
| | Vehicle Make & Model | **Fully Implemented** | Text input (`e.g. Toyota Innova Crysta`). |
| | Registration Plate Number | **Fully Implemented** | Text input with yellow-plate format validation. |
| | Vehicle Colour | **Missing** | Color attribute not tracked in vehicle schema. |
| | Seating & Luggage Capacity | **Fully Implemented** | Seating (4, 6, 7) and luggage capacity (2, 3, 4, 5+) selectors. |
| | Vehicle Photographs | **Missing** | No vehicle photo upload field. |
| | Linking vehicle to driver | **Fully Implemented** | `assignedVehicle` embedded in driver profile; auto-registered in `state.vehicles` on approval. |
| **4. Super Admin Approval** | View newly registered drivers | **Fully Implemented** | Filterable queue in `AdminDashboardView` under `activeTab === 'kyc'`. |
| | Driver profile details inspection | **Fully Implemented** | Name, phone, email, residential address, emergency contact, assigned vehicle breakdown. |
| | Document preview | **Missing** | Only shows doc type and number; no image or PDF previewer. |
| | Approve driver application | **Fully Implemented** | Promotes role to `driver`, synchronizes to backend `/api/admin/verify-kyc`. |
| | Reject application with reason | **Fully Implemented** | Modal requires rejection reason; sets status to `rejected`. |
| | Suspend / deactivate driver | **Fully Implemented** | Modal requires suspension reason; sets status to `suspended` and immediately revokes online availability. |
| **5. Driver Cockpit** | Online / offline availability toggle | **Fully Implemented** | Gated strictly by `verificationStatus === 'approved'`. |
| | Live ride request notifications | **Fully Implemented** | Real-time countdown offers with auto-expiry. |
| | Accept / reject ride requests | **Fully Implemented** | `db.respondToRideOffer` atomically assigns pool and updates status. |
| | Active ride turn-by-turn & details | **Fully Implemented** | Corridor pickup bay, passenger list, vehicle details, turn-by-turn drawer. |
| | 4-Digit OTP verification | **Fully Implemented** | Driver must enter passenger's OTP to transition ride to `IN_PROGRESS`. |
| | Earnings and wallet ledger | **Fully Implemented** | `DriverWalletCard` displays gross, toll pass-through, platform fee, and net balance. |

---

## 4. Frontend Findings

### A. Navigation & Accessibility
- **The Circular Navigation Paradox:**
  - A guest or passenger who wants to become a driver has no link to `/driver/kyc`.
  - The Navbar user menu only displays the "Driver Queue & Dispatches" link if `currentUser.role === 'driver'`.
  - The Mobile Bottom Nav routes to `/driver` only if `currentUser.role === 'driver'`.
  - A passenger attempting to navigate directly to `/driver` is intercepted by `AccessDeniedCard` requiring the `driver` role.
  - The only way a passenger can reach `/driver/kyc` is by manually typing `/driver/kyc` into the browser address bar.

### B. Form Validation & UX in `DriverKYCView.tsx`
- **Strengths:**
  - Clean styling conforming to the AeroPool midnight navy theme (`#070b14`).
  - Strict client-side MIME whitelist (`image/jpeg`, `image/png`, `image/webp`) and 5MB size limit on photo upload (mitigating CWE-434).
  - Supports saving applications as `draft` so drivers can complete details later.
  - Informative status banner showing administrative state (`DRAFT`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `SUSPENDED`).
- **Gaps:**
  - File inputs for DL, RC, and Police Verification are missing. Only text numbers are accepted.
  - The button `<button onClick={() => onNavigate('/driver')}>Driver Dashboard</button>` at line 253 traps unapproved applicants because clicking it takes them to `/driver`, which triggers an `AccessDeniedCard`.

---

## 5. Backend API Findings

### Endpoint: `POST /api/admin/verify-kyc` (`server/index.ts`)
- **Authentication & Authorization:**
  - Protected by `privilegedApiLimiter`, `authenticateJwt()`, and `requireRole(['admin'])`.
  - Validates `driverId` and `status` in `['approved', 'rejected', 'suspended']`.
  - Enforces mandatory `notes` when status is set to `rejected` or `suspended`.
- **Identity & Role Synchronization:**
  - When `status === 'approved'`:
    - Calls Supabase Admin Auth API (`PUT /auth/v1/admin/users/:id`) to set `app_metadata.role = 'driver'`.
    - Calls Supabase PostgREST API (`PATCH /rest/v1/profiles?id=eq.:id`) to set `role = 'driver'`.
  - When `status === 'rejected'` or `'suspended'`:
    - Demotes role back to `passenger`.
- **Limitations:**
  - The endpoint does not perform database writes to `driver_profiles` or `driver_documents` in Supabase; it only updates the user role in `profiles`. The verification status update remains in the client-side state machine.

---

## 6. Database & RLS Findings

### A. Schema Definitions (`supabase/migrations/20261015000000_aeropool_schema.sql`)
1. **`driver_profiles` Table:**
   - Columns: `id` (PK, references `profiles.id`), `organization_id`, `license_number`, `badge_number`, `assigned_vehicle_id`, `verification_status`, `is_available`, `rating`, `total_trips`, `earnings_this_week_paise`, `total_earnings_paise`, `created_at`.
   - **Vulnerability / Missing Constraint:** `license_number` is NOT declared `UNIQUE`. Multiple driver profiles can theoretically register the same commercial driving licence number.
2. **`driver_documents` Table:**
   - Columns: `id` (PK), `driver_id` (references `driver_profiles.id`), `document_type`, `document_number`, `file_url`, `status`, `rejection_reason`, `submitted_at`, `reviewed_at`.
   - Allowed types: `'DRIVING_LICENSE'`, `'VEHICLE_RC'`, `'COMMERCIAL_PERMIT'`, `'POLICE_VERIFICATION'`.
3. **`vehicles` Table:**
   - Columns: `id` (PK), `organization_id`, `plate_number` (**UNIQUE**), `make_model`, `category`, `seats`, `luggage_capacity`, `fuel_type`, `status`, `assigned_driver_id`.

### B. Row Level Security (RLS) Analysis (`20261016000001_production_rls_and_rpc_alignment.sql`)
- **`driver_profiles`:**
  - `Drivers can view their own driver profile`: `FOR SELECT USING (id = auth.uid())` -> **SECURE**.
  - `Fleet operators own drivers`: `FOR ALL USING (organization_id = current_user_org_id() AND get_auth_role() = 'fleet_operator')` -> **SECURE**.
  - `Admins have full access to driver profiles`: `FOR ALL USING (is_admin())` -> **SECURE**.
  - **Limitation:** There is no `INSERT` or `UPDATE` policy for an applicant driver on `driver_profiles`. A driver cannot write directly to Supabase PostgREST without an RPC or admin mediation.
- **`driver_documents`:**
  - `Drivers can view and upload their own documents`: `FOR ALL USING (auth.uid() = driver_id)` -> **SECURE**.
  - `Fleet operators can view their fleet drivers documents`: Scoped strictly to the same organization -> **SECURE**.
  - `Admins have full access to driver documents`: `FOR ALL USING (is_admin())` -> **SECURE**.

---

## 7. KYC & Document Storage Findings

- **Storage Bucket Status: MISSING.**
  - There are NO Supabase Storage buckets declared in the SQL migrations (e.g. `kyc-vault` or `driver-documents`).
  - No code anywhere in `src/` or `server/` calls `supabase.storage.from(...)`.
- **Synthetic URIs:**
  - `DriverKYCView.tsx` creates mock URIs:
    - `private-storage://drivers/{userId}/dl_{license}.pdf`
    - `private-storage://drivers/{userId}/permit_{badge}.pdf`
    - `private-storage://drivers/{userId}/rc_{plate}.pdf`
    - `private-storage://drivers/{userId}/police_{number}.pdf`
  - While these URIs establish a schema for where files *should* live, no actual binary uploads are transferred over the wire.
- **Profile Photo Exception:**
  - The driver profile photo is stored as a base64 `data:image/...` string in memory. While functional for local preview, storing large base64 strings directly in profile rows is not scalable for production database records.

---

## 8. Vehicle Registration Findings

- Drivers register their vehicle during KYC submission (`vehiclePlate`, `vehicleModel`, `vehicleCategory`, `seatCapacity`, `luggageCapacity`, `rcDocNumber`).
- Fleet operators can also register fleet vehicles independently in `/fleet` (`FleetDashboardView.tsx`).
- **Linking Verification:**
  - When the Super Admin approves the driver application in `adminReviewDriverApplication`, the assigned vehicle is automatically created in `state.vehicles` with `assignedDriverId: driver.id` and `assignedDriverName: driver.fullName`.
  - In `src/tests/testSuite.ts` (Test 27), the system verifies that unapproved drivers cannot be assigned to commercial vehicles.

---

## 9. Super Admin Approval Findings

- The Super Admin command center (`/app/admin`) provides full visibility:
  - **Overview Tab:** Displays `Pending Driver KYC: X` badge.
  - **Driver KYC Queue Tab:**
    - Live filter chips: `ALL`, `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`.
    - Profile cards show driver name, photo, phone, email, organisation, rating, DL, PSV badge, vehicle plate, make/model, seats, luggage, residential address, and emergency contact.
    - Each submitted document card has individual `Approve` and `Reject` buttons.
    - Application action buttons:
      - `Approve Driver Partner`: Promotes role to `driver`, activates vehicle, syncs to backend.
      - `Reject Application`: Opens modal requiring rejection reason.
      - `Suspend Driver`: Opens modal requiring suspension reason, immediately removes driver from online pool.
- **Audit Logging:** Every administrative action records an immutable entry in `state.auditLogs` with `actorId`, `actorRole: 'admin'`, `action: 'ADMIN_REVIEW_DRIVER'`, and detailed metadata.

---

## 10. Driver Activation & Access-Control Findings

The lifecycle restrictions are strictly enforced across multiple layers:

```
[ New Signup ] ──> role: 'passenger' (Cannot access /driver)
      │
      ▼
[ Driver KYC Submit ] ──> status: 'under_review' (Role remains 'passenger')
      │
      ▼
[ Admin KYC Queue ] ──> Admin reviews credentials & vehicle
      │
      ├───────────────────────────────┐
      ▼                               ▼
[ Admin Approves ]             [ Admin Rejects ]
      │                               │
      ├─ status: 'approved'           ├─ status: 'rejected'
      ├─ role: 'driver'               ├─ role: 'passenger'
      ├─ can access /driver           ├─ blocked from /driver
      ├─ can go ONLINE                └─ can edit KYC to resubmit
      └─ can accept pool dispatches
```

- **Unapproved Driver Restrictions Verified:**
  - Going Online: Blocked with error *"Cannot go online: Driver profile is UNDER_REVIEW. Only approved drivers can accept dispatch."*
  - Broadcasting GPS: Blocked with error *"Unapproved driver cannot broadcast GPS coordinates."*
  - Accepting Dispatches: Blocked with error *"Unapproved drivers cannot accept ride assignments."*
  - Vehicle Assignment: Blocked by `db.assignDriverToVehicle` KYC check.

---

## 11. Security & Edge-Case Findings

| Security / Edge Case | Risk Level | Evaluation & Findings |
|---|---|---|
| **Privilege Self-Escalation** | **LOW (Mitigated)** | Public signup ignores client-supplied `role: 'driver'` and hardcodes `passenger`. Verified in Test 73 and Test 95. |
| **Driver Self-Approval** | **LOW (Mitigated)** | Driver calling `adminReviewDriverApplication` is rejected with `Unauthorized`. Verified in Test 73. |
| **Cross-Driver Data Leakage** | **LOW (Mitigated)** | RLS on `driver_documents` and `driver_profiles` enforces `auth.uid() = driver_id`. Driver ledger is strictly partitioned. Verified in Test 148. |
| **Malicious File Upload (CWE-434)** | **LOW (Mitigated)** | Client validates MIME types (`image/jpeg`, `image/png`, `image/webp`) and restricts file size to 5MB. Verified in Test 192. |
| **Duplicate DL Numbers** | **MEDIUM** | `driver_profiles.license_number` lacks a `UNIQUE` database constraint; client `submitDriverApplication` does not check for duplicate DL numbers across different drivers. |
| **Duplicate Vehicle Plates** | **LOW (Mitigated)** | `vehicles.plate_number` has a `UNIQUE` database constraint. Client registration checks existing plates. |
| **Unapproved Driver Dispatch Leak** | **LOW (Mitigated)** | Multiple guard checks in `db.setDriverAvailability` and `db.respondToRideOffer` prevent unapproved drivers from taking rides. |

---

## 12. End-to-End Test Verification

The existing automated test suite was executed via `npm test` (`tsx src/tests/runCliTests.ts`).  
**Result:** **209 / 209 Tests Passed (100% Pass Rate)**.

Specific driver onboarding and lifecycle tests verified:
1. **Test 27:** Fleet vehicle driver assignment strictly enforces KYC approval; unapproved driver rejected (`PASS`).
2. **Test 73:** Driver or passenger attempting to self-approve KYC strictly rejected with 401/403 (`PASS`).
3. **Test 95:** Driver signup creates least-privileged passenger identity without automatic KYC approval (`PASS`).
4. **Test 96:** Driver application enters `under_review` status; driver is strictly offline (`PASS`).
5. **Test 144:** Driver ledger idempotent earnings recording (`PASS`).
6. **Test 145:** Airport toll 100% pass-through allocated to driver payout (`PASS`).
7. **Test 148:** Driver ledger records isolated per driver; zero cross-driver leakage (`PASS`).
8. **Test 155:** Brand-new driver wallet strictly shows ₹0.00 without fabricated data (`PASS`).
9. **Test 192:** KYC photo upload enforces strict MIME whitelist and 5MB size limit (`PASS`).

---

## 13. Missing & Incomplete Features Summary

1. **Public "Drive with AeroPool" Entry:** No CTA in Navbar, Landing Hero, or Footer directing prospective drivers to sign up.
2. **Role Selection in Auth Modal:** `AuthModal.tsx` lacks a driver sign-up option or a redirect to the onboarding flow.
3. **Dedicated Registration Wizard Route:** Missing `/driver/register` multi-step onboarding wizard.
4. **Real Binary File Uploads:** No file upload inputs for DL front/back, RC, or Police certificate.
5. **Supabase Storage Bucket & Policies:** Missing `kyc-vault` bucket configuration in migrations.
6. **Document Expiry Dates:** DL and RC expiry date inputs are not modeled.
7. **Document Previewer in Admin Console:** Admins cannot preview document scans/PDFs.
8. **Unique Constraint on License Number:** Missing `UNIQUE` constraint on `driver_profiles.license_number`.

---

## 14. Exact File Paths & Relevant API Endpoints

### Frontend Views & Components
- **`src/views/DriverKYCView.tsx`**: Main driver application and KYC form (lines 1–748).
- **`src/views/DriverDashboardView.tsx`**: Approved driver cockpit, availability toggle, dispatch response, active ride management, and GPS telemetry (lines 1–1059).
- **`src/views/AdminDashboardView.tsx`**: Super Admin driver KYC review queue, document approval/rejection, driver suspension (lines 150–220, 480–620).
- **`src/views/FleetDashboardView.tsx`**: Commercial vehicle registration and fleet driver assignment (lines 235–280, 938–1078).
- **`src/components/AuthModal.tsx`**: User registration and login modal (lines 1–546).
- **`src/components/Navbar.tsx`**: Header navigation and role-based links (lines 300–360).
- **`src/App.tsx`**: Role-based routing guards (`/driver`, `/driver/kyc`, `/admin`, lines 265–320).

### Backend Server & Endpoints
- **`server/index.ts`**:
  - `POST /api/admin/verify-kyc` (lines 530–590): Privileged endpoint synchronizing driver role with Supabase Auth Admin.
  - `POST /api/driver/trip/status` (lines 620–670): Driver ride status progression endpoint.

### Database Migrations & Schemas
- **`supabase/migrations/20261015000000_aeropool_schema.sql`**: Table schemas for `driver_profiles` (line 83), `driver_documents` (line 99), and `vehicles` (line 65).
- **`supabase/migrations/20261016000001_production_rls_and_rpc_alignment.sql`**: RLS policies for `driver_profiles` (lines 147–170) and `driver_documents` (lines 171–191).

---

## 15. Recommended Fixes Ranked by Priority

### Critical (P0) — Essential for End-to-End User Journey
1. **Public Driver Entry Point:** Add a prominent "Drive with AeroPool" CTA button in `Navbar.tsx`, `LandingView.tsx` (Hero / Quick Access Cards), and `Footer.tsx` navigating to the driver onboarding flow.
2. **Accessible Driver Onboarding Route:** Ensure `/driver/kyc` (or `/driver-register`) is directly accessible to new applicants without encountering the circular `AccessDeniedCard` from `/driver`.
3. **Applicant Post-Submission State:** When an unapproved applicant visits `/driver`, instead of showing `AccessDeniedCard`, render an informative "Application Under Review" screen showing their submitted details and current verification status.

### High (P1) — Operational & Compliance Integrity
4. **Real File Upload Support:** Replace synthetic `private-storage://` URIs with actual binary file pickers (PDF, PNG, JPG) for Driving Licence (Front & Back), Vehicle RC, and Police Clearance.
5. **Document Scan Previewer in Admin:** In `AdminDashboardView.tsx`, add an inspection modal to preview uploaded document scans before approving or rejecting.
6. **Unique Driving Licence Constraint:** Add a database migration with `ALTER TABLE driver_profiles ADD CONSTRAINT uq_driver_license UNIQUE (license_number);` and enforce duplicate check in `submitDriverApplication`.

### Medium (P2) — Business Logic & Field Completeness
7. **Document Expiry Tracking:** Add `expiryDate` fields for Driving Licence and Vehicle RC in both the UI and database schema, warning admins if a document is expired.
8. **Vehicle Insurance & PUC:** Add fields and uploads for Vehicle Commercial Insurance and PUC certificate to ensure full CSMIA commercial airport transit compliance.
9. **Rejection Notice & Document Re-upload:** Display individual document rejection reasons clearly on `/driver/kyc` so drivers know exactly which document to re-upload.

### Low (P3) — Polish & Ergonomics
10. **Admin Search & Filter:** Add a live search input in the Admin KYC queue to filter drivers by name, phone, or plate number.
11. **Driver Onboarding Stepper:** Convert the single-page `/driver/kyc` form into a 3-step wizard (1. Personal Details → 2. Driving Licence & Police Check → 3. Vehicle & RC) matching the booking wizard aesthetic.

---

## Final Verdict

### **PARTIALLY COMPLETE**

**Rationale:**  
The core security boundaries, role-based guards, state machines, administrative approval workflows, and driver cockpit functionality are solidly built and 100% verified by 209 automated tests. However, the system cannot be declared "Complete" because:
- A new driver has no public path to discover or start registration.
- Documents are captured as text strings with simulated storage URIs rather than true file uploads.
- The Admin Console lacks document scan previews.

*All findings are documented without altering any application code, preserving current functionality and environment boundaries.*

