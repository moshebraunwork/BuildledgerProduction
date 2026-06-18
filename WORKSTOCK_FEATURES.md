# Workstock → BuildLedger feature port

This documents the gap analysis between the **Workstock** design prototype
(`Workstock.html`) and the live BuildLedger app, plus what was implemented in
this branch. Everything below reuses existing data — **no database schema
changes** were made.

## Full feature list found in the prototype

### Global shell / navigation
1. Command palette (⌘K) — fuzzy search across navigate / create / settings
2. Global search bar in a top header
3. Keyboard shortcuts — ⌘K, `N` new job, `D` theme, `G` then `J/D/E/I/C/S/V`
4. Top header bar — breadcrumb (Company / View), notification bell, primary "New job"
5. Status footer bar — live "connected" pulse, plan, employee count, last sync, hints
6. Sidebar nav badges (open jobs, low stock) + per-item shortcut hints
7. Pinned items section (prototype only)
8. Tenant / company switcher (multi-company)
9. Notifications dropdown

### Dashboard
10. KPI cards with mini sparklines + delta badges
11. Greeting header (Good morning, … · date · jobs active · clocked in)
12. Range tabs (24h / 7d / 30d / QTD)
13. Today's schedule widget
14. Crew utilisation progress bars

### Jobs
15. Kanban board with drag-and-drop
16. Board / List / Map view switcher
17. Priority badges (HIGH / MED / LOW)
18. Export button

### Schedule
19. Weekly calendar grid by crew (crew rows × 7 days, week nav)

### Employees
20. Trade column, hours-this-week, on-shift status (ON SITE / EN ROUTE / …), export CSV

### Inventory
21. Stats cards (Total SKUs, Stock value, Below reorder, Pending POs)
22. Multi-warehouse + warehouse filter, category, vendor, unit, reorder-at, status pills

### Customers (no equivalent existed)
23. Customers view — card grid with avatar, tags, contact, Jobs / LTV / Last stats

### Design / polish
24. Inter (UI) + JetBrains Mono (numbers/metadata)
25. Colored status pills, fade / pulse / grow animations

## Implemented in this branch ✅

- **Command palette (⌘K)** + **keyboard shortcuts** (`N`, `D`, `G`-then-key) —
  `src/components/command-palette.tsx`, mounted in the app layout. Reachable from
  the sidebar "Search" button (desktop) and the top-bar search icon (mobile).
- **Desktop top header** — breadcrumb, global search trigger, notifications
  popover, "New job" — `src/components/app-header.tsx`.
- **Status footer** — live pulse, company, employee count, rolling last-sync,
  shortcut hints — `src/components/status-bar.tsx`.
- **Sidebar badges + shortcut hints** + ⌘K launcher — `src/components/sidebar.tsx`
  (open-jobs and low-stock counts computed in the layout).
- **Dashboard upgrades** — greeting header, KPI **sparklines** + **delta badges**
  (real 6-month series), **Today's schedule**, **crew utilisation** bars.
- **Jobs Kanban board** — `Board` view with drag-and-drop on desktop and
  move-chips on touch; columns map to the real `scheduled / active / complete`
  statuses and persist via the existing `setJobStatus` action.
- **Schedule** (`/schedule`) — weekly crew × day grid (desktop) and day agenda
  (mobile) with week navigation, derived from `job_employees`.
- **Customers** (`/customers`) — card grid derived from jobs + invoice revenue
  (LTV), with tags, search, and click-through to a filtered jobs list.
- **Inventory stats cards** — Total SKUs, Stock value, Below reorder, Out of stock.
- **Fonts** — Inter + JetBrains Mono (loaded via `<link>`, system fallback);
  `font-mono` now resolves to JetBrains Mono app-wide.

All of the above work on **desktop and mobile**.

## Deferred — require schema changes / product decisions ⏳

These were intentionally left out because they touch the production database or
need data the app doesn't model yet:

- **Job priority** badges (needs a `priority` column on `jobs`).
- **Multi-warehouse / categories / vendors / reorder-at** on inventory
  (needs new `items` columns + a warehouses concept). Stats + status are in;
  the multi-location data model is not.
