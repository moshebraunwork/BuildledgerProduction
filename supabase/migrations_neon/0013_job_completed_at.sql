-- ============================================================================
-- 0013 — jobs.completed_at
--
-- Records WHEN a job was marked complete (the AI can confirm a job is complete
-- but couldn't say when). A trigger keeps it correct no matter which code path
-- changes the status: set to now() when status becomes 'complete', cleared if it
-- moves back to scheduled/active. Additive and idempotent.
-- ============================================================================

alter table public.jobs add column if not exists completed_at timestamptz;

-- Backfill: jobs already complete get a best-effort timestamp from updated_at
-- (added in 0012) or created_at, so existing complete jobs aren't left null.
update public.jobs
  set completed_at = coalesce(updated_at, created_at, now())
  where status = 'complete' and completed_at is null;

create or replace function public.set_job_completed_at() returns trigger as $$
begin
  if new.status = 'complete' and (TG_OP = 'INSERT' or old.status is distinct from 'complete') then
    new.completed_at := now();
  elsif new.status is distinct from 'complete' then
    new.completed_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_job_completed_at on public.jobs;
create trigger trg_job_completed_at
  before insert or update on public.jobs
  for each row execute function public.set_job_completed_at();
