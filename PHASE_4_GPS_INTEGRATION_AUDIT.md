# AeroPool — Phase 4 Pre-Implementation Audit
## Real-Time Driver GPS Integration on Google Maps and Mapbox

**Audit Date:** November 2026  
**Environment:** Staging (`rkuzkwggijthbqwlwnps`) | Baseline (`krxkxhieyqcytknixqdm`) Protected  
**Auditor:** Principal Geospatial Systems & Real-Time Telemetry Engineer  

---

## 1. Executive Summary

This audit assesses the existing AeroPool codebase prior to the implementation of **Phase 4: Real-Time Driver GPS Integration on Google Maps and Mapbox**.

AeroPool already possesses a robust core foundation for driver eligibility, anti-spoofing coordinate validation, and local reactive state dispatch. However, significant architectural gaps exist in **cross-device real-time WebSocket synchronization (Supabase Realtime)**, **marker diffing and interpolation (preventing destructive re-creation on GPS ticks)**, **smooth heading transitions**, and **fail-safe provider switching during active ride tracking**.

This document details:
1. What currently exists and must be strictly preserved.
2. What is genuinely incomplete or missing.
3. The precise architectural extension required to achieve production-quality driver tracking across both Google Maps and Mapbox without duplicating existing systems or rebuilding core logic.

---

## 2. Existing GPS Telemetry & Tracking Architecture

### A. Authoritative GPS Ingestion & Validation (`src/services/db.ts`)
The `recordDriverLocationBreadcrumb` method in `AeroPoolDatabase` serves as the authoritative backend ingestion gate. It enforces:
- **Strict Coordinate Bounds**: Latitude $\in [-90, 90]$, Longitude $\in [-180, 180]$, rejecting `NaN` or malformed inputs.
- **30-Second Freshness Window**: Rejects telemetry timestamps older than 30 seconds or future-forged timestamps (> 5 seconds ahead).
- **Driver Role & KYC Authorization**: Confirms the actor is the approved driver (`verificationStatus === 'approved'`) with explicit GPS consent granted (`gpsConsentGranted === true`). Rejects identity spoofing.
- **Anti-Spoofing & Teleportation Detection**: Uses the Haversine formula to compute velocity between successive breadcrumbs; rejects jumps exceeding 200 km/h or instant displacements $> 5\text{ km}$ under 1 second.
- **Trip Lifecycle Scoping**: Rejects live location ingestion for completed or cancelled trips to prevent privacy leakage.
- **Breadcrumb History Buffer**: Retains a rolling window of up to 50 breadcrumbs per pool.

### B. Driver Dashboard GPS Collection (`src/views/DriverDashboardView.tsx`)
- Uses `navigator.geolocation.watchPosition` when the driver transitions to `ONLINE`.
- Configured with `{ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }`.
- Automatically clears the watcher on unmount or when transitioning `OFFLINE`.
- Enforces all 8 driver eligibility gates before allowing a driver to enter the online dispatch queue.
- **Identified Flaw**: Lines 156–157 contained artificial default fallback values (`speed || 34`, `heading || 190`). These must be replaced with strict authentic readings (defaulting to 0/last known rather than manufactured values).

### C. Map Provider Abstraction Layer (`src/services/maps/`)
- `IMapProvider`: Declares common interface for camera, markers, polylines, and lifecycle.
- `GoogleMapsProvider`: Google Maps JS SDK adapter with custom SVG car path and rotation support.
- `MapboxProvider`: Mapbox GL JS v3 adapter with custom rotating HTML vehicle markers.
- `InteractiveMap.tsx`: Universal reactive viewport that synchronizes markers and route polylines.
- **Identified Flaw in Marker Handling**: Both `GoogleMapsProvider.setMarkers()` and `MapboxProvider.setMarkers()` currently destroy **all** existing markers on every call (`marker.setMap(null)` / `marker.remove()`) and re-instantiate new markers from scratch. When GPS ticks arrive every 1–3 seconds, this causes DOM thrashing, flickering, and prevents smooth marker movement.

### D. Supabase Database & Realtime Infrastructure
- Database migration `20261024000000_realtime_publication_and_indexes.sql` enabled `REPLICA IDENTITY FULL` on `bookings`, `ride_pools`, and `driver_profiles` and added them to publication `supabase_realtime`.
- In-memory reactive pub/sub (`db.subscribe()`) works well for single-session local testing, but **multi-device synchronization** (e.g. driver broadcasting from an Android smartphone, passenger viewing on a laptop) requires a dedicated, lightweight Supabase Realtime broadcast and Postgres changes integration.

