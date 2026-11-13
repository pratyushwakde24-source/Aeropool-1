# AeroPool — Supabase Staging Link Diagnostic & Repair Report

**Date:** October 24, 2026  
**Auditor / DevOps Engineer:** Antigravity AI  
**Scope:** Diagnosis and Resolution of Supabase CLI Staging Project Linking Error  
**Repository Working Directory:** `C:\Users\praty\Aeropool 1`  
**Target Staging Project:** `aeropool-staging`  
**Correct Staging Reference:** `rkuzkwggijthbqwlwnps` (Region: `ap-southeast-1`)  
**Protected Production Reference:** `krxkxhieyqcytknixqdm`  

---

## 1. Executive Summary & Root Cause Analysis

### Identified Root Cause
The command `npx supabase link --project-ref rkuzkwggjithbqwlwnps` failed with HTTP 404:
```
Authorization failed for the access token and project ref pair: {"message":"Not Found"}
```

**Root Cause:** **Typographical Character Transposition in Project Reference Parameter.**
- In the initial link command, the project reference was passed as:  
  `rkuzkwgg` + **`jith`** + `bqwlwnps`
- The genuine project reference retrieved directly from the official Supabase Management API via `npx supabase projects list` is:  
  `rkuzkwgg` + **`ijth`** + `bqwlwnps`
- Because the reference was mistyped by transposing the 9th and 10th characters (`jith` instead of `ijth`), the Supabase API looked for a project that did not exist under the authenticated user's organization and returned `{"message":"Not Found"}`.

### Repair Result
- After identifying the exact project reference from `npx supabase projects list`, the safe command was executed:
  ```bash
  npx supabase link --project-ref rkuzkwggijthbqwlwnps
  ```
- **Result:** **SUCCESS** (`Exit Code: 0`)
  ```json
  {"project_ref":"rkuzkwggijthbqwlwnps","message":""}
  ```
- **Verification:**  
  Running `Get-Content supabase/.temp/project-ref` confirmed that the cached reference equals **`rkuzkwggijthbqwlwnps`**.
- **Database Safety Assertion:**  
  **No database writes, schema modifications, or migrations (`supabase db push`) were executed.** Both the staging and production databases remain completely unmodified.

---

## 2. Diagnostic Checks Performed

| Step | Diagnostic Check | Command Executed | Result / Finding | Secrets Safeguard |
|:---:|---|---|---|:---:|
| **1** | Installed Supabase CLI Version | `npx supabase --version` | `v2.121.0` (Latest upstream `v2.122.0`). Compatible with PostgreSQL 15/17. | No credentials exposed |
| **2** | Working Directory Integrity | `pwd` / Path validation | Confirmed `C:\Users\praty\Aeropool 1`. | Safe |
| **3** | Account Access & Organization Probe | `npx supabase projects list` | Authenticated account (`cli_praty@user_*`) has access to 9 projects across 2 organizations. Specifically retrieved: `aeropool-staging` (`rkuzkwggijthbqwlwnps`, `ACTIVE_HEALTHY`, `ap-southeast-1`, Org: `aaarowzyxaifrhsqjtbz`). | Token not displayed |
| **4** | Parameter Comparison | Character-by-character diff | Identified `jith` vs `ijth` transposition in user-supplied reference. | Safe |
| **5** | Service Outage Check | Supabase API query status | API returned valid project payload with `ACTIVE_HEALTHY` status; no platform outage blocking linking. | Safe |
| **6** | Safe Single Retry | `npx supabase link --project-ref rkuzkwggijthbqwlwnps` | Exited 0 with JSON confirmation. | Safe |
| **7** | Local Cache State Verification | `Get-Content supabase/.temp/project-ref` | Returns `rkuzkwggijthbqwlwnps`. Overwrote previous reference `krxkxhieyqcytknixqdm`. | Safe |

---

## 3. Non-Sensitive Command Outputs

### Check 1: Supabase CLI Version
```
2.121.0
A new version of Supabase CLI is available: v2.122.0 (currently installed v2.121.0)
```

### Check 2: Supabase Project Listing (Filtered)
```json
{
  "id": "rkuzkwggijthbqwlwnps",
  "ref": "rkuzkwggijthbqwlwnps",
  "organization_id": "aaarowzyxaifrhsqjtbz",
  "organization_slug": "aaarowzyxaifrhsqjtbz",
  "name": "aeropool-staging",
  "region": "ap-southeast-1",
  "status": "ACTIVE_HEALTHY",
  "database": {
    "host": "db.rkuzkwggijthbqwlwnps.supabase.co",
    "version": "17.11.0.003",
    "postgres_engine": "17",
    "release_channel": "ga"
  },
  "linked": false
}
```

### Check 3: Staging Link Execution
```
$ npx supabase link --project-ref rkuzkwggijthbqwlwnps
{"project_ref":"rkuzkwggijthbqwlwnps","message":""}
```

### Check 4: Local Cache Verification
```powershell
PS C:\Users\praty\Aeropool 1> Get-Content supabase/.temp/project-ref
rkuzkwggijthbqwlwnps
```

---

## 4. Local Files Changed

1. **[`supabase/.temp/project-ref`](file:///c:/Users/praty/Aeropool%201/supabase/.temp/project-ref)**:
   - Updated from previous cached reference `krxkxhieyqcytknixqdm` to **`rkuzkwggijthbqwlwnps`**.
2. **[`supabase/.temp/linked-project.json`](file:///c:/Users/praty/Aeropool%201/supabase/.temp/linked-project.json)**:
   - Updated by the CLI with metadata for `aeropool-staging` (`rkuzkwggijthbqwlwnps`).
3. **[`.env.staging.example`](file:///c:/Users/praty/Aeropool%201/.env.staging.example)**:
   - Corrected project reference URL to `https://rkuzkwggijthbqwlwnps.supabase.co` and database host to `db.rkuzkwggijthbqwlwnps.supabase.co`.
4. **[`AEROPOOL_STAGING_RUNBOOK.md`](file:///c:/Users/praty/Aeropool%201/AEROPOOL_STAGING_RUNBOOK.md)**:
   - Updated all commands and pre-flight assertions to reference `rkuzkwggijthbqwlwnps`.
5. **[`.env`](file:///c:/Users/praty/Aeropool%201/.env)**:
   - **NOT MODIFIED.** Preserved in original state.

---

## 5. Verification Status

| Checkpoint | Status |
|---|:---:|
| **Staging Project Link** | ✅ **SUCCESSFUL** (`rkuzkwggijthbqwlwnps`) |
| **Local Cache Updated** | ✅ **VERIFIED** (`supabase/.temp/project-ref` matches) |
| **Production Project Isolated** | ✅ **VERIFIED** (`krxkxhieyqcytknixqdm` unlinked) |
| **Remote Database State** | ✅ **UNMODIFIED** (Zero SQL executed) |
| **Secrets Protection** | ✅ **COMPLIANT** (Zero secrets printed or committed) |

---

## 6. Exact Next Manual Actions for You (The User)

The local repository is now correctly linked to `aeropool-staging`. Before pushing any database migrations:

### Step 1: Run Pre-Flight Dry Run
Inspect the pending SQL schema differences against the newly linked staging database:
```bash
npx supabase db diff
```

### Step 2: Push Migrations 1–7 to Staging
When you are ready to apply the schema to `aeropool-staging`:
```bash
npx supabase db push
```

### Step 3: Verify Staging Database Schema
```bash
npm run verify:db
```

*Report certified by Antigravity AI — October 24, 2026.*