- **Pending POs** KPI (needs a purchase-orders model).
- **Tenant / company switcher** (needs multi-company membership per user).
- **Dashboard range tabs** (needs day-level time-series aggregation).
- **A first-class Customers entity** (currently derived from jobs; a real
  `customers` table would add address, phone, type, notes, etc.).
- **Employee on-shift status / trade / hours-this-week columns** (partially
  derivable from punches; left out to avoid half-wiring).

See the chat thread for the original side-by-side comparison.

---

## Phase 2 — follow-up changes

Requires running **migration `0016_workstock_phase2.sql`** in Neon (adds
`users.font_scale_*`, `users.notifications_read_at`, `roles.notification_prefs`,
and the `job_statuses` table; seeds the three built-in statuses). All code is
guarded so the app still runs before the migration is applied.

- **Top bar trimmed** — removed the global search bar and the header "New job"
  button. Search now lives only in the sidebar (desktop) / top bar (mobile),
  using a **command icon**.
- **Notifications now work** — the bell shows real activity (derived from the
  activity log), with an unread badge and mark-as-read. Admins choose, **per
  role on the Roles screen**, which categories that role is notified about.
- **Mobile Jobs view switch** is now List / Board / Map (Map was previously
  unreachable from the board).
- **Custom job statuses** — users with the new `jobs.statuses` permission can
  add/remove board columns; each becomes a new section in the board. Statuses
  are per-company and drive the board, filters and status pills.
- **View mode is remembered** per page (Jobs list/board/map, Team list/map) via
  localStorage.
- **Customer detail** — clicking a customer opens contact info, all their jobs,
  and all their invoices (with links).
- **One font everywhere** — Inter across the whole app (numbers included);
  JetBrains Mono removed.
- **Per-account font size**, separate for desktop and mobile — set in
  My Settings (you only see the control for the device you're on).
- **Status footer bar removed.**
- **Admin area hidden on mobile** (desktop-only management).

---

## Phase 3 — chat upgrade

Requires running **migration `0017_job_chat_pro.sql`** in Neon (adds read/seen
state + typing to `job_chat_participants`, edit/delete/reply columns to
`job_chat_messages`, and a `job_chat_reactions` table). All code is guarded so
the existing chat keeps working before the migration is applied.

The per-job chat now has:
- **Delivery + read receipts** — every message shows ✓ sent, ✓✓ delivered,
  ✓✓ (blue) read; a status line under your latest message ("Sent" / "Delivered"
  / "Read by …"), and a **Message info** dialog listing each person's
  delivered/read state with timestamps.
- **Emoji reactions** — quick-react from the message menu; tap a chip to toggle.
- **Replies** — quote and reply to any message; the quote shows in the bubble.
- **Edit & delete** — edit your own messages (shows "edited"); delete leaves a
  tombstone and pulls any shared file from the job's media.
- **Typing indicators** — "X is typing…" in the thread header.
- **Unread badges** on the chat list, bold unread rows, and **date separators**
  (Today / Yesterday / date) plus sender avatars and message grouping for
  clarity.

---

## Phase 4 — important alerts + scheduled messages

Requires running **migration `0018_chat_alerts_scheduled.sql`** in Neon (adds
`job_chat_messages.important`, the `job_chat_alert_dismissals` table, and the
`job_chat_scheduled` table). Guarded so the chat works before it's applied.

- **Important messages** — flag a message "Important" in the composer. It pops a
  banner at the top of **every page** for each recipient (sender, job, preview,
  "View in job") and stays **until that person dismisses it** (per-user
  dismissals). Flagged messages also carry an "Important" badge in the thread.
  The banner is mounted in the app shell (`important-alerts.tsx`) and polls.
- **Scheduled messages** — pick a future date/time in the composer to queue a
  message. Queued messages live in `job_chat_scheduled` and are **released into
  the chat when due**, lazily, on the next poll by any active user (no worker
  needed). The sender sees their pending scheduled messages in the thread with a
  "Sends <time>" label and can cancel them.
