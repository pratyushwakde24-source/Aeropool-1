# AEROPOOL — DUAL MAP PROVIDER ARCHITECTURE AUDIT
## Phase 1 Deliverable: Comprehensive Geospatial & Operational System Audit

**Audit Date:** October 2026  
**Auditor:** Principal Geospatial & Mobility Platform Architect  
**Project:** AeroPool Airport Ride-Sharing Platform  
**Target Market:** Chhatrapati Shivaji Maharaj International Airport (CSMIA / BOM), Mumbai  
**Operating Environment:** Staging (`rkuzkwggijthbqwlwnps`) | Baseline Protected (`krxkxhieyqcytknixqdm`)  
**Test Suite Baseline:** 86/86 Passing (100% Pass Rate) | TypeScript Lint: 0 Errors | Build: Passing (5.33s)

---

## 1. Executive Summary

A comprehensive architectural audit of AeroPool was conducted to inspect all geospatial, mapping, telemetry, and operational components across frontend views, services, database models, and external APIs.

The audit confirms that AeroPool possesses an advanced, production-grade ride-sharing foundation:
- **Phase 4 Real-Time Ride Matching & Telemetry** is 100% functional, passing all 86 unit and integration tests.
- **Strict Real-Data Policy (Rule Zero)** is strictly implemented: zero simulated drivers, zero fake availability, zero fabricated GPS coordinates, and honest empty states.
- **CSMIA Mumbai Airport Hubs** are configured with verified high-precision coordinates for Terminal 1, Terminal 2, and the critical T2 Level P4 Pillar 4–6 (including Pillar 5) lounge bays.
- **Driver Eligibility Engine** evaluates 10 strict operational conditions before allowing drivers to go online.
- **GPS Security Pipeline** enforces 30-second freshness validation, cryptographic actor authorization, and anti-spoofing jump rejection (>200 km/h or >5 km/s).

However, the existing mapping layer contains a critical architectural asymmetry:
- **Google Maps** is implemented for visual map rendering (`window.google.maps.Map`), SDK lifecycle management, marker rotation, geodesic polylines, and interactive click-to-pin destination selection, backed by the Mumbai Arterial Corridor Engine when billing verification is pending.
- **Mapbox** is currently integrated **only at the REST API level** (Geocoding API `/geocoding/v5/mapbox.places/` and Directions API `/directions/v5/mapbox/driving/` inside `src/services/mapProviderService.ts`). **Visual Mapbox GL rendering does not exist in `InteractiveMap.tsx`**, nor is `mapbox-gl` installed as a dependency.
- **Map Provider Switching** is hardcoded or ad-hoc: there is no centralized map provider abstraction layer, no unified marker/polyline contract, no Super Admin switching control, and no atomic fail-safe mechanism to prevent map rendering crashes.

This document details the exact state of every component, identifies architectural gaps, and establishes non-negotiable preservation rules before any code modifications begin.

---

## 2. Existing Map Implementation Matrix

