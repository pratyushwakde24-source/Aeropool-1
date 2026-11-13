# AEROPOOL — Email DNS Configuration Guide
**For:** Supabase Custom SMTP via Resend  
**Staging Project:** `rkuzkwggijthbqwlwnps`  
**Prepared:** 2 November 2026  
**Status:** PENDING — DNS records must come from your verified Resend account

---

> [!IMPORTANT]
> **Do not publish any DNS records from this document until you have:**
> 1. Registered your AeroPool domain with a domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)
> 2. Created a Resend account at https://resend.com
> 3. Added your domain inside the Resend dashboard under "Domains"
> 4. Received the **exact DNS record values** from Resend for your specific domain
>
> The placeholder values below show the **structure** of what Resend will provide. Your actual cryptographic values will be different.

---

## 1. Domain Requirement

AeroPool needs a **verified sending domain** to send authentication emails. This must be a domain you own.

### Recommended domain structure:
```
Root domain:     aeropool.in  (or aeropool.app, aeropool.co.in, etc.)
Email subdomain: mail.aeropool.in   ← recommended for email isolation
Sender address:  noreply@mail.aeropool.in
```

### Why a subdomain for email?
Using `mail.aeropool.in` (not `aeropool.in`) isolates email authentication records and protects the root domain's reputation. If email deliverability has issues, only `mail.aeropool.in` is affected, not the website's root domain.

### If you do not yet own a domain:
Stop here. You cannot configure verified email delivery without a domain you control.  
**Domain registration:** Namecheap (~\$12/yr for `.in`) or Cloudflare (~\$10/yr).  
Once registered, return and follow the steps below.

---

## 2. Setting Up Resend

### Step 1 — Create account
1. Go to https://resend.com
2. Sign up with your email
3. Verify your Resend account email

### Step 2 — Add your sending domain
1. In Resend dashboard → **Domains** → **Add Domain**
2. Enter: `mail.yourdomain.com` (use your actual domain)
3. Select region: **US East** (default) or **EU** if GDPR compliance is required
4. Click **Add**

### Step 3 — Collect DNS records
Resend will display a set of DNS records to add to your domain. They will look like the following (your actual values will differ):

---

## 3. SPF Record

SPF (Sender Policy Framework) authorizes Resend's servers to send email on behalf of your domain.

### Record to add:

| Field | Value |
|---|---|
| **Type** | `TXT` |
| **Name / Host** | `mail` (for `mail.yourdomain.com`) |
| **Value** | `v=spf1 include:amazonses.com ~all` |
| **TTL** | `3600` (1 hour) |

> [!WARNING]
> **Do not create two SPF TXT records for the same hostname.** If `mail.yourdomain.com` already has a TXT record with an SPF entry, you must **merge** the Resend include mechanism into the existing record — not add a second record. Multiple SPF records for the same hostname cause SPF to permanently fail.

**Correct single SPF record (example merge):**
```
v=spf1 include:amazonses.com include:_spf.google.com ~all
```

**Incorrect (two separate TXT records — will break SPF):**
```
v=spf1 include:amazonses.com ~all
v=spf1 include:_spf.google.com ~all   ← WRONG
```

> [!NOTE]
> Resend uses Amazon SES infrastructure. The exact `include:` mechanism Resend specifies may differ. Always use the value shown in your Resend dashboard, not the example above.

---

## 4. DKIM Records

DKIM (DomainKeys Identified Mail) cryptographically signs outgoing emails, proving they have not been tampered with and that your domain authorized them.

Resend provides two DKIM CNAME records. The exact selectors and values are generated uniquely for your domain when you add it in Resend.

### Records to add (structure — actual values from Resend dashboard):

| Field | Record 1 | Record 2 |
|---|---|---|
| **Type** | `CNAME` | `CNAME` |
| **Name / Host** | `resend._domainkey.mail` | `resend2._domainkey.mail` |
| **Value** | `[PROVIDED BY RESEND]` | `[PROVIDED BY RESEND]` |
| **TTL** | `3600` | `3600` |

> [!NOTE]
> DKIM CNAME records point to Resend's signing infrastructure. Resend rotates these automatically, which is why CNAME (not TXT) is used. Never manually edit or truncate the CNAME target value.

### Verifying DKIM after adding records:
```bash
# Replace with your actual selector and domain:
dig CNAME resend._domainkey.mail.yourdomain.com
```
Expected: A CNAME pointing to `resend.yourdomain.com.dkim.amazonses.com` (or similar Resend target).

