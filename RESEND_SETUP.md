# Email OTP verification with Resend – step by step

CourseCompass keeps **Supabase Auth** for everything (sign-up, login, roles, coordinator
approval, password reset). The only change is *how the verification email is delivered and
what it contains*:

```
Sign up form ──► supabase.auth.signUp()  ──► Supabase creates the user (unverified)
                                          └─► Supabase sends the "Confirm signup" email
                                              THROUGH RESEND (custom SMTP) with a 6-digit code
Code screen  ──► supabase.auth.verifyOtp({ email, token, type: 'signup' })  ──► user is verified + logged in
Resend code  ──► supabase.auth.resend({ type: 'signup', email })
```

**Why SMTP and not the Resend API from the browser?** A Resend API key in React code
(`VITE_…`) is visible to everyone and could be used to send mail as you. With SMTP the key
lives only inside Supabase's server settings. No backend code is needed.

---

## Step 1 – Create a Resend account
1. Go to <https://resend.com> and sign up.
2. (Testing only) Without a domain you can send only from `onboarding@resend.dev`
   and only **to the email you registered with**. Real users need Step 2.

## Step 2 – Add and verify your sending domain
1. Resend dashboard → **Domains → Add Domain** → enter e.g. `yourcollegeapp.com`
   (a sub-domain such as `mail.yourcollegeapp.com` is fine and recommended).
2. Resend shows DNS records (SPF `TXT`, DKIM `TXT`, and an `MX` for the bounce path).
   Add them exactly at your domain registrar / DNS host (GoDaddy, Cloudflare, Namecheap…).
3. Click **Verify**. It can take a few minutes up to a few hours. Wait until the status is **Verified**.

## Step 3 – Create an API key
1. Resend → **API Keys → Create API Key**.
2. Permission: **Sending access**; Domain: the one you verified.
3. Copy the key (starts with `re_`). You can see it only once.

## Step 4 – Tell Supabase to send mail through Resend
Supabase Dashboard → your project → **Authentication → Emails → SMTP Settings**
(older dashboards: *Project Settings → Authentication → SMTP Settings*).

| Field | Value |
|---|---|
| Enable custom SMTP | **ON** |
| Sender email | `no-reply@yourcollegeapp.com` (must be on the verified domain) |
| Sender name | `CourseCompass` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key (`re_…`) |

Save.

## Step 5 – Change the "Confirm signup" email to show the code
Supabase → **Authentication → Emails → Templates → Confirm sign up**

Subject: `Your CourseCompass verification code`

Body (HTML) – the important part is `{{ .Token }}`; do **not** keep `{{ .ConfirmationURL }}`:

```html
<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:28px;border:1px solid #e6e3f5;border-radius:16px">
  <h2 style="margin:0 0 8px;color:#4c1d95">Verify your email</h2>
  <p style="color:#475569">Use this code to finish creating your CourseCompass account:</p>
  <p style="font-size:34px;letter-spacing:10px;font-weight:800;color:#1e1b4b;background:#f3efff;padding:16px;text-align:center;border-radius:12px">
    {{ .Token }}
  </p>
  <p style="color:#64748b;font-size:13px">The code expires soon. If you did not sign up, ignore this email.</p>
</div>
```

## Step 6 – Check the email provider settings
Supabase → **Authentication → Sign In / Providers → Email**
* **Confirm email** → **ON** (this is what makes sign-up wait for the code)
* **Email OTP Length** → `6` (the app expects 6 boxes; if you change it, change `OTP_LENGTH` in `src/Auth.jsx`)
* **Email OTP Expiration** → e.g. `600` seconds (10 minutes) is a good value

Supabase → **Authentication → Rate Limits** → raise *emails sent per hour* if you expect many sign-ups
(custom SMTP starts low). Supabase also allows only **one code per 60 s per address** – the
"Resend code" button shows that countdown.

## Step 7 – Database scripts
Supabase → **SQL Editor** → run, in order:
1. `supabase/001_coordinator_workflow.sql` (if you have not already)
2. `supabase/002_cutoffs_editing.sql` (new – lets coordinators edit cutoffs through admin approval)

## Step 8 – Run and test
```bash
npm install
npm run dev
```
1. Click **Get Started → Create account**, fill the form, submit.
2. The **Enter your code** screen opens; the email arrives from Resend within seconds.
3. Type / paste the 6 digits → you are verified and logged in
   (students go to the dashboard, coordinators to "waiting for admin approval").
4. Test **Resend code** after the 60 s countdown.
5. Test an unverified account: sign up, close the window, then log in → a new code is sent automatically.

## Troubleshooting
| Problem | Fix |
|---|---|
| No email arrives | Check Resend → **Logs**. Check spam. Confirm domain is *Verified* and sender email uses that domain. |
| Email contains a link, not a code | Step 5 not saved – the template must contain `{{ .Token }}`. |
| "Email rate limit exceeded" | Wait 60 s, or raise limits (Step 6). |
| "Token has expired or is invalid" | Use the newest email only; each resend invalidates the older code. |
| `535 Authentication failed` in Supabase | Username must be exactly `resend`; password is the API key. |
| Supabase says "Error sending confirmation email" | Sender email domain not verified in Resend. |
| Password-reset still sends a link | Intended – only sign-up verification was changed. |
