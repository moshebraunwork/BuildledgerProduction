-- ============================================================================
-- 0011 — Richer audit log context
--
-- The activity log recorded *who* (by id/email) and *what* (action/entity), but
-- nothing about the request itself, and the actor's display name was only
-- resolvable by joining back to users (which loses the name once a user is
-- deleted). These columns make every entry self-describing and let the log show
-- the person's name, the device/browser, and the originating IP for security
-- review (e.g. spotting a sign-in from an unexpected location).
--
-- All additive and idempotent — safe to run on a live database.
-- ============================================================================

alter table public.audit_log add column if not exists actor_name text;
alter table public.audit_log add column if not exists ip_address text;
alter table public.audit_log add column if not exists user_agent text;

-- The activity-log page filters/sorts by actor; help those lookups.
create index if not exists idx_audit_log_actor on public.audit_log (company_id, actor_id, created_at desc);
create index if not exists idx_audit_log_action on public.audit_log (company_id, action, created_at desc);
