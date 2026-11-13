# AeroPool — Network Diagnostic Report (New Laptop Migration)

**Audit Date:** 2026-11-08  
**Operating Environment:** Windows 11 / Node.js v22+  
**Project Workspace:** `Aeropool 1`  
**Operating Mode:** Sandbox (`VITE_OPERATING_MODE="sandbox"`)

---

## 1. Executive Summary

When the AeroPool project was moved to the new laptop, attempting to open the previous mobile access URL:
```
http://192.168.1.7:3000
```
failed immediately. 

**Root Cause Identified:**
1. **Dynamic IP Assignment Change:** On the previous laptop, the Wi-Fi router (SSID `Airtel_prem_0802`) had assigned IP address `192.168.1.7`. On this new laptop, DHCP assigned a different IPv4 address: **`192.168.1.9`**. IP `192.168.1.7` is no longer active or attached to this machine.
2. **Hardcoded Stale IP in Backend CORS:** `server/index.ts` had `http://192.168.1.7:3000` hardcoded in `ALLOWED_ORIGINS`. Any direct backend access or CORS preflight from the new IP `192.168.1.9` was not in the default allowlist.
3. **Firewall Scope:** The active Wi-Fi profile was categorized as `Public`. While an application rule existed for `node.exe` under Public, no dedicated port-specific inbound firewall rules existed for development TCP ports `3000` and `3001`.

---

## 2. Environment Diagnostics Matrix

| Diagnostic Check | Finding | Status |
|---|---|---|
| **Active Wi-Fi Interface** | `Wi-Fi` (Interface Index 4) | ✅ Active |
| **Active Laptop IPv4** | `192.168.1.9` | ✅ Verified |
| **Default Gateway / Subnet** | `192.168.1.1` / `255.255.255.0` (`/24`) | ✅ Verified |
| **Wi-Fi SSID** | `Airtel_prem_0802` | ✅ Connected |
| **Network Profile Category** | `Public` | ⚠️ Inbound restrictions apply |
| **Previous IP Ping (`192.168.1.7`)** | Non-responsive / Packet loss (100%) | ❌ Obsolete IP |
| **Frontend Binding** | Listening on `0.0.0.0:3000` | ✅ Available on LAN |
| **Frontend Port (3000)** | Occupied by Vite dev server (`vite --port=3000 --host=0.0.0.0`) | ✅ Active |
| **Backend Binding** | Listening on `0.0.0.0:3001` | ✅ Available on LAN |
| **Backend Port (3001)** | Occupied by Express server (`tsx server/index.ts`) | ✅ Active |
| **Frontend API Proxy** | Vite reverse proxy (`/api` -> `http://localhost:3001`) | ✅ Operational |
| **CORS Configuration** | Hardcoded `192.168.1.7:3000` detected in `server/index.ts` | ⚠️ Remediated to dynamic LAN discovery |
| **Supabase Remote Connectivity** | GoTrue Auth & 17 PostgreSQL tables responsive | ✅ Connected & Verified |
| **Windows Defender Firewall** | `Public: ON`, `Private: ON`; `node.exe` permitted | ℹ️ Dedicated port rules recommended |

---

## 3. Network Configuration Details

### 3.1 IP Address & Wi-Fi Profile
- **Active IPv4 Address:** `192.168.1.9`
- **Default Gateway:** `192.168.1.1`
- **DNS Servers:** Configured via DHCP (`192.168.1.1`)
- **Connection Profile Name:** `Airtel_prem_0802`
- **Network Category:** `Public`
- **ARP Neighborhood:** Router `192.168.1.1`, Local devices `192.168.1.2`, static multicasts.

### 3.2 Frontend Server Diagnostic (Port 3000)
- **Configuration File:** `vite.config.ts`
  ```typescript
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  }
  ```
- **Socket State:** `TCP 0.0.0.0:3000 LISTENING`
- **HTTP Response Verification:**
  - `http://localhost:3000`: `HTTP 200 OK`
  - `http://127.0.0.1:3000`: `HTTP 200 OK`
  - `http://192.168.1.9:3000`: `HTTP 200 OK`

### 3.3 Backend Server Diagnostic (Port 3001)
- **Configuration File:** `server/index.ts`
- **Binding:** `HOST = '0.0.0.0'`, `PORT = 3001`
- **Socket State:** `TCP 0.0.0.0:3001 LISTENING`
- **HTTP Response Verification:**
  - `http://localhost:3001/health`: `HTTP 200 OK` (`{"status":"HEALTHY","mode":"sandbox",...}`)
  - `http://192.168.1.9:3001/health`: `HTTP 200 OK`
  - `http://192.168.1.9:3000/api/health/readiness` (via Vite proxy): `HTTP 200 OK` (`{"status":"READY","mode":"sandbox",...}`)

### 3.4 API Routing & Architecture for Mobile Access
- Mobile clients load the Single Page Application from:
  ```
  http://192.168.1.9:3000
  ```
- `src/services/apiClient.ts` uses relative paths (`/api/...`).
- When the phone issues an API call (e.g. `/api/health/readiness`), the request goes to `http://192.168.1.9:3000/api/...`.
- The Vite development server on the laptop proxies the request to `http://localhost:3001/api/...` internally.
- This architectural design prevents mobile clients from trying to connect to `localhost:3001` (which on an Android phone would mistakenly loop back to the phone itself).

---

## 4. Hardcoded Stale References Audit

A scan of the repository revealed the following machine-specific entries:
1. **`server/index.ts` (Line 65):**
   ```typescript
   // OBSOLETE:
   : [FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.1.7:3000'];
   ```
   *Action:* Removed `192.168.1.7:3000`. Replaced with automated local LAN IP discovery via Node's `os.networkInterfaces()` and regex validation for local network origins.
2. **`src/tests/testSuite.ts` (Lines 2075-2076, 7839):**
   - Mock client IP addresses (`192.168.1.100`, `192.168.1.101`) in automated rate limiter unit tests. These are synthetic test fixtures and require no modification.
3. **`.env`:**
   - No hardcoded LAN IP addresses present. `VITE_APP_URL="http://localhost:3000"` and `PORT=3001` are safely configured.

---

## 5. Firewall & Routing Diagnostic

1. **Firewall State:**
   - Public Profile: Active and filtering.
   - Private Profile: Active and filtering.
2. **Current Rules:**
   - Inbound rule allows `node.exe` under Public profile.
3. **Recommendation for Robust LAN Access:**
   - Add explicit inbound TCP rules for ports `3000` and `3001` scoped to `LocalSubnet` to prevent intermittent firewall drops if network profile changes between Private and Public.

---

## 6. Next Steps & Target Mobile URL

The current, verified mobile entrypoint on the new laptop is:
```
http://192.168.1.9:3000
```
Proceed to `AEROPOOL_MOBILE_ACCESS_FIX_REPORT.md` for implementation details and verification results.

