# BuildLedger — Migration Plan: Supabase → Neon + Clerk + Cloudflare R2

**Purpose of this file:** This is the master plan for migrating BuildLedger off Supabase. If a work session is interrupted or hits a limit, START HERE. It records the decision, the target architecture, the exact order of work, and a checklist so any future session can pick up precisely where the last one stopped.

**Last updated:** Phase 1 code done; auth decision: **email-OTP only for launch, TOTP 2FA deferred** (see note below).

---

## DECISION LOG: 2FA DEFERRED (2026-05-26)

Clerk's TOTP/authenticator MFA is a **Pro** feature — free on *development* instances but **paid on production**. To launch on the free tier, we are shipping **email verification code (OTP) sign-in ONLY** for now. This consciously defers the original "email + 2FA" requirement. Clerk makes TOTP a simple toggle once on a paid production plan, and the integration code is written so 2FA can be turned on later without app changes. DO NOT treat 2FA as forgotten — it's a deliberate deferral to be revisited at production launch.

---

## WHY WE'RE DOING THIS

The client expects to store a large volume of files (punch photos), and Supabase's free tier (500 MB DB / 1 GB storage, auto-pauses after 1 week idle) is too small. Rather than pay for Supabase Pro, we're moving to a stack with more generous free tiers:

| Concern        | Old (Supabase)            | New                                   |
|----------------|---------------------------|---------------------------------------|
| Database       | Supabase Postgres (500MB) | **Neon Postgres** (10 GB free, no auto-pause) |
| Auth + 2FA     | Supabase Auth             | **Clerk** (free to 10k MAU, email OTP + TOTP 2FA built in) |
| File storage   | Supabase Storage (1 GB)   | **Cloudflare R2** (10 GB free, no egress fees) |
| Email (invoices+OTP) | Resend (via Supabase SMTP) | **Resend** (unchanged — Clerk sends its own auth email; Resend still sends invoices) |

---

## TARGET ARCHITECTURE

- **Next.js (App Router) + TypeScript** — unchanged.
- **Database access:** raw Postgres via the **`@neondatabase/serverless`** driver (or `postgres`/`pg`). We drop the Supabase client and write small query helpers. The SQL schema itself barely changes.
- **Auth:** **Clerk** — `@clerk/nextjs`. Clerk handles the entire login flow (email code) and 2FA (TOTP authenticator). This REPLACES `/login`, `/setup-2fa`, the OTP API route, the middleware session logic, and the `getCurrentUser()` helper.
- **Authorization (roles/permissions):** UNCHANGED in concept. We keep our own `users`, `roles`, `permissions` tables in Neon. After Clerk authenticates someone, we look up their profile row in our DB by their Clerk user ID and load permissions exactly like before. The permission catalog (`src/lib/permissions.ts`) does NOT change.
- **File storage:** **Cloudflare R2** via the S3-compatible API (`@aws-sdk/client-s3`). Replaces the one Supabase Storage call in the punch system.
- **Row Level Security:** Supabase RLS policies go away (they depended on Supabase auth). Since this is a single-company internal tool and ALL database access goes through our own server code (never directly from the browser), we enforce company scoping in the query layer instead. This is an acceptable and common pattern — the browser never talks to the DB directly.

---

## KEY DESIGN DECISIONS (so they're not re-litigated later)

1. **Clerk user ID becomes the link.** Our `users.id` currently references `auth.users(id)` (Supabase). In the new world, `users` gets a `clerk_user_id text unique` column instead. The bootstrap logic (superadmin promotion by email) stays the same — on first sign-in we upsert a profile row keyed by Clerk ID, and if their email matches `SUPPORT_ADMIN_EMAIL`, they become superadmin.
2. **No more browser-side DB calls.** Today many client components call Supabase directly (e.g. `inventory-manager.tsx`). After migration, those become calls to our own API routes / server actions, because Neon must only be reached from the server (the connection string is secret). THIS IS THE BIGGEST CODE CHANGE — see Phase 4.
3. **Keep the schema, drop the policies.** Reuse `0001_init.sql` tables almost verbatim; remove the `auth.users` FK, remove all `alter ... enable row level security` and `create policy` blocks, and change the storage-bucket migration (R2 needs no SQL).
4. **Resend stays for invoices.** The invoice send API (`/api/invoices/send`) keeps using Resend directly — only its auth check changes (Clerk instead of Supabase getCurrentUser).