| Component / Subsystem | Current Implementation | Provider Support | Status | Gaps & Technical Debt |
| :--- | :--- | :--- | :--- | :--- |
| **Map Rendering Engine** | `src/components/InteractiveMap.tsx` | Google Maps JS SDK + SVG Corridor Fallback | ⚠️ Partially Implemented | Visual map mounts exclusively on `window.google.maps.Map`. No Mapbox GL JS map canvas exists. |
| **SDK Lifecycle Loader** | `src/services/googleMapsService.ts` | Google Maps (`libraries=places,geometry`) | ⚠️ Google Only | Dynamic script injection handles Google Maps auth warnings (`gm_authFailure`). No Mapbox GL JS script or CSS loader exists. |
| **API Key / Token Config** | `.env`, `.env.example`, `googleMapsService.ts`, `mapProviderService.ts` | Dual Configured (`VITE_GOOGLE_MAPS_API_KEY`, `VITE_MAPBOX_ACCESS_TOKEN`) | ⚠️ Partial | Google Maps API key exists in `.env`. Mapbox token exists in code fallbacks but is absent from `.env`. No admin-configurable provider state. |
| **Places Autocomplete** | `mapProviderService.ts` (`searchDestinationPlaces`) | Mapbox Geocoding REST -> Google Places -> Verified Mumbai Directory | ✅ Functional | Tries Mapbox REST geocoding, falls back to Google Places Autocomplete, then falls back to 20+ verified Mumbai directory hubs. |
| **Route Calculation** | `mapProviderService.ts` (`calculateRoute`), `googleMapsService.ts` | Mapbox Directions REST -> Google DirectionsService -> Mumbai Corridor Engine | ✅ Functional | Calculates driving distance, duration, and polyline coordinates. Correctly distinguishes verified routes from corridor fallbacks. |
| **Vehicle Markers & Heading** | `InteractiveMap.tsx` (Lines 256–276) | Google Maps Symbol (`google.maps.Marker`) | ⚠️ Google Only | Rotates custom SVG car path according to authentic `driverLocation.heading`. Only renders when `source === 'REAL_GPS' && !driverLocation.isStale`. Absent in Mapbox. |
| **Pickup & Drop-off Markers** | `InteractiveMap.tsx` (Lines 196–253) | Google Maps Circle Symbols + InfoWindows | ⚠️ Google Only | Blue circle for CSMIA pickup with InfoWindow; emerald circle for destination. Absent in Mapbox. |
| **Airport Pickup Config** | `src/services/geoService.ts`, `supabase/migrations/20261015000000_aeropool_schema.sql` | Provider-Independent Constants | ✅ Verified & Authoritative | T2 Level P4 East (`19.0972, 72.8752`), T2 Level P7 (`19.0965, 72.8739`), T1 Domestic (`19.0886, 72.8679`). Must be preserved verbatim. |
| **Geolocation ("My Location")** | `InteractiveMap.tsx` (`handleRequestLiveGPS`) | Browser Geolocation API (`navigator.geolocation`) | ⚠️ Partial | High-accuracy mode with fallback; previously encountered timeout needs retry with lower accuracy and clearer UI diagnostics. |
| **Admin Provider Switcher** | Not implemented | None | ❌ Missing | No Super Admin UI to inspect provider health or toggle active provider. |

---

## 3. Existing AeroPool Architecture Audit

