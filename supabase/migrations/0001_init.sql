-- ============================================================================
-- BuildLedger — Production schema
-- Run this in your Supabase project: SQL Editor > paste > Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- COMPANIES (multi-tenant-ready; for one client there will be a single row)
-- ----------------------------------------------------------------------------
create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  invoice_from  text,                       -- "From" name shown on invoices
  default_rate  numeric(10,2) default 85.00, -- default per-hour billing rate
  tax_rate      numeric(5,4)  default 0.0000,-- e.g. 0.0875 for 8.75%
  created_at    timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- ROLES — admin-defined, NOT hardcoded. Permissions stored as a JSON set.
-- A role like {"jobs.view": true, "jobs.edit": true, "invoices.send": false ...}
-- is_system marks built-in roles that cannot be deleted (e.g. "Administrator").
-- ----------------------------------------------------------------------------
create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name         text not null,
  permissions  jsonb not null default '{}'::jsonb,
  is_system    boolean not null default false,
  created_at   timestamptz default now(),
  unique (company_id, name)
);

-- ----------------------------------------------------------------------------
-- USERS — profile row linked 1:1 to a Supabase auth.users record.
-- is_superadmin = the built-in support/owner account that always has full access
-- and can never be locked out or stripped of permissions.
-- ----------------------------------------------------------------------------
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  email         text not null,
  full_name     text,
  role_id       uuid references public.roles(id) on delete set null,
  is_superadmin boolean not null default false,
  is_active     boolean not null default true,
  pay_rate      numeric(10,2) default 0,   -- this user's hourly pay rate (as a worker)
  theme         text default 'system',      -- 'system' | 'light' | 'dark'
  created_at    timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- WORKERS — crew members assignable to jobs. A worker MAY be linked to a login
-- user (user_id) but doesn't have to be (some crew never log in).
-- ----------------------------------------------------------------------------
create table public.workers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  name        text not null,
  role_title  text,          -- e.g. "Carpenter", "Foreman"
  phone       text,
  pay_rate    numeric(10,2) default 0,
  created_at  timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- INVENTORY ITEMS — reusable catalog with stock tracking
-- ----------------------------------------------------------------------------
create table public.items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  cost          numeric(10,2) not null default 0,  -- price paid
  charge        numeric(10,2) not null default 0,  -- price charged to customer
  source        text,                              -- store name / address / link
  stock         integer not null default 0,
  low_threshold integer not null default 0,
  created_at    timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- JOBS
-- billing_mode: 'itemized' | 'hourly'
-- status: 'scheduled' | 'active' | 'complete'
-- ----------------------------------------------------------------------------
create table public.jobs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  title          text not null,
  place          text,
  scheduled_date date,
  customer_name  text,
  customer_email text,
  notes          text,
  estimate       numeric(12,2) default 0,
  billing_mode   text not null default 'itemized',
  billing_rate   numeric(10,2),  -- per-job override of company default_rate
  status         text not null default 'scheduled',
  created_at     timestamptz default now()
);

-- Crew assigned to a job (many-to-many)
create table public.job_workers (
  job_id    uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  primary key (job_id, worker_id)
);

-- Items used on a job (quantity drawn from inventory). Snapshot cost/charge at
-- time of add so later catalog edits don't rewrite past invoices.
create table public.job_items (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  item_id     uuid references public.items(id) on delete set null,
  name        text not null,
  qty         integer not null default 1,
  cost        numeric(10,2) not null default 0,
  charge      numeric(10,2) not null default 0,
  excluded    boolean not null default false  -- excluded from invoice
);

-- One-time additional costs, per job, NOT reusable (permits, dumpster, etc.)
create table public.job_costs (
  id        uuid primary key default gen_random_uuid(),
  job_id    uuid not null references public.jobs(id) on delete cascade,
  label     text not null,
  cost      numeric(10,2) not null default 0,
  charge    numeric(10,2) not null default 0,
  excluded  boolean not null default false
);

-- ----------------------------------------------------------------------------
-- PUNCHES — time tracking. kind: 'site' (on job) | 'store' (store run)
-- A row is open while ended_at is null. store time is flagged for optional
-- exclusion from per-hour billing.
-- ----------------------------------------------------------------------------
create table public.punches (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id     uuid not null references public.jobs(id) on delete cascade,
  worker_id  uuid not null references public.workers(id) on delete cascade,
  kind       text not null default 'site',
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

-- ----------------------------------------------------------------------------
-- INVOICES — generated from a job; stores a snapshot + send status
-- ----------------------------------------------------------------------------
create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  number        text not null,
  customer_name text,
  customer_email text,
  subtotal      numeric(12,2) not null default 0,
  tax           numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  line_items    jsonb not null default '[]'::jsonb,  -- snapshot of billed lines
  status        text not null default 'draft',       -- 'draft' | 'sent'
  sent_at       timestamptz,
  created_at    timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- AUDIT LOG — every meaningful action. Gated behind logs.view permission in UI.
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  company_id  uuid references public.companies(id) on delete cascade,
  actor_id    uuid references public.users(id) on delete set null,
  actor_email text,
  action      text not null,            -- e.g. 'job.create', 'invoice.send'
  entity      text,                     -- e.g. 'job', 'item'
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz default now()
);

create index on public.audit_log (company_id, created_at desc);
create index on public.jobs (company_id, status);
create index on public.punches (job_id) where ended_at is null;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Every table is company-scoped. A helper reads the caller's company_id from
-- their users row. Superadmin bypasses via is_superadmin.
-- ----------------------------------------------------------------------------
alter table public.companies  enable row level security;
alter table public.roles      enable row level security;
alter table public.users      enable row level security;
alter table public.workers    enable row level security;
alter table public.items      enable row level security;
alter table public.jobs       enable row level security;
alter table public.job_workers enable row level security;
alter table public.job_items  enable row level security;
alter table public.job_costs  enable row level security;
alter table public.punches    enable row level security;
alter table public.invoices   enable row level security;
alter table public.audit_log  enable row level security;

-- Helper: the company_id of the currently authenticated user
create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.users where id = auth.uid()
$$;

-- Generic company-scoped policy applied to each tenant table
-- (read/write allowed when the row's company matches the caller's company)
do $$
declare t text;
begin
  foreach t in array array[
    'roles','workers','items','jobs','invoices','audit_log'
  ] loop
    execute format($f$
      create policy %1$s_company_all on public.%1$s
        for all using (company_id = public.current_company_id())
        with check (company_id = public.current_company_id());
    $f$, t);
  end loop;
end $$;

-- users: a caller can see users in their own company; can update only their own
-- profile (theme) unless they have admin rights enforced in the app layer.
create policy users_company_select on public.users
  for select using (company_id = public.current_company_id());
create policy users_self_update on public.users
  for update using (id = auth.uid());

-- companies: caller sees only their own company
create policy companies_self on public.companies
  for all using (id = public.current_company_id())
  with check (id = public.current_company_id());

-- child tables (job_workers, job_items, job_costs, punches) are reached via job
create policy job_workers_via_job on public.job_workers for all
  using (exists (select 1 from public.jobs j where j.id = job_id and j.company_id = public.current_company_id()))
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.company_id = public.current_company_id()));
create policy job_items_via_job on public.job_items for all
  using (exists (select 1 from public.jobs j where j.id = job_id and j.company_id = public.current_company_id()))
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.company_id = public.current_company_id()));
create policy job_costs_via_job on public.job_costs for all
  using (exists (select 1 from public.jobs j where j.id = job_id and j.company_id = public.current_company_id()))
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.company_id = public.current_company_id()));
create policy punches_company on public.punches for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