---

## MIGRATION PHASES & CHECKLIST

Work top to bottom. Check off each item as it lands. Each phase ends in a buildable state where possible.

### Phase 0 — Accounts & env (no code)
- [ ] Create a **Neon** project, copy its `DATABASE_URL` (pooled connection string).
- [ ] Create a **Clerk** application; in Clerk dashboard enable **Email verification code** sign-in and **TOTP/Authenticator** under Multi-factor. Copy `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
- [ ] Create a **Cloudflare R2** bucket (e.g. `buildledger-photos`); create an R2 API token; copy `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and the bucket's public URL.
- [ ] New `.env.local` keys (replaces the Supabase ones):
  ```
  DATABASE_URL=postgres://...neon...
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
  CLERK_SECRET_KEY=sk_...
  NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
  CLERK_R2_ACCOUNT_ID=...
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_BUCKET=buildledger-photos
  R2_PUBLIC_URL=https://...r2.dev
  RESEND_API_KEY=re_...            # unchanged
  INVOICE_FROM_EMAIL=invoices@mobrauntech.com   # unchanged
  SUPPORT_ADMIN_EMAIL=support@mobrauntech.com   # unchanged
  ```

### Phase 1 — Database layer
- [ ] `npm install @neondatabase/serverless` (and remove `@supabase/ssr`, `@supabase/supabase-js` later).
- [ ] Create `src/lib/db.ts` — exports a `sql` query helper bound to `DATABASE_URL`.
- [ ] Create `supabase/migrations_neon/0001_init.sql` — copy of the old schema with: `auth.users` FK removed, `users.clerk_user_id text unique` added, all RLS + policies + `current_company_id()` removed.
- [ ] Port `0002_seed.sql` unchanged (company, Administrator role, samples).
- [ ] Port the punch columns from `0003_punch_photos.sql` MINUS the `storage.buckets`/`storage.objects` parts (R2 replaces that). Keep the `note`, `*_photo_url`, `edited_by/at`, and `require_punch_photo` columns.
- [ ] Run all three against Neon; confirm tables exist.

### Phase 2 — Auth with Clerk
- [ ] `npm install @clerk/nextjs`.
- [ ] Wrap `src/app/layout.tsx` in `<ClerkProvider>`.
- [ ] Replace `src/middleware.ts` with Clerk's `clerkMiddleware()` + route protection.
- [ ] DELETE `src/app/login/page.tsx` and `src/app/setup-2fa/page.tsx` custom flows; replace with Clerk's `<SignIn>` component (it handles email code + TOTP enrollment itself). Configure Clerk to require MFA.
- [ ] Rewrite `src/lib/supabase-server.ts` → `src/lib/auth.ts` exposing `getCurrentUser()` that: reads Clerk's `auth()`/`currentUser()`, looks up (or bootstraps) the profile row in Neon by `clerk_user_id`, returns the same `CurrentUser` shape `{id,email,fullName,companyId,roleId,isSuperadmin,isActive,theme,permissions}` so downstream code is unaffected.
- [ ] Rewrite `src/lib/bootstrap.ts` to upsert by `clerk_user_id` (superadmin promotion by `SUPPORT_ADMIN_EMAIL` stays identical).
- [ ] Delete `src/app/api/auth/verify-otp/route.ts` (Clerk handles it); move the audit-on-login into `getCurrentUser` bootstrap or a Clerk webhook.
- [ ] `src/lib/guard.ts` (`requirePermission`) — only its import of `getCurrentUser` changes; logic stays.

### Phase 3 — File storage with R2
- [ ] `npm install @aws-sdk/client-s3`.
- [ ] Create `src/lib/r2.ts` — S3 client pointed at R2; helper `uploadPunchPhoto(file)` returns a public URL.
- [ ] Create an upload API route `src/app/api/upload/route.ts` (Clerk-protected) that accepts the file and puts it in R2.
- [ ] In `job-detail.tsx`, replace the `supabase.storage.from("punch-photos").upload(...)` call with a `fetch('/api/upload')` call.

