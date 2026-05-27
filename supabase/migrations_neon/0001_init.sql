-- ============================================================================
-- BuildLedger — Neon schema (migrated from Supabase)
-- Differences from the Supabase version:
--   * users.id is a plain uuid (no auth.users FK); users.clerk_user_id links to Clerk
--   * NO row-level security / policies (all DB access is server-side only)
--   * NO storage tables (Cloudflare R2 handles files)
-- Run this in the Neon SQL editor (or via psql) first.
-- ============================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  invoice_from  text,
  default_rate  numeric(10,2) default 85.00,
  tax_rate      numeric(5,4)  default 0.0000,
  created_at    timestamptz default now()
);

create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name         text not null,
  permissions  jsonb not null default '{}'::jsonb,
  is_system    boolean not null default false,
  created_at   timestamptz default now(),
  unique (company_id, name)
);

-- users: linked to Clerk via clerk_user_id (set on first sign-in by bootstrap code)
create table public.users (
  id            uuid primary key default gen_random_uuid(),
  clerk_user_id text unique,
  company_id    uuid not null references public.companies(id) on delete cascade,
  email         text not null,
  full_name     text,
  role_id       uuid references public.roles(id) on delete set null,
  is_superadmin boolean not null default false,
  is_active     boolean not null default true,
  pay_rate      numeric(10,2) default 0,
  theme         text default 'system',
  created_at    timestamptz default now()
);

create table public.workers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  name        text not null,
  role_title  text,
  phone       text,
  pay_rate    numeric(10,2) default 0,
  require_punch_photo boolean not null default false,
  created_at  timestamptz default now()
);

create table public.items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  cost          numeric(10,2) not null default 0,
  charge        numeric(10,2) not null default 0,
  source        text,
  stock         integer not null default 0,
  low_threshold integer not null default 0,
  created_at    timestamptz default now()
);

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
  billing_rate   numeric(10,2),
  status         text not null default 'scheduled',
  require_punch_photo boolean not null default false,
  created_at     timestamptz default now()
);

create table public.job_workers (
  job_id    uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  primary key (job_id, worker_id)
);

create table public.job_items (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  item_id     uuid references public.items(id) on delete set null,
  name        text not null,
  qty         integer not null default 1,
  cost        numeric(10,2) not null default 0,
  charge      numeric(10,2) not null default 0,
  excluded    boolean not null default false
);

create table public.job_costs (
  id        uuid primary key default gen_random_uuid(),
  job_id    uuid not null references public.jobs(id) on delete cascade,
  label     text not null,
  cost      numeric(10,2) not null default 0,
  charge    numeric(10,2) not null default 0,
  excluded  boolean not null default false
);

create table public.punches (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id     uuid not null references public.jobs(id) on delete cascade,
  worker_id  uuid not null references public.workers(id) on delete cascade,
  kind       text not null default 'site',
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  note       text,
  started_photo_url text,
  ended_photo_url   text,
  edited_by  uuid references public.users(id) on delete set null,
  edited_at  timestamptz
);

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
  line_items    jsonb not null default '[]'::jsonb,
  status        text not null default 'draft',
  sent_at       timestamptz,
  created_at    timestamptz default now()
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  company_id  uuid references public.companies(id) on delete cascade,
  actor_id    uuid references public.users(id) on delete set null,
  actor_email text,
  action      text not null,
  entity      text,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz default now()
);

create index on public.audit_log (company_id, created_at desc);
create index on public.jobs (company_id, status);
create index on public.punches (job_id) where ended_at is null;
create index on public.users (clerk_user_id);
