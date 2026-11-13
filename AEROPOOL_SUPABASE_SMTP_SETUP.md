# AEROPOOL — Supabase Custom SMTP Setup Guide
**Project:** `rkuzkwggijthbqwlwnps` (aeropool-staging)  
**Provider:** Resend  
**Prepared:** 2 November 2026  
**Status:** PENDING YOUR APPROVAL — Do not apply until Resend domain is verified

---

> [!CAUTION]
> **Prerequisites before touching Supabase SMTP settings:**
> 1. Resend account created ✓
> 2. Sending domain added to Resend ✓
> 3. All DNS records (SPF, DKIM, DMARC) added to your DNS ✓
> 4. Domain status in Resend dashboard shows **Verified** (green) ✓
> 5. Resend API key generated ✓
>
> If any prerequisite is incomplete, stop. Configuring SMTP with an unverified domain will cause all emails to fail or bounce.

---

## 1. Security Rules for SMTP Credentials

These rules are **non-negotiable** and must be followed:

| Rule | Detail |
|---|---|
| SMTP password = Resend API key | This is a secret — treat it like a database password |
| Never in `VITE_` variables | Any `VITE_` variable is bundled into the browser JavaScript bundle and is publicly readable |
| Never in frontend source code | Not in `authService.ts`, `supabaseClient.ts`, or any file in `src/` |
| Never in git commits | Add to `.gitignore` if stored in local `.env.smtp` file |
| Only in Supabase Dashboard | Supabase stores SMTP credentials server-side in their encrypted secrets vault |
| Resend API key scope | Create a **domain-scoped** key in Resend, not a full-access key |

---

## 2. Resend API Key Creation

Before configuring Supabase, generate a Resend API key:

1. Log into https://resend.com
2. Navigate to **API Keys** → **Create API Key**
3. Name: `aeropool-staging-supabase-smtp`
4. Permission: **Sending access only** (do not grant full access)
5. Domain restriction: Select your verified domain only
6. Copy the key immediately — it is shown only once

**Format:** `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

> [!IMPORTANT]
> Keep this key private. If it is ever exposed, revoke it immediately in the Resend dashboard and generate a new one.

---

## 3. Supabase SMTP Configuration

### Access the settings:
```
https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/settings/auth
```

Scroll to the **SMTP Settings** section.

### Toggle: Enable Custom SMTP → **ON**

### Configuration values:

| Field | Value | Notes |
|---|---|---|
| **SMTP Host** | `smtp.resend.com` | Resend's SMTP endpoint |
| **SMTP Port** | `465` | TLS (SSL). Alternative: `587` (STARTTLS) |
| **SMTP Username** | `resend` | This is literally the string "resend" for all Resend accounts |
| **SMTP Password** | `re_xxxx...` | Your Resend API key (from Step 2 above) |
| **Sender Email** | `noreply@mail.yourdomain.com` | Must match your verified Resend domain |
| **Sender Name** | `AeroPool` | Displayed in the "From:" field in email clients |

> [!NOTE]
> Port `465` with implicit TLS is preferred. Port `587` with STARTTLS also works. Do not use port `25` — it is blocked by most cloud providers including Supabase.

### After saving:
1. Click **Save** in the Supabase dashboard
2. Scroll down and use the **Test SMTP Settings** button (if available) to send a test email to your own address
3. Check that the test email arrives in your inbox (not spam)
4. Check the Resend dashboard → **Emails** tab to confirm it was accepted and delivered

---

## 4. URL Configuration

Still in Auth settings (`/settings/auth`), scroll to **URL Configuration**:

### Site URL:
```
https://[your-staging-domain.vercel.app]  ← replace with your actual deployed URL
```

For local-only testing:
```
http://localhost:3000
```

> [!WARNING]
> Setting Site URL to `http://localhost:3000` means verification links in emails will point to localhost. This works only when both the sender and recipient are using the same local machine. For real user testing, this must be the HTTPS staging URL.

### Redirect Allow List:
Add all URLs that Supabase is allowed to redirect to after email confirmation:

```
http://localhost:3000
http://localhost:3000/**
https://[your-staging-domain.vercel.app]
https://[your-staging-domain.vercel.app]/**
```

> [!IMPORTANT]
> Do not add `https://*` or other broad wildcards. Supabase's own documentation warns that overly permissive redirect lists create open-redirect vulnerabilities.

---

## 5. Email Template Configuration

Access email templates at:
```
https://supabase.com/dashboard/project/rkuzkwggijthbqwlwnps/auth/templates
```