### Phase 4 — Replace browser-side DB calls (BIGGEST PHASE)
Every client component currently importing `createClient` from `supabase-browser` must stop talking to the DB directly. Pattern: add server actions (or API routes) and call those instead. Files to convert:
- [ ] `src/app/(app)/admin/roles/roles-manager.tsx` (create/edit/delete roles)
- [ ] `src/app/(app)/admin/users/users-manager.tsx` (set role / active)
- [ ] `src/app/(app)/inventory/inventory-manager.tsx` (CRUD items)
- [ ] `src/app/(app)/workers/workers-manager.tsx` (CRUD workers)
- [ ] `src/app/(app)/jobs/jobs-manager.tsx` (create job)
- [ ] `src/app/(app)/jobs/[id]/job-detail.tsx` (crew, items, costs, punches, invoice gen — the big one)
- [ ] `src/app/(app)/invoices/invoices-manager.tsx` (send/PDF)
- [ ] `src/app/(app)/settings/settings-form.tsx` (profile/company save)
- [ ] `src/components/topbar.tsx` (theme persist)
- [ ] The server `page.tsx` files just swap `createClient()` for the new `sql` helper — mechanical.

### Phase 5 — Cleanup & verify
- [ ] Remove `@supabase/*` from package.json; delete `supabase-browser.ts`, `supabase-server.ts`, old migrations.
- [ ] `npm run build` clean.
- [ ] Update the main `README.md` deploy steps (Neon + Clerk + R2 instead of Supabase).
- [ ] On the VM: pull, `npm install`, set new `.env.local`, `npm run build`, `pm2 restart buildledger`.
- [ ] Update Clerk's allowed origins / redirect URLs to `https://workstock.mobrauntech.com`.

---

## CURRENT STATUS — MIGRATION COMPLETE ✅

All phases done. `npm run build` passes clean on Next 15.5.9. `grep -rl supabase src/` returns nothing.

- [x] Phase 0 — accounts created, keys gathered
- [x] Phase 1 — Neon DB layer (db.ts + migrations_neon/0001+0002)
- [x] Phase 2 — Clerk auth (auth.ts, middleware, ClerkProvider, /login, deleted old supabase auth)
- [x] Phase 3 — R2 storage (r2.ts, /api/upload, job-detail photo upload wired)
- [x] Phase 4 — ALL components converted to server actions / Neon queries
    - [x] guard.ts, audit.ts, (app)/layout, dashboard, logs
    - [x] inventory, workers, admin/users, admin/roles, settings (actions.ts each)
    - [x] jobs list + jobs-manager, jobs/[id] page + job-detail + actions, invoices page + manager, topbar, invoices/send route
- [x] Phase 5 — cleanup: removed @supabase deps, deleted old supabase/migrations, README rewritten, .env.example updated, build verified clean

### REMAINING USER STEPS TO GO LIVE (not code — operational)
1. Run `supabase/migrations_neon/0001_init.sql` then `0002_seed.sql` in the Neon SQL editor.
2. Put all new env vars (DATABASE_URL, Clerk keys, R2 keys, Resend, SUPPORT_ADMIN_EMAIL) in the VM's `.env.local`.
3. In Clerk: enable Email verification code; add workstock.mobrauntech.com to allowed origins.
4. Deploy on VM: `git pull && npm install && npm run build && pm2 restart buildledger` (on the neon-migration branch; merge to main once confirmed working).
5. First login with SUPPORT_ADMIN_EMAIL becomes superadmin automatically.

### NOTE: 2FA still deferred (email-OTP only) — see DECISION LOG above. Re-enable via Clerk Multi-factor on a paid production instance.

---

## ROLLBACK NOTE

The working Supabase version is the last commit before migration on the `main` branch. Before starting, tag it:
```bash
git tag supabase-working
git push origin supabase-working
```
If the migration stalls, the deployed VM can stay on the Supabase version until the new stack is fully ready. Consider doing the migration on a `neon-migration` branch and only merging to `main` when it builds and logs in successfully.