---

## 3. Inventory: Existing vs. Genuinely Incomplete Features

| Subsystem / Feature | Current State in Codebase | Gap / Incomplete Functionality | Required Phase 4 Action |
| :--- | :---: | :--- | :--- |
| **Driver Hardware GPS Collection** | Existing (`watchPosition`) | Minor fallback value defect (`speed: 34`, `heading: 190`). Permission states need clearer driver feedback. | Sanitize fallbacks. Add explicit permission error handling. |
| **Driver Eligibility Invariants** | Fully Implemented (8 gates) | None. KYC, vehicle, fleet, consent checks are solid. | **Preserve 100% without modification.** |
| **Marker Differential Updating** | **Missing** | Both providers wipe and recreate all markers on every GPS tick. | Implement marker diffing by ID: update position and heading in-place without rebuilding DOM. |
| **Smooth Visual Interpolation** | **Missing** | Markers jump abruptly between raw GPS coordinates. | Add requestAnimationFrame-based lerp interpolation for coordinates and heading rotation. |
| **Supabase Realtime Multi-Device Sync** | **Incomplete** | Database publication exists, but client-side channel subscription service is missing. | Implement `realtimeGpsService.ts` using Supabase Channel broadcast (`pool:<poolId>`). |
| **Stale GPS Visual Indicator** | Partially Implemented | Text status exists in HUD, but vehicle marker styling does not visually reflect stale GPS (>30s). | Add opacity/desaturation styling for stale vehicle marker. |
| **Map Provider Switching in Active Ride** | Partially Implemented | Phase 3 switcher preserves camera and markers on load, but lacks hot-handover state transfer for live subscriptions. | Ensure `realtimeGpsService` persists across provider switches with zero telemetry drop. |
| **Passenger Live HUD** | Existing | Displays OTP, driver info, and breadcrumb log. Lacks fine-grained connection status (reconnecting, GPS lost). | Enhance HUD with live telemetry health tags and strict no-fake-ETA rules. |

---

## 4. Phase 4 Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                 DRIVER ANDROID SMARTPHONE                   │
│   navigator.geolocation.watchPosition (High Accuracy)       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 AEROPOL DATABASE VALIDATION                 │
│   - Coordinate bounds check (lat/lng range)                 │
│   - 30s freshness check (rejects stale/future timestamps)   │
│   - Anti-spoofing jump filter (Haversine velocity < 200km/h)│
│   - Eligibility check (KYC approved, GPS consent granted)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 SUPABASE REALTIME ENGINE                    │
│   Channel: `pool:<poolId>` (Scoped to active trip)          │
│   Broadcast Event: `GPS_TELEMETRY_UPDATE`                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ (WebSocket sub-100ms)
┌─────────────────────────────────────────────────────────────┐
│                 PASSENGER CLIENT VIEWPORT                   │
│   RealtimeGpsService ──► Validates Incoming Broadcast      │
│                        ──► Updates Local Authoritative Store │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               ACTIVE MAP PROVIDER (Google / Mapbox)         │
│   - Differential Marker Updater (No full-map teardown)      │
│   - Smooth RAF Coordinate & Heading Interpolation           │
│   - Stale GPS Visual Desaturation (> 30s)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Security & Privacy Guarantees

1. **Trip-Level Scope**: Realtime telemetry is partitioned strictly by `poolId`. Unassigned passengers cannot subscribe to arbitrary driver coordinates.
2. **Post-Trip Redaction**: Once a pool status transitions to `COMPLETED` or `CANCELLED`, telemetry broadcasting is immediately rejected and unsubscribed.
3. **No Fake Vehicles**: Zero vehicle markers will be rendered unless backed by a genuine, KYC-approved driver with an active, fresh GPS stream.
4. **Zero Key Exposure**: Mapbox tokens and Google Maps keys remain masked in all diagnostic outputs and logs.

---

## 6. Pre-Implementation Audit Sign-Off

The existing architecture provides a reliable, secure foundation. Implementation of Phase 4 will proceed strictly to fill the identified gaps:
- Implement `realtimeGpsService.ts` for unified Supabase Realtime telemetry transport.
- Implement in-place marker diffing and smooth coordinate/heading interpolation on `GoogleMapsProvider` and `MapboxProvider`.
- Enhance `InteractiveMap.tsx` and `PassengerTrackView.tsx` with stale GPS detection and provider switch resiliency.
- Sanitize driver GPS reading defaults in `DriverDashboardView.tsx`.
- Expand automated tests in `testSuite.ts` (Tests 119–135) to verify 100% compliance.

