-- ============================================================================
-- 0012 — jobs.updated_at
--
-- updateJob has always written `updated_at = now()`, but the column was never
-- created (0001 gave jobs only created_at). On a database without it, saving a
-- job edit failed with: column "updated_at" of relation "jobs" does not exist.
--
-- Add the column the code expects. Backfill existing rows from created_at so the
-- value is sensible from day one. Additive and idempotent.
-- ============================================================================

alter table public.jobs add column if not exists updated_at timestamptz;
update public.jobs set updated_at = coalesce(updated_at, created_at, now());
alter table public.jobs alter column updated_at set default now();
