-- ============================================================================
-- BuildLedger — Punch enhancements: notes, photos, and photo requirements
-- Run AFTER 0001_init.sql and 0002_seed.sql.
-- ============================================================================

-- Add note + photo columns to punches.
-- A punch can carry a note and up to two photos: one at clock-in, one at clock-out.
alter table public.punches
  add column if not exists note            text,
  add column if not exists started_photo_url text,
  add column if not exists ended_photo_url   text,
  add column if not exists edited_by        uuid references public.users(id) on delete set null,
  add column if not exists edited_at        timestamptz;

-- Photo requirement can be set per worker and/or per job.
-- A photo is required for a punch if EITHER the worker OR the job requires it.
alter table public.workers
  add column if not exists require_punch_photo boolean not null default false;

alter table public.jobs
  add column if not exists require_punch_photo boolean not null default false;

-- ----------------------------------------------------------------------------
-- STORAGE — bucket for punch photos.
-- Files are stored in Supabase Storage, not in the database.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('punch-photos', 'punch-photos', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload and read punch photos.
-- (Bucket is public-read so photos render in the app and on records; uploads
-- require an authenticated session.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'punch_photos_insert'
  ) then
    create policy punch_photos_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'punch-photos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'punch_photos_select'
  ) then
    create policy punch_photos_select on storage.objects
      for select to authenticated
      using (bucket_id = 'punch-photos');
  end if;
end $$;
