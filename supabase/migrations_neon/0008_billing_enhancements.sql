-- ============================================================================
-- BuildLedger — Migration 0008: billing enhancements
-- Adds: per-company sequential invoice numbering + invoice payment tracking.
-- Run after 0007.
-- ============================================================================

-- Per-company monotonic counter for human-friendly, collision-free invoice
-- numbers (INV-000001, INV-000002, ...). Seeded from the current invoice count
-- so it never reuses an existing number.
alter table public.companies
  add column if not exists invoice_seq integer not null default 0;

update public.companies c
  set invoice_seq = greatest(
    c.invoice_seq,
    coalesce((select count(*) from public.invoices i where i.company_id = c.id), 0)
  );

-- Payment tracking: when an invoice was marked paid.
alter table public.invoices
  add column if not exists paid_at timestamptz;
