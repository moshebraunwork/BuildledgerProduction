-- ============================================================================
-- 0018 — Important alerts + scheduled chat messages
--
--   • important messages: flagged chat messages that pop an app-wide banner for
--     every recipient until each dismisses it (per-user dismissals).
--   • scheduled messages: queued in job_chat_scheduled and released into the
--     chat when due (lazily, on the next poll by any active user).
--
-- All additive and idempotent — safe to run on a live database.
-- ============================================================================

alter table public.job_chat_messages add column if not exists important boolean not null default false;

-- Per-user dismissal of an important message's banner.
create table if not exists public.job_chat_alert_dismissals (
  message_id   uuid not null references public.job_chat_messages(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  dismissed_at timestamptz default now(),
  primary key (message_id, user_id)
);

-- Messages queued to send later. Released into job_chat_messages once due.
create table if not exists public.job_chat_scheduled (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  chat_id      uuid not null references public.job_chats(id) on delete cascade,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  sender_id    uuid references public.users(id) on delete set null,
  body         text not null default '',
  file_url     text,
  file_name    text,
  file_type    text,
  file_size    bigint,
  reply_to_id  uuid,
  important    boolean not null default false,
  scheduled_at timestamptz not null,
  created_at   timestamptz default now()
);

create index if not exists idx_job_chat_scheduled_due on public.job_chat_scheduled (company_id, scheduled_at);
create index if not exists idx_job_chat_messages_important on public.job_chat_messages (chat_id) where important;
