-- Migration 0006: company contact email
alter table public.companies
  add column if not exists contact_email text;