### Confirmation Email Template
Replace the default template with the AeroPool-branded version:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirm your AeroPool email</title>
</head>
<body style="margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#020617;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #1e293b;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background:linear-gradient(135deg,#2563eb,#38bdf8);border-radius:10px;width:40px;height:40px;line-height:40px;text-align:center;vertical-align:middle;">
                      <span style="color:#ffffff;font-size:20px;">✈</span>
                    </div>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <div style="color:#38bdf8;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">AeroPool</div>
                    <div style="color:#94a3b8;font-size:11px;">Mumbai CSMIA Airport Ride-Pooling</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;color:#f1f5f9;font-size:20px;font-weight:700;line-height:1.3;">Confirm your email address</h1>
              <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.6;">
                Welcome to AeroPool! Click the button below to verify your email address and activate your account.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#2563eb,#0ea5e9);border-radius:10px;padding:0;">
                    <a href="{{ .ConfirmationURL }}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Fallback URL -->
              <div style="padding:16px;background-color:#020617;border:1px solid #1e293b;border-radius:10px;margin-bottom:24px;">
                <p style="margin:0 0 8px;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Or copy this link into your browser:</p>
                <p style="margin:0;color:#38bdf8;font-size:11px;word-break:break-all;font-family:'Courier New',monospace;">{{ .ConfirmationURL }}</p>
              </div>
              <!-- Security Notice -->
              <div style="padding:14px;background-color:#0c1a36;border:1px solid #1e3a5f;border-radius:10px;">
                <p style="margin:0;color:#93c5fd;font-size:12px;line-height:1.5;">
                  🔒 This link expires in 24 hours. If you did not create an AeroPool account, you can safely ignore this email.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #1e293b;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">
                AeroPool · Mumbai CSMIA Airport · India
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Password Reset Email Template
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your AeroPool password</title>
</head>
<body style="margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#020617;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #1e293b;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background:linear-gradient(135deg,#2563eb,#38bdf8);border-radius:10px;width:40px;height:40px;line-height:40px;text-align:center;">
                      <span style="color:#ffffff;font-size:20px;">🔐</span>
                    </div>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <div style="color:#38bdf8;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">AeroPool</div>
                    <div style="color:#94a3b8;font-size:11px;">Password Reset Request</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;color:#f1f5f9;font-size:20px;font-weight:700;">Reset your password</h1>
              <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.6;">
                We received a request to reset your AeroPool account password. Click the button below to choose a new password.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#2563eb,#0ea5e9);border-radius:10px;">
                    <a href="{{ .ConfirmationURL }}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <div style="padding:16px;background-color:#020617;border:1px solid #1e293b;border-radius:10px;margin-bottom:24px;">
                <p style="margin:0 0 8px;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Or copy this link:</p>
                <p style="margin:0;color:#38bdf8;font-size:11px;word-break:break-all;font-family:'Courier New',monospace;">{{ .ConfirmationURL }}</p>
              </div>
              <div style="padding:14px;background-color:#2d1a0e;border:1px solid #92400e;border-radius:10px;">
                <p style="margin:0;color:#fbbf24;font-size:12px;line-height:1.5;">
                  ⚠️ This link expires in 1 hour. If you did not request a password reset, please ignore this email — your account is secure.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #1e293b;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">AeroPool · Mumbai CSMIA Airport · India</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Template Variables Reference
| Variable | Description |
|---|---|
| `{{ .ConfirmationURL }}` | The full verification / reset URL with token |
| `{{ .Email }}` | The recipient's email address |
| `{{ .SiteURL }}` | Your configured Site URL |

> [!WARNING]
> Never hardcode a verification URL. Only use Supabase template variables (`{{ .ConfirmationURL }}`). A hardcoded URL will not contain the user-specific token and will not work.

---

## 6. Rate Limit Review

After configuring custom SMTP, inspect and set appropriate rate limits:

**Location:** Auth Settings → Rate Limits

| Setting | Recommended Value | Reason |
|---|---|---|
| Email rate limit | `10 per hour` | Prevents abuse while allowing legitimate use |
| Signup rate limit | `5 per hour per IP` | Prevents bot signups |
| SMS rate limit | N/A | Not used |

Note: With custom SMTP, the 3–4 emails/hr Supabase shared mailer cap is removed. Rate limits now apply based on Resend account quota (3,000/month on free tier).

---

## 7. Verification Checklist

After completing Supabase SMTP setup:

- [ ] Test email from Supabase dashboard SMTP test button succeeds
- [ ] Email arrives in test inbox (not spam) within 60 seconds
- [ ] From: shows `AeroPool <noreply@mail.yourdomain.com>`
- [ ] Resend dashboard shows email as **Delivered** (not just Accepted)
- [ ] SPF pass confirmed via email headers (`Received-SPF: pass`)
- [ ] DKIM pass confirmed via email headers (`DKIM-Signature` present, verified)
- [ ] DMARC pass confirmed via email headers
- [ ] Verification link in email points to correct staging URL
- [ ] Clicking verification link completes email confirmation in AeroPool
- [ ] Password reset email arrives and link works
- [ ] Resend verification (from app) delivers email and link works

