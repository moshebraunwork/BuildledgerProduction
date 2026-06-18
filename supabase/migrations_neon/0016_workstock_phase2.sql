-- ============================================================================
-- 0016 — Workstock phase 2
--
-- Adds the data behind: per-account font size (separate mobile/desktop), the
-- notifications bell + per-role notification preferences, and custom per-company
-- job statuses (Kanban columns).
--
-- All additive and idempotent — safe to run on a live database.
-- ============================================================================

-- Per-account font scale, applied per form factor. Values: 'sm' | 'md' | 'lg' | 'xl'.
alter table public.users add column if not exists font_scale_desktop text not null default 'md';
alter table public.users add column if not exists font_scale_mobile  text not null default 'md';

-- Notifications are derived from the activity log; this records when a user last
-- opened the bell so we can count unread items.
alter table public.users add column if not exists notifications_read_at timestamptz;

-- Per-role notification preferences: { "jobs": true, "invoices": false, ... }.
-- A missing key means "enabled" (opt-out model).
alter table public.roles add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- Custom, per-company job statuses — these become the Kanban board columns.
create table if not exists public.job_statuses (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  key         text not null,
  label       text not null,
  color       text not null default '#71717a',
  position    integer not null default 0,
  is_system   boolean not null default false,
  created_at  timestamptz default now(),
  unique (company_id, key)
);
create index if not exists idx_job_statuses_company on public.job_statuses (company_id, position);

-- Seed the three built-in statuses for every existing company (idempotent).
insert into public.job_statuses (company_id, key, label, color, position, is_system)
select c.id, v.key, v.label, v.color, v.position, true
from public.companies c
cross join (values
  ('scheduled', 'Scheduled',   '#0ea5e9', 0),
  ('active',    'In progress', '#10b981', 1),
  ('complete',  'Completed',   '#a1a1aa', 2)
) as v(key, label, color, position)
on conflict (company_id, key) do nothing;
