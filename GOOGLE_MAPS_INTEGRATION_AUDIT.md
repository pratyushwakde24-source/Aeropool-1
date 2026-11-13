# AeroPool — Google Maps Integration & API Audit

**Audit Date:** October 2026  
**Google Cloud Project Number:** `969747117874`  
**Configuration Source:** `VITE_GOOGLE_MAPS_API_KEY` (in `.env`)  
**Key Fingerprint:** 39 characters, standard `AIzaSy...` format

---

## 1. Executive Summary

A comprehensive, non-destructive probe of the configured Google Maps API credentials was conducted across all relevant Google Maps platform APIs. The findings confirm that the API key exists, has the proper format, and is securely wired to the application frontend and corridor engines.

However, specific API activations in the Google Cloud Console for project `969747117874` are currently pending, blocked by key service restrictions, or require switching to Google's new API endpoints.

---

## 2. Live API Probe Results Matrix

| Google Maps API Endpoint | HTTP Status | Google API Status / Error Code | Diagnostic Finding |
| :--- | :---: | :---: | :--- |
| **Maps JavaScript API** (`/maps/api/js`) | 200 | `UrlAuthenticationCommonError` | JS SDK loads HTTP 200, but execution throws auth warning. Key lacks Maps JS API enablement or origin restrictions disallow `localhost:3000`. |
| **Routes API (v2)** (`/directions/v2:computeRoutes`) | 403 | `SERVICE_DISABLED` | Routes API has not been enabled in GCP project `969747117874`. |
| **Places API (New)** (`/v1/places:autocomplete`) | 403 | `API_KEY_SERVICE_BLOCKED` | Method `AutocompletePlaces` is restricted/blocked for this specific API key. |
| **Legacy Directions API** (`/maps/api/directions/json`) | 200 | `REQUEST_DENIED` | "You're calling a legacy API, which is not enabled for your project. Switch to Routes API." |
| **Legacy Places API** (`/maps/api/place/autocomplete/json`) | 200 | `REQUEST_DENIED` | "You're calling a legacy API, which is not enabled for your project. Switch to Places API (New)." |
| **Geocoding API** (`/maps/api/geocode/json`) | 200 | `REQUEST_DENIED` | "This API is not activated on your API project." |

---

## 3. Implemented Capabilities & Architecture

To ensure the product is 100% functional and never breaks for passengers, a dual-layer architecture has been implemented:

1. **Google Maps Client Service (`src/services/googleMapsService.ts`):**
   - Automatically loads Google Maps JS SDK with `places` and `geometry` libraries.
   - Intercepts `gm_authFailure` and network states gracefully.
   - Provides `searchMumbaiPlaces()` connecting to `google.maps.places.AutocompleteService` with automatic fallback to curated Mumbai airport hubs and coordinates.
   - Provides `calculateRouteGeometry()` connecting to `google.maps.DirectionsService` with high-precision fallback to the Mumbai Arterial Corridor Engine.

2. **Interactive Google Map (`src/components/InteractiveMap.tsx`):**
   - Mounts an actual `google.maps.Map` on the DOM when the JS SDK initializes.
   - Renders custom markers for CSMIA Terminal 1 & 2 pickup hubs with floor and pillar instructions.
   - Renders destination markers and geodesic route polylines.
   - Allows interactive click-to-pin destination selection.
   - Provides browser geolocation integration (`LocateFixed` / "My Location") with permission handling and fallback.
   - Displays clear HUD status: `Google Maps Live`, `Connecting Maps...`, or `High-Precision Corridor View`.
   - Embeds actionable GCP Console enablement link and retry button when Google service is pending.

3. **Passenger Booking Integration (`src/views/PassengerBookView.tsx`):**
   - **Step 2 (Destination):** Features live interactive map preview, Google Places autocomplete search bar, instant pin-drop selection, and corridor distance/time recalculation.
   - **Step 5 (Review & Confirm):** Features an interactive route preview map displaying the exact pickup zone, route polyline, and drop-off destination prior to payment.

---

## 4. Exact Actions Needed in Google Cloud Console

To switch from the Arterial Corridor Engine to live Google Maps rendering, enable the following APIs in project `969747117874`:

1. **Maps JavaScript API:**  
   URL: `https://console.cloud.google.com/apis/library/maps-backend.googleapis.com?project=969747117874`  
   *Action:* Click **Enable**.

2. **Routes API:**  
   URL: `https://console.cloud.google.com/apis/library/routes.googleapis.com?project=969747117874`  
   *Action:* Click **Enable**.

3. **Places API (New):**  
   URL: `https://console.cloud.google.com/apis/library/places.googleapis.com?project=969747117874`  
   *Action:* Click **Enable**.

4. **API Key Restrictions Review:**  
   URL: `https://console.cloud.google.com/apis/credentials?project=969747117874`  
   *Action:* Verify that the API Key does not have "API restrictions" set to "Restrict key" that exclude Maps JavaScript API or Places API, and ensure "Website restrictions" includes `http://localhost:3000/*` and `http://127.0.0.1:3000/*` for local development.
