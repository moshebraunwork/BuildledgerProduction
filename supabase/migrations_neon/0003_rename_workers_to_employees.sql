-- ============================================================================
-- BuildLedger — Migration 0003: rename "workers" to "employees" everywhere
-- Run this AFTER 0001_init.sql and 0002_seed.sql (only if you've already run
-- those). For a fresh database that hasn't run those yet, you can instead use
-- the updated 0001/0002 files which already use the new names.
-- ============================================================================

-- Rename the table
alter table public.workers rename to employees;

-- Rename foreign-key columns
alter table public.job_workers rename column worker_id to employee_id;
alter table public.job_workers rename to job_employees;

alter table public.punches rename column worker_id to employee_id;

-- (Optional) update any existing role permissions JSON that referenced "workers.*"
update public.roles
set permissions = (
  permissions
    - 'workers.view' - 'workers.edit' - 'workers.delete'
)
   ||
  case
    when permissions ? 'workers.view'   then jsonb_build_object('employees.view',   permissions->'workers.view')   else '{}'::jsonb end
   ||
  case
    when permissions ? 'workers.edit'   then jsonb_build_object('employees.edit',   permissions->'workers.edit')   else '{}'::jsonb end
   ||
  case
    when permissions ? 'workers.delete' then jsonb_build_object('employees.delete', permissions->'workers.delete') else '{}'::jsonb end;
