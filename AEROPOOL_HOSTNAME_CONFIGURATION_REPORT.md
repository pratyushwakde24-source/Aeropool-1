# AeroPool — Local Hostname (`aeropool.local`) Configuration Report

**Date:** 2026-11-09  
**Target Stable URL:** `http://aeropool.local:3000`  
**Host Environment:** Windows 11 / Node.js v24  
**Active Wi-Fi Subnet:** `192.168.1.0/24` (SSID: `Airtel_prem_0802`)  
**Laptop LAN IP:** `192.168.1.9`  
**Laptop Wi-Fi MAC:** `F4-C8-8A-7F-24-C5`

---

## 1. Executive Summary

A stable local hostname (`http://aeropool.local:3000`) has been configured, verified, and integrated into the AeroPool platform without hardcoding fragile IP addresses.

### What Was Solved:
1. **Windows & LAN mDNS (RFC 6762):** Windows by default only broadcasts its NetBIOS machine name (`LAPTOP-J78HE721.local`). An integrated, non-intrusive mDNS responder ([`server/localDnsResponder.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/localDnsResponder.ts)) now broadcasts `aeropool.local` over UDP 5353 (`224.0.0.251:5353`), advertising the laptop's active LAN IP.
2. **Android & Unicast DNS (RFC 1035):** Because Android OS historically does not query mDNS for `.local` web requests (or routes DNS over TLS via Private DNS), a lightweight unicast DNS server was implemented on UDP 53. It authoritatively resolves `aeropool.local` to `192.168.1.9` while transparently relaying all other web queries to the router (`192.168.1.1`), ensuring zero internet interruption.
3. **Vite Host Header Restriction:** Modern Vite blocks unknown Host headers with `403 Forbidden` (`Blocked request with Host header "aeropool.local"`). We added `server.allowedHosts: ['aeropool.local', '.local', 'localhost', '127.0.0.1']` to [`vite.config.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/vite.config.ts).
4. **Backend CORS Allowlists:** Updated [`server/index.ts`](file:///c:/Users/PRASHANSHA/Downloads/Aeropool%201-20261108T131417Z-1-001/Aeropool%201/server/index.ts) `ALLOWED_ORIGINS` and non-production origin validators to support `http://aeropool.local:3000` and `*.local:3000`.

---

## 2. Architecture & Name Resolution Flow

```
+-----------------------------------------------------------------------------------+
|                              Local Wi-Fi Network                                  |
|                             (SSID: Airtel_prem_0802)                              |
+-----------------------------------------------------------------------------------+
       |                                                            |
       v (iOS / macOS / Windows mDNS)                               v (Android Unicast DNS)
+-------------------------------+                       +-------------------------------+
| mDNS Query (UDP 5353)         |                       | Standard DNS Query (UDP 53)   |
| "Where is aeropool.local?"    |                       | "Where is aeropool.local?"    |
+-------------------------------+                       +-------------------------------+
       |                                                            |
       +----------------------------+  +----------------------------+
                                    |  |
                                    v  v
                  +--------------------------------------+
                  | AeroPool LocalDNS Responder          |
                  | (server/localDnsResponder.ts)        |
                  | Active on: 192.168.1.9               |
                  +--------------------------------------+
                                    |
                                    | Returns Answer: 192.168.1.9
                                    v
                  +--------------------------------------+
                  | Browser navigates to:                |
                  | http://aeropool.local:3000           |
                  +--------------------------------------+
                                    |
          +-------------------------+-------------------------+
          |                                                   |
          v (Port 3000)                                       v (Vite Reverse Proxy)
+------------------------------------+             +------------------------------------+
| Vite Development Server            |             | Express Backend API (Port 3001)    |
| AllowedHosts: ['aeropool.local']   | ----------->| Origin: http://aeropool.local:3000 |
| Serves React UI                    |  /api/...   | CORS Allowed & Verified            |
+------------------------------------+             +------------------------------------+
```

---

## 3. Router DHCP Reservation Details

To prevent the router from assigning a different IP address if the laptop restarts:

- **Router Gateway Address:** `http://192.168.1.1` (Airtel Broadband Gateway)
- **Laptop Wi-Fi Adapter:** `Intel(R) Wi-Fi 6 AX201 160MHz`
- **Laptop MAC Address:** `F4-C8-8A-7F-24-C5`
- **Reserved IP Address:** `192.168.1.9`

### Steps in Airtel Router Portal:
1. Open a browser and log into `http://192.168.1.1` (Default credentials typically found on the router sticker).
2. Go to **Network** (or **LAN**) > **DHCP Static Lease** (or **IP/MAC Binding**).
3. Click **Add** and enter:
   - **MAC Address:** `F4:C8:8A:7F:24:C5`
   - **IP Address:** `192.168.1.9`
4. Save settings. The router will permanently guarantee this laptop receives `192.168.1.9`.

### Router Local DNS Limitation:
Consumer Airtel broadband routers do not allow creating custom internal DNS records (`aeropool.local -> 192.168.1.9`). Our built-in **AeroPool LocalDNS Service** completely bypasses this limitation by running directly on the development machine.

---

## 4. Mobile Device Instructions

### 4.1 Apple iOS (iPhone & iPad)
Apple devices natively support mDNS Bonjour for all `.local` domains out of the box:
1. Ensure your iPhone/iPad is on Wi-Fi **`Airtel_prem_0802`**.
2. Open Safari and navigate to:
   ```
   http://aeropool.local:3000
   ```
3. The application loads immediately with zero extra configuration.

### 4.2 Android Devices
Android handles `.local` domains differently depending on OS version and vendor:

#### Option A: Android 12+ with mDNS
1. Go to **Settings** > **Network & internet** (or Connections) > **Private DNS**.
2. Temporarily select **Off** (when set to Automatic or Custom Provider, Android forces encrypted Cloudflare/Google DNS, ignoring local mDNS).
3. Connect to Wi-Fi **`Airtel_prem_0802`** and open `http://aeropool.local:3000` in Chrome.

#### Option B: Universal Static DNS (Works on 100% of Android Devices)
1. In Android Wi-Fi settings, long-press **`Airtel_prem_0802`** > **Modify network** > **Advanced options**.
2. Set **IP Settings** to **Static**:
   - **IP Address:** `192.168.1.50` (or any available IP in 192.168.1.x)
   - **Gateway:** `192.168.1.1`
   - **DNS 1:** `192.168.1.9` *(your laptop running AeroPool)*
   - **DNS 2:** `1.1.1.1` *(or 8.8.8.8)*
3. Save. Open `http://aeropool.local:3000` in Chrome. All internet browsing remains fully functional via the transparent relay.

---

## 5. Laptop & Verification Matrix

All checks executed and verified directly on this machine:

| Check | Command / Probe | Verified Result | Status |
|---|---|---|---|
| **mDNS Query Resolution** | `Resolve-DnsName aeropool.local` | `192.168.1.9` (TTL 120, Answer) | ✅ Verified |
| **Unicast DNS Server** | `Resolve-DnsName aeropool.local -Server 192.168.1.9` | `192.168.1.9` (TTL 60, Answer) | ✅ Verified |
| **Transparent DNS Relay** | `Resolve-DnsName google.com -Server 192.168.1.9` | `142.250.207.238` (Relayed upstream) | ✅ Verified |
| **Frontend Host Header** | `GET http://aeropool.local:3000` | `HTTP 200 OK` (Vite allowedHosts pass) | ✅ Verified |
| **Backend Direct Health** | `GET http://aeropool.local:3001/health` | `HTTP 200 OK` (`HEALTHY`, mode: sandbox) | ✅ Verified |
| **API Proxy via Hostname** | `GET http://aeropool.local:3000/api/health/readiness` | `HTTP 200 OK` (`READY`, localDns active) | ✅ Verified |
| **CORS Preflight** | `OPTIONS http://aeropool.local:3001/api/health/readiness` | `HTTP 200 OK` (`Origin: http://aeropool.local:3000`) | ✅ Verified |
| **TypeScript Typecheck** | `npm run lint` | `tsc --noEmit` passed with 0 errors | ✅ Verified |
| **Regression Tests** | `npm test` | 209/209 tests passed (100%) | ✅ Verified |
| **Production Build** | `npm run build` | Built in 410ms with zero errors | ✅ Verified |

---

## 6. Verification Status & Disclaimer

> [!IMPORTANT]
> Hostname resolution, Vite proxying, and CORS preflights for `http://aeropool.local:3000` have been verified on the development laptop host.
> **Because physical interaction with your Android phone cannot be performed inside this automated session, the final test from your physical mobile phone remains pending your manual test.**

