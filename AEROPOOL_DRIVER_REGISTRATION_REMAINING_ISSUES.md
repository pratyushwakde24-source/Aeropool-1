# AeroPool Driver Registration & KYC — Remaining Issues & Future Roadmap

**Document ID:** AEROPOOL-DRIVER-REMAINING-001  
**Target:** Post-Implementation Operational Considerations & Backlog  
**Date:** 2026-11-09T13:28:55+05:30  
**Current State:** CORE FLOW FULLY OPERATIONAL (No Blocking Issues)  

---

## 1. Executive Summary

The primary objective of the master implementation task—to deliver a connected, functional, secure, and accessible Driver Registration, KYC, and Onboarding System—has been **100% achieved**.

There are **zero blocking bugs or unresolved regressions** preventing driver applicants from registering, uploading real documents, saving drafts, submitting applications, or being reviewed and approved by administrators.

This document details optional operational enhancements, future third-party integrations, and production deployment considerations for subsequent product iterations.

---

## 2. Inventory of Operational Enhancements & Roadmap Items

### 2.1 Government RTO Parivahan / Vahan API Integration
- **Current Architecture:** Document verification relies on manual compliance officer review in the Super Admin KYC Queue (SLA: 4 business hours).
- **Roadmap Item:** Integrate with the Ministry of Road Transport and Highways (MoRTH) Parivahan NextGen API or a licensed verification partner (e.g., IDfy, Signzy, Cashfree Verification) to perform instant automated DL and RC validation against national RTO records.
- **Priority:** Medium (Post-Launch Optimization).
- **Impact:** Reduces verification turnaround from hours to under 30 seconds.

### 2.2 Client-Side OCR & Automated Field Pre-filling
- **Current Architecture:** Drivers enter their DL and RC numbers manually, then upload the corresponding scan.
- **Roadmap Item:** Implement client-side OCR (or server-side vision processing) to detect licence number, name, and validity dates directly from the uploaded image, automatically populating the form and prompting the driver to confirm.
- **Priority:** Low (UX Polish).
- **Impact:** Decreases form completion time and reduces typo rates during mobile registration.

### 2.3 Mobile Browser Camera Guide Overlay
- **Current Architecture:** File inputs allow choosing a file from gallery or invoking the device camera via standard HTML5 file inputs (`accept="image/*"`).
- **Roadmap Item:** Add an interactive camera viewfinder modal with card alignment guides (rectangular overlay with corner markers) to ensure drivers take well-lit, uncropped photos of their licence card.
- **Priority:** Low (UX Polish).
- **Impact:** Reduces the rate of rejected documents due to blurry or cropped edges.

### 2.4 Multichannel Push & SMS Notifications
- **Current Architecture:** Drivers receive real-time in-app notifications in `state.notifications` upon application submission, document approval, rejection, or suspension.
- **Roadmap Item:** Connect WebPush / Firebase Cloud Messaging (FCM) and transactional SMS (via Twilio or Gupshup) to notify drivers via SMS when their application is approved or if a document requires re-upload.
- **Priority:** Medium (Operational Readiness).
- **Impact:** Ensures drivers are notified even when the AeroPool web application tab is closed.

### 2.5 Production Supabase Database Migration
- **Current Architecture:** The comprehensive SQL migration script has been authored and validated at `supabase/migrations/20261109000000_driver_kyc_and_storage.sql`. Under the sandbox non-negotiables, remote production schema writes are strictly prohibited without authorization.
- **Action Required for Production Launch:** Execute the migration on the live Supabase cluster during the scheduled production maintenance window to establish the private `kyc-vault` storage bucket and schema constraints.
- **Priority:** Pre-Production Prerequisite.

---

## 3. Maintenance & Monitoring Guidelines

1. **Storage Vault Capacity:** Monitor disk space on `server/storage/kyc-vault/`. Implement automatic archiving to cold cloud storage for applications older than 180 days.
2. **Token TTL Tuning:** The 15-minute preview token expiration strikes the optimal balance between security and user convenience. Do not extend token validity beyond 30 minutes without re-evaluating risk exposure.
3. **Magic Bytes Maintenance:** Should newer image formats (such as AVIF) be introduced, update `validateMagicBytes` and `ALLOWED_MIME_TYPES` in `server/kycStorageService.ts` simultaneously.

