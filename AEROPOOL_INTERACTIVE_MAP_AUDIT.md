# AeroPool — Interactive Map Architecture & Integration Audit
**Phase 1 Deliverable — Geospatial System Inspection**
*Generated: 2026-11-07*

---

## Executive Summary

A comprehensive architectural audit was performed on AeroPool's mapping, routing, and real-time geospatial infrastructure across the frontend codebase, backend APIs, and external mapping SDKs.

The system features an enterprise-grade dual-provider abstraction (`IMapProvider`) supporting both **Mapbox GL JS (v3.4.0)** and **Google Maps Platform JavaScript API**, backed by **Mapbox Directions API** and **Google Directions / Routes API** with verified Mumbai arterial corridor geometry as an authoritative fallback.

---

## 1. Existing Map Components

- **`src/components/InteractiveMap.tsx`**:
  The primary interactive map component used in passenger booking (`PassengerBookView.tsx`), live telemetry tracking (`PassengerTrackView.tsx`), and the Super Admin control panel (`MapProviderSettingsCard.tsx`). It renders real map canvas elements, controls markers, route polyline layers, device GPS acquisition, and responsive touch/viewport interactions.
- **`src/components/MapProviderSettingsCard.tsx`**:
  Super Admin diagnostic HUD allowing live health checks, latency probes, credential validation, and live runtime switching between Mapbox GL and Google Maps.

---

## 2. Map Provider Service (`mapProviderService.ts`)

- Provides unified routing (`calculateRoute()`), place autocomplete (`searchDestinationPlaces()`), and an authoritative directory (`VERIFIED_MUMBAI_DIRECTORY`).
- Integrates with the Mapbox Directions API (`https://api.mapbox.com/directions/v5/mapbox/driving/...`) using GeoJSON geometry decoding.
- Automatically handles fallback to Google Directions and verified Mumbai corridor road vectors without fabricating fake routes.

---

## 3. Google Maps SDK Loader (`googleMapsService.ts`)

- Dynamic asynchronous loader (`loadGoogleMapsScript`) injecting the Google Maps JavaScript API with Places and Geometry libraries.
- Diagnostic status listener capturing `gm_authFailure`, `BillingNotEnabledMapError`, and `ApiNotActivatedMapError`.
- **Audit Finding**: When probed live, the Google Maps project returns `REQUEST_DENIED You're calling a legacy API, which is not enabled for your project.` confirming that Mapbox GL is the preferred, high-performance, active provider for crisp vector tile rendering and accurate driving routes.

---

## 4. Mapbox Integration & Access Token Configuration (`mapboxGlLoader.ts`)

- Dynamic loader (`loadMapboxScript`) injecting Mapbox GL JS v3.4.0 and official CSS (`mapbox-gl.css`).
- Configured via `VITE_MAPBOX_ACCESS_TOKEN` in `.env` (`pk.eyJ1IjoicHJhdHl1c2gyNCIs...`).
- **Live Probe Verification**:
  - Mapbox Directions API: **200 OK** (10.13 km, 31 mins driving route with 194 road waypoints from CSMIA T2 to BKC).
  - Mapbox Dark Style (`mapbox://styles/mapbox/dark-v11`): **200 OK** and authenticated.

---

## 5. Existing `InteractiveMap.tsx` Inspection

- Currently mounts the provider canvas into a DOM container and delegates rendering to `IMapProvider`.
- When the SDK is loading, it previously showed a stylized SVG wireframe corridor.
- Controls: Previously had basic zoom state and geolocation request, but lacked the sleek, minimal floating controls matching the reference design.
- Markers: Supported basic SVG/div pins, but lacked the high-fidelity white pill callout (`CSMIA T2` with airplane icon and triangular pointer) and the glowing crimson drop-off pin.

---

## 6. Route Calculation & Polylines

