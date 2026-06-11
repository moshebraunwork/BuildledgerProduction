-- Per-job chat system, replacing the single shared job note.
--
-- job_chats: one conversation on one job between a fixed set of users.
-- participants_key is the sorted, comma-joined list of participant user ids;
-- the unique (job_id, participants_key) constraint guarantees the same group
-- of people can only ever have ONE chat per job — creating it again resolves
-- to the existing conversation.
--
-- Access model (enforced in the app layer): chat participants see their own
-- chats; admins (superadmin or admin-area access) see every chat.

create table if not exists public.job_chats (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  job_id           uuid not null references public.jobs(id) on delete cascade,
  participants_key text not null,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz default now(),
  last_message_at  timestamptz default now(),
  unique (job_id, participants_key)
);

create table if not exists public.job_chat_participants (
  chat_id  uuid not null references public.job_chats(id) on delete cascade,
  user_id  uuid not null references public.users(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (chat_id, user_id)
);

create table if not exists public.job_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  chat_id    uuid not null references public.job_chats(id) on delete cascade,
  sender_id  uuid references public.users(id) on delete set null,
  body       text not null default '',
  file_url   text,
  file_name  text,
  file_type  text,
  file_size  bigint,
  created_at timestamptz default now()
);

create index if not exists idx_job_chats_job on public.job_chats (job_id, last_message_at desc);
create index if not exists idx_job_chat_participants_user on public.job_chat_participants (user_id);
create index if not exists idx_job_chat_messages_chat_created on public.job_chat_messages (chat_id, created_at);

-- Chat attachments also appear in the job's media section, but only for users
-- with access to that chat. The link column is how media queries filter them:
-- chat_id null = a regular job file everyone with media.view can see.
alter table public.job_files add column if not exists chat_id uuid references public.job_chats(id) on delete cascade;
