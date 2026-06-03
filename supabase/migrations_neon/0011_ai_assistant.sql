-- ============================================================================
-- 0011 — Ask AI assistant
--
-- Stores each user's private chat with the read-only "Ask AI" assistant. One
-- rolling conversation per user (no threads); "Clear chat" deletes their rows.
-- Messages are scoped to the company and the user, so everyone only ever sees
-- their own conversation.
--
-- Also grants the new `ai.use` permission to every existing role so the feature
-- is available by default (admins can untick it per role afterwards). Superadmin
-- bypasses permission checks regardless.
-- ============================================================================

create table if not exists public.ai_messages (
  id          bigint generated always as identity primary key,
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz default now()
);

-- The chat loads a user's messages newest-relevant, oldest-first; this serves both.
create index if not exists idx_ai_messages_user on public.ai_messages (user_id, created_at);

-- Default the feature on for all existing roles.
update public.roles set permissions = coalesce(permissions, '{}'::jsonb) || '{"ai.use": true}'::jsonb;
