# Post-launch improvements — batch tracker

This file tracks the UX/feature improvements requested after the initial Neon migration went live.

## ✅ Batch 1 — Foundation & quick wins (DONE)

- [x] **Login redirect 404 fix** — added `src/app/page.tsx` (redirects to /dashboard); added `forceRedirectUrl` to `<SignIn>`; tightened middleware so it doesn't bounce signed-in users during Clerk's multi-step flow
- [x] **Workers → Employees rename, everywhere**
    - Tables: `workers` → `employees`, `job_workers` → `job_employees`, `worker_id` columns → `employee_id`
    - Permissions: `workers.*` → `employees.*` (catalog + seeded role JSON)
    - Code: folder, file, interface, prop, variable, label renames across all files
    - New migration `0003_rename_workers_to_employees.sql` for existing databases; updated 0001/0002 so a fresh install gets the new names from the start
- [x] **Sidebar restructure** — new order: Dashboard, Admin (expandable, admin-only), Jobs, Inventory, Employees. Removed top-level "Invoices" entry (will be folded into Jobs in Batch 2). Activity Log lives under Admin. App settings lives under Admin.
- [x] **Collapsible sidebar** — toggle button, state persisted in localStorage
- [x] **Profile in bottom-left** — avatar + name/email at bottom of sidebar with dropdown for: My settings, theme switcher, sign out. Old top bar removed entirely (sidebar now holds everything).
- [x] **Settings split** — `/settings` = user-only (display name + theme). `/admin/settings` = company name, invoice "from", default rate, tax rate (admin.company perm).
- [x] **Dark mode tweaks** — improved palette: card surfaces sit above the background for visual hierarchy, lighter borders, blue accent on primary. Less flat than before.

## ⏳ Batch 2 — Big interaction change (IN PROGRESS)

DONE this session:
- [x] **Theme switch bug fixed** — ApplyTheme no longer fights the user; settings applies theme live on selection. Root cause: ApplyTheme re-asserted the DB theme on every mount.
- [x] **Employee system invitations** — add-employee form has an "invite to system" toggle + email; uses Clerk `invitations.createInvitation`. Invite status shown in the list (Invited / Active), resend available from the edit panel. New columns via migration `0004_employee_invites.sql` (folded into 0001 for fresh installs). Actions: inviteEmployee, resendInvite, refreshInviteStatuses.
- [x] **Slide-over component** (`src/components/slide-over.tsx`) — reusable right-side panel, replaces dialogs.
- [x] **Row actions** (`src/components/row-actions.tsx`) — right-click context menu + strong DeleteConfirm (type-the-name).
- [x] **Employees page converted** to the new pattern: click row → slide-over edit; right-click → context menu; delete → typed confirmation. This is the reference implementation for the others.

STILL TODO (apply the same pattern to the rest):
- [ ] Inventory page → slide-over + context menu + typed delete
- [ ] Jobs list → slide-over (note: jobs/[id] is a full page today; decide slide-over vs keep full page for the detail given its size)
- [ ] Admin → Users → slide-over/context where it makes sense
- [ ] Admin → Roles → slide-over instead of dialog
- [ ] Job detail: replace its internal dialogs (punch, add item, add cost) with slide-overs or inline
- [ ] Fold Invoices into Jobs and remove the standalone /invoices route (nav entry already removed)

DEPLOY for this session: run migration `0004_employee_invites.sql` on Neon, then npm install/build/pm2 restart. Also set NEXT_PUBLIC_APP_URL=https://workstock.mobrauntech.com in .env.local so invite links point to the right place.

## ⏳ Batch 3 — Analytics + product review (TODO later)

- [ ] Dashboard analytics: weekly revenue trend, jobs by status, top employees by hours, low-stock items, recent activity feed
- [ ] **The "10 improvements" review** — comprehensive walk-through with concrete suggestions

## DEPLOY STEPS for Batch 1
1. On the VM: `cd ~/BuildledgerProduction && git pull origin neon-migration`
   (or unzip the new package on top of the project)
2. Run the new migration against Neon: `supabase/migrations_neon/0003_rename_workers_to_employees.sql`
   (skip this if you have a fresh DB — 0001/0002 already use the new names)
3. `npm install && npm run build && pm2 restart buildledger`
4. Hard-refresh the browser
