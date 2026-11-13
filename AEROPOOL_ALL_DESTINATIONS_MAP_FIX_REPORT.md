# AEROPOOL — ALL DESTINATIONS MAP VERIFICATION & FIX REPORT

## Executive Summary

This report documents the investigation, root-cause resolution, and full end-to-end browser verification of the interactive map and dynamic route rendering across **all six popular Mumbai destinations** departing from Chhatrapati Shivaji Maharaj International Airport (CSMIA) Terminal 2.

Previously, the interactive map would appear blank or fail when switching between destinations. With these fixes, selecting **any** of the six destinations (or entering custom addresses via autocomplete / dropping map pins) instantly triggers a live Mapbox Directions API request, decodes the genuine road geometry polyline, animates the dark navy viewport bounds to fit both CSMIA T2 and the target destination, and updates the ride metrics card in real time.

---

## 1. Destination-by-Destination Verification Matrix

Every destination has been tested and verified via live Mapbox Directions API queries and automated Chrome DevTools Protocol (CDP) browser execution on mobile (390×844) viewport:

| # | Destination Name | Hub ID | Latitude / Longitude | API Status | Distance | Est. Duration | Polyline Points | Markers Rendered | Map Loaded |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Bandra Kurla Complex (BKC)** | `bkc-bandra` | `19.0662, 72.8688` | **200 OK** | **10.2 km** | **32 mins** | 194 points | Pickup + Destination | **YES** |
| 2 | **Bandra West** | `bandra-west` | `19.0596, 72.8295` | **200 OK** | **9.6 km** | **36 mins** | 223 points | Pickup + Destination | **YES** |
| 3 | **Lower Parel & Worli** | `lower-parel-worli` | `19.0016, 72.8268` | **200 OK** | **22.0 km** | **50 mins** | 383 points | Pickup + Destination | **YES** |
| 4 | **South Mumbai (Nariman Pt / Colaba)** | `nariman-colaba` | `18.9256, 72.8242` | **200 OK** | **27.2 km** | **49 mins** | 440 points | Pickup + Destination | **YES** |
| 5 | **Powai (Hiranandani Gardens)** | `powai-hiranandani` | `19.1197, 72.9051` | **200 OK** | **6.5 km** | **31 mins** | 201 points | Pickup + Destination | **YES** |
| 6 | **Andheri West (Lokhandwala)** | `andheri-lokhandwala` | `19.1411, 72.8265` | **200 OK** | **10.0 km** | **46 mins** | 289 points | Pickup + Destination | **YES** |

*Pickup Location for all tests: CSMIA Terminal 2 Level P4 East (`19.0972, 72.8752`).*

---

## 2. Root Cause Analysis & Technical Resolutions

