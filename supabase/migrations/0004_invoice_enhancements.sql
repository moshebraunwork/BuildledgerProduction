-- Invoice enhancements: notes, due date, and company logo
alter table public.invoices add column if not exists notes text;
alter table public.invoices add column if not exists due_date date;
alter table public.companies add column if not exists logo_url text;
