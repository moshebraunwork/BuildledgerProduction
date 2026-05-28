-- ============================================================================
-- BuildLedger — Migration 0005: job notes + invoice extra fields
-- Adds: job_notes table, invoices.file_name, invoices.due_date, invoices.notes
-- Run after 0004.
-- ============================================================================

-- Rich-text notes per job (one row per job)
create table if not exists public.job_notes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  body_html   text not null default '',
  updated_at  timestamptz default now(),
  updated_by  uuid references public.users(id) on delete set null,
  unique (job_id)
);

-- Invoice: optional human-readable file name + due date + payment notes
alter table public.invoices
  add column if not exists file_name  text,
  add column if not exists due_date   date,
  add column if not exists notes      text;
