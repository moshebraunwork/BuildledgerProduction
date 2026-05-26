# BuildLedger — Setup & Deployment Guide

A production construction-management app: jobs, crew & live time tracking, inventory, billing, and emailed invoices. Built with Next.js (App Router) + TypeScript, Supabase (Postgres + Auth), shadcn/ui, and Resend.

This guide takes you from zip to a live, hosted app. Budget about 20–30 minutes the first time.

---

## What you'll need (free tiers are fine)

1. **Node.js 18.17+** (Node 20 or 22 recommended) — https://nodejs.org
2. **A Supabase account** — https://supabase.com (database + auth)
3. **A Resend account** — https://resend.com (sends OTP + invoice emails)
4. **A Vercel account** — https://vercel.com (hosting) — optional; you can host anywhere that runs Next.js

---

## Step 1 — Install and run locally

```bash
cd buildledger
npm install
cp .env.example .env.local   # then fill in the values (Step 3)
npm run dev
```

Open http://localhost:3000. It will redirect to `/login` (nothing works until you finish the env + database steps below).

---

## Step 2 — Create the Supabase project & database

1. In Supabase, click **New project**. Pick a name and a strong database password. Wait ~2 min for it to provision.
2. Go to **SQL Editor** → **New query**. Open the files in `supabase/migrations/` from this project **in order** and run each one:
   - `0001_init.sql` — all tables, row-level security, the permissions model
   - `0002_seed.sql` — the company, the built-in **Administrator** role, and a little sample data
   - `0003_punch_photos.sql` — punch notes/photos + the storage bucket for photos
   Paste each file's contents, click **Run**, confirm "Success". Do them one at a time, in number order.
3. **Enable multi-factor auth (the authenticator app step):**
   Go to **Authentication → Providers / Sign In** settings and make sure **Email** is enabled. Then under **Authentication → Multi-Factor**, enable **TOTP (Authenticator app)**.
   > Note: Supabase's free plan supports TOTP enrollment. Enforcing MFA across all users / advanced MFA policies may require their Pro plan — but the app's own login flow already requires every user to set up an authenticator, so you get 2FA regardless.

---

## Step 3 — Fill in your environment variables

In Supabase, go to **Project Settings → API**. Copy these into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...        # "Project URL"
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # "anon / public" key
SUPABASE_SERVICE_ROLE_KEY=...       # "service_role" key — KEEP SECRET, server-only
```

From Resend (**API Keys**):
```
RESEND_API_KEY=re_...
INVOICE_FROM_EMAIL=invoices@yourdomain.com   # must be on a domain you verify in Resend
```

And set your own email as the built-in super-admin (this account always has full access and can never be locked out):
```
SUPPORT_ADMIN_EMAIL=you@yourdomain.com
```

> **Resend domain note:** to send to real customers, verify your sending domain in Resend (**Domains → Add Domain**, then add the DNS records). Until then, Resend only lets you send test emails to your own verified address.

---

## Step 4 — First login (becoming the admin)

1. With `.env.local` filled in, restart `npm run dev`.
2. Go to `/login`, enter the **same email** you set as `SUPPORT_ADMIN_EMAIL`.
3. You'll get a 6-digit code by email — enter it.
4. Because there's no authenticator on your account yet, you'll be sent to set one up: scan the QR with Google Authenticator (or any TOTP app) and enter the code.
5. You're in — as the super-admin with every permission.

**How everyone else gets access:** when a new person signs in for the first time, their account is created **inactive** with no role. You (admin) go to **Admin → Users**, give them a role, and flip them **Active**. Nobody can get in by self-signup alone — you control the gate.

---

## Step 5 — Set up roles (the permissions system)

Go to **Admin → Roles**. There's a built-in **Administrator** role (can't be deleted). Click **New role** to create your own — name it (e.g. "Office", "Foreman") and tick exactly which permissions it gets. Then assign people to roles in **Admin → Users**. Permissions cover every module: jobs, inventory, workers, invoices, time tracking, admin, and the activity log.

---

## Step 6 — Deploy to Vercel

1. Push this project to a GitHub repo.
2. In Vercel: **Add New → Project**, import the repo.
3. Under **Environment Variables**, add the **same** keys from your `.env.local` (all six).
4. Deploy. Vercel gives you a URL.
5. In Supabase → **Authentication → URL Configuration**, add your Vercel URL to **Site URL** and **Redirect URLs** so email links resolve correctly.

That's it — you're live.

---

## How the app fits together (quick map)

- **Dashboard** — live counts: jobs, inventory, low stock, workers, invoiced totals.
- **Jobs** — list + create. Open a job for the real work:
  - **Time & Crew** — assign crew, **Punch In / Store Run / Clock Out** with live timers. Punches are saved to the backend; each can carry a **note** and a **photo**. Photos can be **required** per worker (Workers page) and/or per job — if either requires it, the punch-in demands a photo.
  - **Items & Costs** — add catalog items to the job (this draws down inventory stock), plus one-time costs. Checkboxes control what lands on the invoice.
  - **Billing & Invoice** — itemized or per-hour billing (per-hour can exclude store-run time), generate an invoice, **download a PDF**, and **email it** to the customer.
- **Inventory** — your reusable catalog with cost/charge/markup, stock, and low-stock warnings.
- **Workers** — crew, pay rates, and the per-worker "require photo" toggle.
- **Invoices** — every invoice across all jobs; view, PDF, or send.
- **Admin → Users / Roles** — control access.
- **Activity Log** — an audit trail of who did what, when.
- **Settings** — your theme (system/light/dark) and, for admins, company + invoice defaults (name, from-address, default rate, tax rate).

---

## Editing logged time

Punch records live in the `punches` table. Anyone with the **"Punch in/out & time tracking"** permission can manage them. The schema already supports admin corrections (there are `edited_by` / `edited_at` columns and notes). A dedicated "edit past punch" UI is a natural next addition if you want in-app editing beyond the current punch flow — the data model is ready for it.

---

## Security notes

- Every table is protected by **row-level security** and scoped to a company.
- The **service-role key** is only ever used in server code (never shipped to the browser). Keep it secret.
- The app is built multi-company-ready (every record has a `company_id`) but ships configured for your single client — there's just one company row and no multi-company UI.
- This project pins **Next.js 14.2.33**, which patches the advisory flagged at build time. `npm audit` may still list older 14.x CVEs that only fully clear by upgrading to Next 16 (a major version change). For a self-hosted internal tool behind authentication, staying on patched 14.x is a reasonable, stable choice; upgrading to 16 later is possible but is a migration, not a drop-in.

---

## Troubleshooting

- **"Email is not configured" when sending an invoice** → `RESEND_API_KEY` or `INVOICE_FROM_EMAIL` missing, or the from-domain isn't verified in Resend.
- **Can't receive the login code** → check spam; confirm Email auth is on in Supabase; in dev, Supabase may rate-limit — wait a minute.
- **"Account pending" after logging in** → expected for non-admin users until an admin assigns a role and marks them active.
- **Photos won't upload** → confirm `0003_punch_photos.sql` ran (it creates the `punch-photos` storage bucket and its policies).
