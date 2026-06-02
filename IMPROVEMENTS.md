# BuildLedger — Improvement Backlog

> **Update (2026-06):** A round of improvements landed on top of the earlier UX
> batches. Addressed in this round:
> - **Security headers** — `next.config.mjs` now sends HSTS, `X-Frame-Options`,
>   `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and drops
>   the `X-Powered-By` banner.
> - **Patched dependencies** — bumped Next.js to a release that clears the
>   high-severity advisories (`npm audit fix`, no breaking change).
> - **#3 / #2 Clerk webhook** — `POST /api/webhooks/clerk` verifies the Svix
>   signature (built-in crypto, no new dep) and links accepted invites back to
>   the employee/user rows in real time, replacing the polling approach.
> - **#7 Logging** — added `src/lib/logger.ts` and wired it into the upload
>   route, R2 failures, and the previously-silent invite-revoke catch. Users now
>   see friendly messages while the real cause is logged server-side.
> - **#8 Indexes** — migration `0010_performance_indexes.sql` covers the
>   dashboard hours aggregation, billing reads, and the list pages.
> - **#9 Tests + CI** — `vitest` suite around billing math and `can()`
>   permissions, plus a GitHub Actions workflow running tests + build on push.
>
> The notes below remain the standing backlog for what's left.

---

# 10 Things We Can Make Better

A grounded review after the Neon migration and the UX batches. These are ordered roughly by impact-to-effort: the early ones are high-value and mostly small; the later ones are bigger investments. Each notes *why* it matters and *roughly* what it takes.

---

## 1. Upload route accepts any file, any size (security + cost)
**Where:** `src/app/api/upload/route.ts`
Right now the endpoint stores whatever is posted — any MIME type, any size. A punch photo should be an image under, say, 10 MB. Without limits, a malicious or buggy client could upload huge files (R2 cost, slow requests) or non-images.
**Fix:** validate `file.type` starts with `image/`, cap `file.size`, and reject otherwise. ~15 minutes. Low-risk, high-value.

## 2. Invite-status check doesn't scale (correctness over time)
**Where:** `refreshInviteStatuses()` in `employees/actions.ts`
It pulls Clerk's accepted-invitation list and matches in a loop. Clerk paginates that list — once there are more than one page of invitations, older accepted invites fall off and an employee could show "Invited" forever even after accepting. It also runs a separate `UPDATE` per accepted employee (N round-trips).
**Fix:** check each pending invite by its own id (or use a Clerk webhook on `invitation.accepted` to flip status in real time instead of polling). The webhook route is the robust answer and also removes the need to poll at all. ~half a day for the webhook.

## 3. No webhook to sync Clerk → employee record (reliability)
**Where:** doesn't exist yet
When an invited employee accepts and signs up, nothing links their new Clerk user back to the employee row (the `clerk_user_id` column exists but is never populated). So an invited employee and their eventual login are two disconnected records.
**Fix:** add `POST /api/webhooks/clerk`, verify the signing secret, handle `user.created` / `invitation.accepted`, and set `employees.clerk_user_id` + `invite_status='accepted'`. This is the proper backbone for #2 as well.

## 4. Money is stored and math'd as floating point (data integrity)
**Where:** schema `numeric` columns are correct, but JS does `Number(...)` arithmetic for subtotals/markup/tax
Floating-point dollars drift (e.g. `0.1 + 0.2`). On a single invoice it's invisible; across many line items and tax it can be off by a cent, which looks unprofessional on a customer invoice.
**Fix:** do money math in integer cents, or round consistently at each step with a helper. Medium effort because it touches billing in `job-detail.tsx` and the invoice route, but worth it for anything customer-facing.

## 5. Job detail still uses popups for punch / add-item / add-cost (consistency)
**Where:** `jobs/[id]/job-detail.tsx`
We moved the whole app to slide-overs and "no popups," but the three dialogs inside the job detail are the last holdouts. It's a visible inconsistency on the most-used screen.
**Fix:** convert them to the existing `SlideOver` component. ~1–2 hours; purely mechanical now that the pattern exists.

## 6. No optimistic concurrency on stock (race condition)
**Where:** `addJobItem` in `jobs/[id]/actions.ts`
Stock is read on the page, then written as `currentStock - qty` from the client's snapshot. If two people add the same item at once, the second write overwrites the first and stock is wrong.
**Fix:** decrement atomically in SQL (`set stock = stock - ${qty} where id = ... and stock >= ${qty}`) and check the affected row count. ~30 minutes, prevents a real data bug once more than one person uses the app.

## 7. Errors are swallowed or shown raw (observability + UX)
**Where:** several `catch {}` blocks (e.g. theme save, invite revoke) and toasts that surface raw provider messages
Silent catches make failures invisible when debugging; raw Clerk/R2 messages shown to users are confusing. There's no server-side logging to look back on.
**Fix:** add a tiny logger, log server-side on every action failure, and show users a friendly message while keeping the detail in logs. Low effort, compounding payoff.

## 8. The dashboard and lists always full-fetch (performance at scale)
**Where:** list pages select all rows; dashboard recomputes every load
Fine at current data sizes. But `employees`/`items`/`jobs` queries have no pagination, and the dashboard's per-employee hours aggregation will slow as punches accumulate.
**Fix:** add `limit`/pagination to lists and a date-bounded window to the punch aggregation. Also add an index on `punches (employee_id)` and `invoices (company_id, created_at)`. Defer until data grows, but easy to do now.

## 9. No automated tests or CI (safety net)
**Where:** project-wide
Every change so far has been verified by a manual `npm run build`. That catches type errors but not logic regressions (permission checks, billing math, company-scoping). One wrong `where company_id` and a tenant sees another's data.
**Fix:** start with a handful of tests around the highest-risk logic — `can()` permissions, billing totals, and that every server action scopes by company. A GitHub Action running `build` + tests on push. Medium effort, big confidence gain before onboarding real users.

## 10. Accessibility & mobile polish (reach)
**Where:** `SlideOver`, `RowContextMenu`, tables
The slide-over doesn't trap focus or restore it on close; the right-click context menu has no keyboard equivalent (right-click isn't available on touch devices, so mobile users can't reach Delete); wide tables overflow on phones. For a field tool that crews may open on a phone, this matters.
**Fix:** trap focus in the slide-over, add a small "⋯" actions button per row as the touch/keyboard path to the same menu, and make tables horizontally scroll or stack on narrow screens. Medium effort, broadens who can actually use it.

---

### Suggested order
- **Quick wins now:** #1 (upload limits), #6 (atomic stock), #5 (last popups).
- **Before real multi-user load:** #3 + #2 (Clerk webhook), #9 (tests/CI), #10 (mobile/touch actions).
- **When it matters:** #4 (money in cents), #7 (logging), #8 (pagination/indexes).

None of these are emergencies — the app is live and working. They're the difference between "works for one careful admin" and "robust for a crew using it daily on phones."
