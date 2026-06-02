-- ============================================================================
-- 0010 — Performance indexes
--
-- The initial schema indexed the hot paths it knew about (open punches by job,
-- audit log by company/date, jobs by company/status, users by clerk id). As the
-- app's most-used screens (dashboard hours, job detail billing, the list pages)
-- read more rows, these fill the remaining gaps. All are additive and safe to
-- run on a live database; `if not exists` makes the migration idempotent.
-- ============================================================================

-- Dashboard aggregates per-employee hours; billing reads every punch for a job.
create index if not exists idx_punches_employee on public.punches (employee_id);
create index if not exists idx_punches_job on public.punches (job_id);
-- Date-windowed punch rollups (e.g. "hours this week") scan by company + time.
create index if not exists idx_punches_company_started on public.punches (company_id, started_at desc);

-- Invoice list orders newest-first within a company.
create index if not exists idx_invoices_company_created on public.invoices (company_id, created_at desc);
-- Job detail loads the invoices generated for a job.
create index if not exists idx_invoices_job on public.invoices (job_id);

-- Job detail joins items/costs by their parent job.
create index if not exists idx_job_items_job on public.job_items (job_id);
create index if not exists idx_job_costs_job on public.job_costs (job_id);

-- Company-scoped list pages (inventory, employees) filter by company_id.
create index if not exists idx_items_company on public.items (company_id);
create index if not exists idx_employees_company on public.employees (company_id);

-- ensureProfile claims a pre-provisioned row by email on first sign-in.
create index if not exists idx_users_lower_email on public.users (lower(email));