---

## 5. DMARC Record

DMARC (Domain-based Message Authentication, Reporting & Conformance) tells receiving mail servers what to do when SPF or DKIM fails, and where to send reports.

### Phase 1 — Monitoring policy (recommended initial configuration):

| Field | Value |
|---|---|
| **Type** | `TXT` |
| **Name / Host** | `_dmarc.mail` (for `mail.yourdomain.com`) |
| **Value** | `v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com; ruf=mailto:dmarc-reports@yourdomain.com; fo=1; adkim=r; aspf=r` |
| **TTL** | `3600` |

**Explanation of parameters:**

| Parameter | Value | Meaning |
|---|---|---|
| `p=none` | none | Monitoring only — do not reject or quarantine failing messages yet |
| `rua=` | your email | Aggregate DMARC reports sent here daily |
| `ruf=` | your email | Forensic failure reports (individual failures) |
| `fo=1` | 1 | Send forensic report if any authentication check fails |
| `adkim=r` | relaxed | DKIM domain alignment: subdomain matches are allowed |
| `aspf=r` | relaxed | SPF domain alignment: subdomain matches are allowed |

### Phase 2 — After 2 weeks of monitoring (upgrade):
Review aggregate reports from `rua` mailbox. When 100% of legitimate messages pass SPF and DKIM, upgrade to quarantine:
```
v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc-reports@yourdomain.com; fo=1; adkim=r; aspf=r
```

### Phase 3 — After 4 weeks (full enforcement):
```
v=DMARC1; p=reject; rua=mailto:dmarc-reports@yourdomain.com; fo=1; adkim=r; aspf=r
```

---

## 6. MX Record (Optional — only if receiving replies)

If you want replies to `noreply@mail.yourdomain.com` to bounce gracefully (standard practice), add:

| Field | Value |
|---|---|
| **Type** | `MX` |
| **Name / Host** | `mail` |
| **Value** | Your email provider's MX record (or omit if truly no-reply) |
| **Priority** | `10` |

If `noreply@mail.yourdomain.com` is intended to reject all inbound mail, you can omit MX or point it to a null MX:
```
mail.yourdomain.com.  IN MX  0  .
```

---

## 7. DNS Propagation Verification

After adding all records, verify propagation (usually 15 min to 4 hours, up to 48 hours for some registrars):

### Online tools:
- **MXToolbox SPF check:** https://mxtoolbox.com/spf.aspx
- **MXToolbox DKIM check:** https://mxtoolbox.com/dkim.aspx
- **DMARC analyzer:** https://dmarcian.com/dmarc-inspector/
- **Email deliverability test:** https://www.mail-tester.com

### Command-line verification:
```bash
# SPF:
dig TXT mail.yourdomain.com

# DKIM (replace selector with your actual selector from Resend):
dig CNAME resend._domainkey.mail.yourdomain.com

# DMARC:
dig TXT _dmarc.mail.yourdomain.com
```

### Resend domain verification:
In Resend Dashboard → Domains → your domain → click **Verify** after adding records.  
Status must show **Verified** (green) before proceeding to Supabase SMTP configuration.

---

## 8. Bounce and Complaint Handling

### Resend Suppression List
Resend automatically adds hard-bounced and complained-about addresses to a suppression list. Emails to suppressed addresses are silently dropped — they are never retried.

**Important:** If your test email addresses were previously sent to and bounced (e.g., `@aeropool.com` with no MX record), they will be in Resend's suppression list. Remove them manually:
- Resend Dashboard → Suppression → search for address → Remove

### Bounce Webhooks (Optional — implement after basic delivery works)
Resend can POST webhook events to your Express backend. Events:
- `email.sent`
- `email.delivered`
- `email.bounced`
- `email.complained`

**Webhook security:** Always verify the `Resend-Signature` header before processing. Keep webhook secret server-side only — never in a `VITE_` variable.

---

## 9. Summary Checklist

- [ ] Own a domain (register if not yet done)
- [ ] Create Resend account
- [ ] Add sending subdomain in Resend dashboard
- [ ] Collect exact DNS record values from Resend
- [ ] Add SPF TXT record (merge if existing record present)
- [ ] Add DKIM CNAME records (both records)
- [ ] Add DMARC TXT record (p=none initially)
- [ ] Wait for DNS propagation
- [ ] Verify domain in Resend dashboard (green status)
- [ ] Run MXToolbox / mail-tester.com check
- [ ] Proceed to Supabase SMTP configuration (next document)

