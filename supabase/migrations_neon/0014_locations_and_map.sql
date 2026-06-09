-- ============================================================================
-- 0014 — Live locations & map
--
-- Adds the data behind the Map page:
--  • users gain their last-known device location (refreshed periodically while
--    they use the app), so the map can show where people are.
--  • roles gain `require_location` — members of such a role must allow location
--    to use the app and are tracked on the map.
--  • two new permissions: map.view (see the map) and map.employees (see people
--    on it). map.view is granted to all existing roles; map.employees only to
--    admin-capable roles by default (admins can grant it to others).
--
-- All additive and idempotent.
-- ============================================================================

alter table public.users
  add column if not exists last_lat numeric(9,6),
  add column if not exists last_lng numeric(9,6),
  add column if not exists last_location_at timestamptz,
  add column if not exists location_accuracy numeric;

alter table public.roles
  add column if not exists require_location boolean not null default false;

-- Everyone can view the map…
update public.roles
  set permissions = coalesce(permissions, '{}'::jsonb) || '{"map.view": true}'::jsonb;

-- …but only admin-capable roles see employee locations by default.
update public.roles
  set permissions = permissions || '{"map.employees": true}'::jsonb
  where coalesce((permissions ->> 'admin.view')::boolean, false) = true;