### 3.1 Driver Model & Eligibility Engine
- **File:** `src/services/db.ts` (`setDriverAvailability`, lines 2876–3036)
- **Lifecycle States:** `OFFLINE` ➔ `GOING_ONLINE` ➔ `ONLINE_AVAILABLE` ➔ `RIDE_REQUEST_RECEIVED` ➔ `RIDE_ACCEPTED` ➔ `EN_ROUTE_PICKUP` ➔ `ARRIVED_PICKUP` ➔ `BOARDING_PASSENGERS` ➔ `TRIP_STARTED` ➔ `TRIP_COMPLETED`.
- **The 10 Strict Eligibility Conditions (All Enforced):**
  1. *Authenticated Account:* Driver must map to an existing `UserProfile` in database.
  2. *Approved KYC:* `verificationStatus === 'approved'`. Unapproved, pending, or rejected drivers rejected.
  3. *Active Approved Vehicle:* Assigned vehicle must exist in `db.getState().vehicles` with `status === 'ACTIVE'`.
  4. *Valid Vehicle Registration:* Registration plate must be at least 6 characters (e.g., `MH 02 EE 8421`).
  5. *Seating Capacity:* Seating capacity must be at least 1 passenger seat.
  6. *Fleet Relationship:* Organization must not be suspended.
  7. *Explicit GPS Consent:* `gpsConsentGranted === true`.
  8. *Recent Device Location:* Must have fresh GPS telemetry; pings in `GOING_ONLINE` state until first authentic lock.
  9. *No Conflicting Trips:* Must not have an active pool in `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, etc.
  10. *Account Not Suspended:* Rejects `suspended` or `rejected` drivers.
- **Preservation Directive:** This 10-point check must remain the sole authority. The map provider layer must never create separate availability checks.

### 3.2 GPS Telemetry & Freshness Engine
- **File:** `src/services/db.ts` (`recordDriverLocationBreadcrumb`, lines 2500–2682)
- **Freshness Window:** 30 seconds (`Date.now() - updateMs <= 30000`). Stale pings (>30s) or future forged timestamps (>5s) are rejected.
- **Anti-Spoofing Jump Filter:** Rejects implied speeds exceeding 200 km/h or coordinate jumps >5 km in sub-second intervals.
- **Actor Authorization:** Drivers can only broadcast their own coordinates; cross-driver identity spoofing is rejected.
- **Active Trip Binding:** If broadcasting for a `poolId`, the trip must be active; concluded trips (`COMPLETED`, `CANCELLED`) reject updates.
- **Access Control & Privacy (`getPoolLocationTelemetry`, lines 2689–2752):**
  - Only assigned passengers, assigned driver, authorized fleet operator, or admin can track.
  - Concluded trips automatically redact live coordinates and breadcrumbs.
  - Telemetry flagged as `isStale: true` when older than 30s.

### 3.3 Ride Matching, Offers & Cascading Dispatch
- **File:** `src/services/db.ts` (`findEligibleDriversForPickup`, `createRideOfferForPool`, lines 3042–3380)
- **Zero Fake Drivers:** `findEligibleDriversForPickup` queries only real, approved, online drivers with GPS updated within 30s within the pickup radius (default 5 km – 15 km). If none match, returns honest empty array `[]`.
- **45-Second Ride Offers:** Offers expire after 45s; automated sweeper cancels expired offers.
- **Atomic Acceptance:** First driver to accept wins; concurrent offers for the pool are cancelled immediately.
- **Cascading Dispatch:** If a driver declines or an offer expires, the engine automatically cascades the offer to the next eligible driver in queue.

### 3.4 Airport Configuration & Pickup Bay Geometry
- **File:** `src/services/geoService.ts`
- **CSMIA Terminal 2 Pickup Hubs:**
  - `pz-t2-p4-east`: **T2 Level P4 East (AeroPool Lounge)** — Pillar 4–6 (including **Pillar 5**), Level P4 Arrival Concourse. Lat: `19.0972`, Lng: `72.8752`.
  - `pz-t2-p7-pool`: **T2 Level P7 Shared Ride Hub** — Bay C, Pillar 12, MLCP Level P7. Lat: `19.0965`, Lng: `72.8739`.
- **CSMIA Terminal 1 Pickup Hub:**
  - `pz-t1-arr-main`: **T1 Domestic Arrival Curbside Zone** — Pillar 3 & 4. Lat: `19.0886`, Lng: `72.8679`.
- **Curated Mumbai Destinations:** 20+ verified metropolitan hubs across BKC, Lower Parel, Worli, Nariman Point, Colaba, Powai, Andheri, Borivali, Vashi, and Thane.
- **Preservation Directive:** Verified coordinates must not be modified or replaced with approximate values.

---

## 4. Current Mapbox Integration Deep-Dive

### What Works:
1. **Token Extraction:** Evaluates `VITE_MAPBOX_ACCESS_TOKEN`, `MAPBOX_ACCESS_TOKEN`, `VITE_MAPBOX_TOKEN`.
2. **REST Geocoding:** `https://api.mapbox.com/geocoding/v5/mapbox.places/${clean}.json` with `country=in` and `proximity=72.8628,19.0902` (CSMIA) biases autocomplete to Mumbai.
3. **REST Directions:** `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?geometries=geojson&overview=full` returns real road geometry, distance in km, and duration in minutes.

### What is Missing:
1. **Mapbox GL JS Map Canvas:** No Mapbox GL SDK is loaded; no `mapboxgl.Map` instance is ever initialized.
2. **Mapbox Dependency:** `mapbox-gl` is not in `package.json`. A client SDK loader (similar to Google Maps script loader) or CDN/package inclusion is required.
3. **Mapbox Stylesheet:** Mapbox requires `mapbox-gl.css` for proper canvas dimensions, controls, and marker positioning.
4. **Mapbox Markers:** No Mapbox HTML markers for pickup, destination, or vehicle heading.
5. **Mapbox Polyline Layer:** No GeoJSON source or line layer for route rendering on Mapbox.
6. **Mapbox Camera Controls:** No `fitBounds`, `flyTo`, or zoom handlers.

---

## 5. Current Google Maps Integration Deep-Dive

### What Works:
1. **Dynamic SDK Loader:** `loadGoogleMapsScript()` asynchronously loads `maps.googleapis.com/maps/api/js?key=...&libraries=places,geometry`.
2. **Auth Failure Trapping:** `window.gm_authFailure` intercepts Google Cloud authentication errors without crashing the React application.
3. **Live Canvas Mounting:** Mounts `window.google.maps.Map` with a dark custom style palette (`#1d2c4d`, `#0e1626`, `#38bdf8`).
4. **Rotated Vehicle Marker:** Custom SVG vehicle geometry rotated via `rotation: headingDeg` matching real GPS pings.
5. **Geodesic Polyline:** `window.google.maps.Polyline` rendered in `#38bdf8`.
6. **Interactive Pin Placement:** Click listener on map updates destination coordinates.
7. **DirectionsService:** Computes route via Google Directions API when active.
8. **Resilient Fallback:** Automatically renders the Mumbai Arterial Corridor Engine when Google Cloud billing verification is pending.