### Root Cause 1: Component Remounting & WebGL Canvas Wiping
- **Mechanism:** In [`InteractiveMap.tsx`](file:///c:/Users/praty/Aeropool%201/src/components/InteractiveMap.tsx), `onDestinationSelect` and `onRouteCalculated` were listed in the `useEffect` dependency array for provider initialization. In the parent component [`PassengerBookView.tsx`](file:///c:/Users/praty/Aeropool%201/src/views/PassengerBookView.tsx), inline unmemoized callbacks were passed. Whenever a destination chip was clicked, the parent re-rendered, creating new function references that re-triggered the initialization effect. This ran `mapContainerRef.current.innerHTML = ''`, destroyed the WebGL context, and rendered a blank dark rectangle.
- **Fix:** 
  1. Decoupled parent callbacks using `useRef` inside [`InteractiveMap.tsx`](file:///c:/Users/praty/Aeropool%201/src/components/InteractiveMap.tsx#L40-L46) so callback reference changes never re-initialize the map.
  2. Guarded provider re-creation: if `providerRef.current?.isReady()` and the provider type has not changed, retain the active instance.
  3. Wrapped `handleMapPinSelect` in `useCallback` in [`PassengerBookView.tsx`](file:///c:/Users/praty/Aeropool%201/src/views/PassengerBookView.tsx#L126-L145).

### Root Cause 2: Runtime ReferenceError on Missing Hook Import
- **Mechanism:** When `useCallback` was introduced into [`PassengerBookView.tsx`](file:///c:/Users/praty/Aeropool%201/src/views/PassengerBookView.tsx#L1), the top-level import statement was `import React, { useState, useEffect } from 'react';`. Omitting `useCallback` caused `Uncaught ReferenceError: useCallback is not defined`, crashing the component during Step 2 render and preventing the map canvas from mounting.
- **Fix:** Updated the import statement to `import React, { useState, useEffect, useCallback } from 'react';`.

### Root Cause 3: Dynamic Vite Environment Variable Replacement Failure
- **Mechanism:** In [`mapProviderService.ts`](file:///c:/Users/praty/Aeropool%201/src/services/mapProviderService.ts) and [`MapProviderConfig.ts`](file:///c:/Users/praty/Aeropool%201/src/services/maps/MapProviderConfig.ts), access tokens were accessed via bracket expressions (`import.meta.env[key]`). Vite's AST bundler only statically substitutes literal string property accesses (e.g. `import.meta.env.VITE_MAPBOX_ACCESS_TOKEN`). Dynamic indexing failed to resolve at build time, resulting in `undefined` tokens and Directions API 401 Unauthorized errors.
- **Fix:** Switched to explicit static property access:
  ```typescript
  const envMapboxToken =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN
      : undefined;
  ```

### Root Cause 4: Route Layer Desynchronization on Existing Sources
- **Mechanism:** In [`MapboxProvider.ts`](file:///c:/Users/praty/Aeropool%201/src/services/maps/MapboxProvider.ts#L460-L490), `applyRouteLayer` only invoked `map.addLayer` inside the `else if (newSource)` branch. If a GeoJSON source already existed from a prior route, it updated the source data via `setData(geojson)` but skipped verifying whether the casing glow (`${ROUTE_LAYER_ID}-glow`) and primary polyline (`ROUTE_LAYER_ID`) layers existed in the style, leading to invisible routes when switching destinations.
- **Fix:** Ensured layer existence checks and re-attached both glow and polyline layers whenever missing, regardless of whether the source is reused or freshly created.

### Root Cause 5: Unbuffered Camera Fitting Before Vector Style Load
- **Mechanism:** When destinations were selected before Mapbox GL finished its initial style load (`!this.isMapLoaded`), `fitCoordinates()` silently dropped the request without queuing it.
- **Fix:** Added `pendingFitCoords` tracking in [`MapboxProvider.ts`](file:///c:/Users/praty/Aeropool%201/src/services/maps/MapboxProvider.ts#L60-L75). Once `map.once('load')` fires, any pending bounding coordinates are immediately flushed and framed.

---

## 3. Map Controls & Interactive Feature Verification

All map controls were verified through automated headless browser interaction:

1. **Satellite / Midnight Vector Toggle:**
   - Default: Custom dark midnight navy theme (`#0B1930` background, dark blue-grey roads, muted green parks).
   - Toggle button: Switches to Mapbox Satellite Streets (`mapbox://styles/mapbox/satellite-streets-v12`).
   - Verified: Layer toggle maintains pins, route layers, and camera position seamlessly.
2. **Current Location GPS Button:**
   - Triggers geolocation query or smoothly animates the camera to CSMIA Terminal 2 pickup bay when running in local sandbox.
3. **Zoom In (+) / Zoom Out (-) Controls:**
   - Tested both controls via programmatic clicks; zoom levels adjust smoothly with cubic ease transitions.
4. **Interactive Pin Dropping:**
   - Clicking arbitrary map locations invokes `handleMapPinSelect`, calculates Haversine distance, and dynamically creates a custom destination point.

---

## 4. Inspection of App.tsx Changes

The changes in [`App.tsx`](file:///c:/Users/praty/Aeropool%201/src/App.tsx) were audited to confirm zero regressions:

1. **Auth Restoring Safety Guard:**
   - Lines 52–58:
     ```typescript
     useEffect(() => {
       const timer = setTimeout(() => {
         setIsAuthRestoring(false);
       }, 1500);
       return () => clearTimeout(timer);
     }, []);
     ```
   - **Verification:** This safety timer ensures that unauthenticated visitors or slow network connections never hang indefinitely on an initial loading spinner. If Supabase auth responds sooner, `authService.initAuth` immediately sets `isAuthRestoring(false)`.
2. **Routing & Password Recovery:**
   - Popstate listeners, hash-based email confirmation routing (`type=signup`, `type=email_change`), and `PASSWORD_RECOVERY` events remain intact.
3. **No Breaking Changes:**
   - Route resolution, role-based navigation guards (`AccessDeniedCard`), and test suite modal triggers function normally.

---

## 5. Build, Test Suite & TypeScript Audit Results

- **TypeScript Compilation:**
  ```
  npx tsc --noEmit
  Exit Code: 0 (Zero errors)
  ```
- **Production Build:**
  ```
  npm run build
  vite v8.3.4 building client environment for production...
  ✓ 1773 modules transformed.
  ✓ built in 10.62s
  Exit Code: 0 (Clean production bundle)
  ```
- **Platform Architecture & Security Test Suite:**
  ```
  npm test (tsx src/tests/runCliTests.ts)
  ============================================================
  Execution Summary: 195 total tests | 195 passed | 0 failed
  Pass Rate: 100%
  ============================================================
  ```

---

## 6. Screenshot Artifact Index

High-resolution visual verification screenshots are captured in the artifact directory:

- **Destination 1 — Bandra Kurla Complex (BKC):**  
  [`destination-1-bkc-390px.png`](file:///C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots/destination-1-bkc-390px.png) (460 KB)
- **Destination 2 — Bandra West:**  
  [`destination-2-bandra-west-390px.png`](file:///C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots/destination-2-bandra-west-390px.png) (490 KB)
- **Destination 3 — Lower Parel & Worli:**  
  [`destination-3-lower-parel-worli-390px.png`](file:///C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots/destination-3-lower-parel-worli-390px.png) (405 KB)
- **Destination 4 — South Mumbai (Nariman Pt / Colaba):**  
  [`destination-4-south-mumbai-390px.png`](file:///C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots/destination-4-south-mumbai-390px.png) (353 KB)
- **Destination 5 — Powai (Hiranandani Gardens):**  
  [`destination-5-powai-390px.png`](file:///C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots/destination-5-powai-390px.png) (460 KB)
- **Destination 6 — Andheri West (Lokhandwala):**  
  [`destination-6-andheri-west-390px.png`](file:///C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots/destination-6-andheri-west-390px.png) (475 KB)
- **Satellite Mode Control:**  
  [`map-control-satellite-390px.png`](file:///C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots/map-control-satellite-390px.png) (525 KB)
- **Compact Mobile Viewport (360px):**  
  [`map-viewport-360px.png`](file:///C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots/map-viewport-360px.png) (402 KB)
- **Large Mobile Viewport (430px):**  
  [`map-viewport-430px.png`](file:///C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots/map-viewport-430px.png) (512 KB)
- **Desktop Viewport (1280px):**  
  [`interactive-map-desktop-1280px.png`](file:///C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots/interactive-map-desktop-1280px.png) (474 KB)

