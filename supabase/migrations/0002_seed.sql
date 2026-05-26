-- ============================================================================
-- BuildLedger — Seed / bootstrap
-- Run AFTER 0001_init.sql. Creates the company, a built-in Administrator role,
-- and some sample data so the app isn't empty on first login.
--
-- NOTE: The actual superadmin USER row is created automatically the first time
-- you log in with the email set in SUPPORT_ADMIN_EMAIL (handled in app code,
-- see src/lib/bootstrap.ts). This file only sets up company + roles + samples.
-- ============================================================================

-- One company (this client). Grab its id for the inserts below.
insert into public.companies (id, name, invoice_from, default_rate, tax_rate)
values ('00000000-0000-0000-0000-000000000001', 'BuildLedger Construction', 'BuildLedger Construction', 85.00, 0.0875)
on conflict (id) do nothing;

-- Built-in Administrator role: every permission true. Cannot be deleted (is_system).
-- The full permission catalog lives in app code (src/lib/permissions.ts); the
-- Administrator role is granted all of them here as an object of true flags.
insert into public.roles (id, company_id, name, permissions, is_system)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001',
  'Administrator',
  '{
    "dashboard.view": true,
    "jobs.view": true, "jobs.edit": true, "jobs.delete": true,
    "inventory.view": true, "inventory.edit": true, "inventory.delete": true,
    "workers.view": true, "workers.edit": true, "workers.delete": true,
    "punches.manage": true,
    "invoices.view": true, "invoices.create": true, "invoices.send": true,
    "admin.view": true, "admin.users": true, "admin.roles": true, "admin.company": true,
    "logs.view": true
  }'::jsonb,
  true
)
on conflict (id) do nothing;

-- A sample non-admin role to demonstrate custom roles (Office staff)
insert into public.roles (company_id, name, permissions, is_system)
values (
  '00000000-0000-0000-0000-000000000001',
  'Office',
  '{
    "dashboard.view": true,
    "jobs.view": true, "jobs.edit": true,
    "inventory.view": true, "inventory.edit": true,
    "workers.view": true,
    "invoices.view": true, "invoices.create": true, "invoices.send": true
  }'::jsonb,
  false
)
on conflict do nothing;

-- Sample workers
insert into public.workers (company_id, name, role_title, phone, pay_rate) values
  ('00000000-0000-0000-0000-000000000001', 'Mike Reyes',   'Foreman',   '555-0101', 42.00),
  ('00000000-0000-0000-0000-000000000001', 'Dana Cole',    'Carpenter', '555-0102', 34.00),
  ('00000000-0000-0000-0000-000000000001', 'Sam Whitfield','Laborer',   '555-0103', 26.00)
on conflict do nothing;

-- Sample inventory
insert into public.items (company_id, name, cost, charge, source, stock, low_threshold) values
  ('00000000-0000-0000-0000-000000000001', '2x4 Lumber (8ft)', 4.20, 9.00, 'Home Depot', 120, 30),
  ('00000000-0000-0000-0000-000000000001', 'Drywall Sheet 4x8', 12.50, 26.00, 'Lowe''s', 40, 10),
  ('00000000-0000-0000-0000-000000000001', 'Box of Screws (100)', 6.75, 15.00, 'https://example.com/screws', 25, 8)
on conflict do nothing;