- Coordinates for CSMIA Terminal 2: `19.0988, 72.8744` (or `19.0902, 72.8628` CSMIA central hub).
- Destination BKC coordinates: `19.0662, 72.8688`.
- Route points returned: 194 real geographic coordinates along the Western Express Highway, Sahar Airport Road, and BKC connector.
- Polyline rendered via Mapbox GeoJSON source `aeropool-route-source` and line layer `aeropool-route-layer`.

---

## 7. Pickup & Destination Coordinate Handling

- Authoritative coordinate dictionary in `src/services/geoService.ts`:
  - `CSMIA_AIRPORT`: Latitude 19.0902, Longitude 72.8628.
  - `PICKUP_ZONES`: Terminal 2 P4 East/West (`19.0988, 72.8744`), Terminal 1 P1/P2 Departure/Arrival (`19.0894, 72.8552`).
  - `MUMBAI_DESTINATIONS`: BKC (`19.0662, 72.8688`), Bandra West (`19.0596, 72.8295`), Nariman Point (`18.9256, 72.8242`), Lower Parel (`19.0016, 72.8268`), etc.

---

## 8. Real-Time Driver GPS Tracking Implementation (`realtimeGpsService.ts`)

- Subscribes to Supabase Realtime channels partitioned strictly by `telemetry-pool-{poolId}`.
- Single source of truth through `db.recordDriverLocationBreadcrumb`.
- Stale detection: automatically flags data older than 30 seconds as stale (`isStale: true`).
- Strictly never fabricates fake driver positions when no real driver GPS stream is active.

---

## 9. Fallback & Switching Mechanisms

- Managed by `MapProviderFactory.ts` and `MapProviderConfig.ts`.
- Allows instant hot-swapping between `google` and `mapbox` without page reload.
- If Mapbox token is present and valid, Mapbox renders the high-performance dark vector map.
- If Google Maps is selected and configured, Google Maps renders with custom midnight JSON styling.

---

## 10. Environment Variables

| Variable | Description | Audit Status |
| :--- | :--- | :--- |
| `VITE_MAPBOX_ACCESS_TOKEN` | Public token for Mapbox GL JS & Directions | **Configured & Active (200 OK)** |
| `VITE_GOOGLE_MAPS_API_KEY` | Public browser key for Google Maps SDK | Configured (Legacy Directions restricted) |
| `VITE_DEFAULT_MAP_PROVIDER`| Preferred provider ('mapbox' or 'google') | Defaults to 'mapbox' / 'google' |
| `VITE_MAP_TILES_URL` | OpenStreetMap tile fallback | Configured |

---

## Key Recommendations for Phase 2–10 Implementation

1. **Activate Mapbox as the Primary Mapbox GL Engine**: Ensure `MapProviderConfig.ts` defaults to Mapbox when Mapbox token is available and healthy.
2. **Recreate Reference Visual Style in Mapbox Style Layer Configuration**:
   - Background: `#0B1930`
   - Roads: `#1C2B44` / `#223755`
   - Parks/greenspace: `#0D3828`
   - Runway / airport zone: slate navy `#22324A` with visible labels
   - Primary route polyline: `#00DDF5` (width 4.5px, rounded caps, smooth curves)
3. **Rebuild High-Fidelity Custom HTML Markers**:
   - **Pickup**: Cyan circular pulse marker with white border + floating white callout pill (`✈ CSMIA T2`) with downward pointer arrow.
   - **Destination**: Crimson/rose teardrop pin (`#F0445E`) with white center dot and drop shadow at BKC.
4. **Minimal Floating Controls**:
   - Top right: Circular dark navy GPS locate button.
   - Bottom right: Vertical dark pill with `+` / `-` zoom buttons.
5. **Keep Container Pure**:
   - Zero marketing cards, fare banners, or headers inside `InteractiveMap.tsx`.
   - Maintain responsive aspect ratio across 360px, 390px, 430px, 768px, and 1280px.

