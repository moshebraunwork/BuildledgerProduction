-- Job geolocation, used by the mobile self-service clock-in flow to
-- auto-detect which job a worker is standing at. Coordinates are seeded from
-- the worker's device the first time someone clocks in on-site (no external
-- geocoding service required); they can be cleared/overwritten later.
--
-- The self-punch flow itself reuses the existing public.punches table — a
-- 'site' punch is the shift, a 'store' punch is a store run. Pausing for a
-- store run closes the open 'site' punch and opens a 'store' punch on the same
-- job; returning does the reverse. No new punch columns are needed.

alter table public.jobs
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6);