### What Needs Improvement:
1. **Tight Coupling:** `InteractiveMap.tsx` directly accesses `window.google.maps.*` throughout its component body, making it impossible to switch to Mapbox without code rewrites.
2. **Missing Provider Interface:** No contract separating map state from provider-specific rendering logic.
3. **Duplicate Geocoding / Routing Calls:** Both `googleMapsService.ts` and `mapProviderService.ts` have overlapping routing and autocomplete methods.

---

## 6. What Must Be Preserved (Non-Negotiable)

1. **Authentication System:** Supabase auth and local session management (`authService.ts`).
2. **Passenger Booking System:** 5-step booking flow in `PassengerBookView.tsx`.
3. **Driver Onboarding & KYC:** Document verification and lifecycle controls in `DriverKYCView.tsx`.
4. **Driver Availability System:** The 10 eligibility conditions in `db.setDriverAvailability`.
5. **GPS Tracking Engine:** `recordDriverLocationBreadcrumb` with 30s freshness and anti-spoofing velocity filter.
6. **Ride Matching & Cascading Dispatch:** `findEligibleDriversForPickup`, 45s `RideOffer` timer, and auto-cascading.
7. **Airport Coordinates:** CSMIA T1, T2, and T2 Level P4 Pillar 5 lounge coordinates (`19.0972, 72.8752`).
8. **Payment Security:** Razorpay in TEST MODE (`rzp_test_*`); never switch to LIVE MODE.
9. **Zero Fake Data Policy:** Never generate dummy drivers, mock coordinates, or simulated vehicles.
10. **Target Supabase Staging Environment:** Project `rkuzkwggijthbqwlwnps` is staging; never touch baseline `krxkxhieyqcytknixqdm`.

---

## 7. Files Identified for Refactoring / Extension

| File Path | Action | Description |
| :--- | :--- | :--- |
| `src/services/maps/MapProvider.ts` | **Create** | Common interface definition (`IMapProvider`, `MapCameraState`, `MapMarkerDescriptor`, `MapRouteDescriptor`). |
| `src/services/maps/GoogleMapsProvider.ts` | **Create** | Implementation of `IMapProvider` for Google Maps JavaScript SDK. |
| `src/services/maps/MapboxProvider.ts` | **Create** | Implementation of `IMapProvider` for Mapbox GL JS SDK. |
| `src/services/maps/MapProviderFactory.ts` | **Create** | Factory resolving provider instance by key (`'google'` \| `'mapbox'`). |
| `src/services/maps/MapProviderHealth.ts` | **Create** | Active probe service validating credentials, rendering, search, and routing for both providers. |
| `src/services/maps/MapProviderConfig.ts` | **Create** | Persistent active provider setting with Super Admin authorization. |
| `src/components/InteractiveMap.tsx` | **Refactor** | Delegate rendering to active map provider via common interface while preserving dark midnight theme, HUD, and fallbacks. |
| `src/views/AdminDashboardView.tsx` | **Extend** | Add Super Admin "Map Provider Settings" card with live health badges and atomic safe-switch button. |
| `src/tests/testSuite.ts` | **Extend** | Add unit tests verifying dual provider initialization, safe switching, camera preservation, and fallback handling. |

---

## 8. Potential Compatibility Issues & Security Risks

1. **Mapbox GL CSS Dependency:** Mapbox GL requires its companion CSS stylesheet (`mapbox-gl.css`). If omitted, map controls and canvas will render distorted.
2. **Google Maps Script Clashing:** Reloading or unmounting Google Maps scripts dynamically can cause `google is not defined` or duplicate script errors.
3. **Atomic Switching Failure State:** If a Super Admin switches to an unconfigured provider (e.g. missing token), the active map must NOT crash or turn blank; it must revert atomically to the last working provider with an informative notice.
4. **Credential Exposure:** Neither Google Maps API key nor Mapbox access token must be leaked into audit reports or backend error responses.
5. **Realtime Listener Leaks:** Switching map providers while tracking an active driver must not duplicate or detach Supabase Realtime listeners.

---

## 9. Audit Conclusion & Sign-Off

The existing AeroPool application is in a stable, verified state with all 86 Phase 4 tests passing. The roadmap is clear: we must now implement the provider abstraction without altering any of AeroPool's business, matching, dispatch, or payment logic.
