-- ============================================================================
-- 0017 — Job chat pro: delivery + read receipts, reactions, replies, edits
--
-- Builds on 0015 (job_chats / participants / messages). Adds:
--   • per-participant read + presence state (drives delivery ✓✓ and read ticks,
--     unread counts, "seen by", typing indicators)
--   • message edit / delete (tombstone) / reply-to
--   • emoji reactions
--
-- All additive and idempotent — safe to run on a live database.
-- ============================================================================

-- Per-participant state on each chat.
alter table public.job_chat_participants add column if not exists last_read_at timestamptz;
alter table public.job_chat_participants add column if not exists last_seen_at timestamptz;
alter table public.job_chat_participants add column if not exists typing_at   timestamptz;

-- Message lifecycle + threading.
alter table public.job_chat_messages add column if not exists edited_at  timestamptz;
alter table public.job_chat_messages add column if not exists deleted_at timestamptz;
alter table public.job_chat_messages add column if not exists reply_to_id uuid references public.job_chat_messages(id) on delete set null;

-- Emoji reactions (one row per person per emoji per message).
create table if not exists public.job_chat_reactions (
  message_id uuid not null references public.job_chat_messages(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists idx_job_chat_reactions_msg on public.job_chat_reactions (message_id);
