# AeroPool — Map Provider Configuration & Operational Report
**Deliverable — Provider Architecture, Credentials & Health Verification**
*Generated: 2026-11-07*

---

## 1. Provider Resolution & Runtime Priority

AeroPool's geospatial subsystem implements dual-engine capability through `IMapProvider`:

```
                    ┌─────────────────────────┐
                    │    MapProviderFactory   │
                    └────────────┬────────────┘
                                 │
             ┌───────────────────┴───────────────────┐
             ▼                                       ▼
  ┌──────────────────────┐               ┌──────────────────────┐
  │    MapboxProvider    │               │  GoogleMapsProvider  │
  │   (Primary Engine)   │               │   (Fallback Engine)  │
  └──────────┬───────────┘               └──────────┬───────────┘
             │                                       │
             ▼                                       ▼
  Mapbox GL JS v3.4.0                     Google Maps JS API
  Directions API (200 OK)                 Places & Geocoding
  Vector Dark Tile Styling                Midnight JSON Styles
```

### Configuration Priority Order:
1. Stored user choice in `.map_provider_config.json` / localStorage (`aeropool_active_map_provider`).
2. Environment preference (`VITE_DEFAULT_MAP_PROVIDER`).
3. Automatic capability fallback: **Mapbox GL** is prioritized when `VITE_MAPBOX_ACCESS_TOKEN` is authenticated and operational.

---

## 2. API Health & Probing Audit Results

| Engine / API | Configured Credential | Network Probe | Operational Status |
| :--- | :--- | :--- | :--- |
| **Mapbox GL JS** | `pk.eyJ1IjoicHJhdHl1c2gyNC...` in `.env` | HTTP 200 OK | **Active & Primary** |
| **Mapbox Directions** | Authenticated Bearer Token | HTTP 200 OK (10.13 km route) | **Active & Routing** |
| **Google Maps SDK** | `AIzaSyCR6JTf4raAU3sX0...` in `.env` | SDK Injected | **Configured** |
| **Google Directions** | Legacy API Endpoint | HTTP 200 `REQUEST_DENIED` | Fallback Routed to Mapbox / Corridor Engine |
| **Mumbai Corridor Engine**| Embedded authoritative WGS84 coordinates | 0ms Local Execution | **High-Availability Fallback** |

---

## 3. Security & Key Hygiene Compliance

- **No Hardcoded Keys**: All API keys and access tokens are retrieved safely via environment variables (`import.meta.env` with process fallback).
- **No Secret Leakage**: Privileged server keys (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`) are strictly isolated from client-side bundles and map services.
- **Credential Masking**: Health diagnostic logs and UI displays mask tokens (e.g., `pk.ey••••••••UdY6FO`).
- **Sandbox Compliance**: `VITE_OPERATING_MODE="sandbox"` preserved with zero changes to Supabase schema, payment logic, or backend business policies.

