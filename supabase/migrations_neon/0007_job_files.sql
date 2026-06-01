-- ============================================================================
-- BuildLedger — Migration 0007: job files / media attachments
-- Adds: job_files table for user-uploaded images, videos and documents per job.
-- Run after 0006.
-- ============================================================================

create table if not exists public.job_files (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  name         text not null,
  url          text not null,
  content_type text,
  size_bytes   bigint,
  kind         text not null default 'file',   -- 'image' | 'video' | 'file'
  uploaded_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz default now()
);

create index if not exists job_files_job_idx on public.job_files (job_id);
