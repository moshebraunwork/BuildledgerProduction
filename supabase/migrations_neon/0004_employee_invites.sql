-- ============================================================================
-- BuildLedger — Migration 0004: employee system invitations
-- Adds columns to track Clerk invitations for employees who should be able to
-- log into the system. Run after 0003.
-- ============================================================================

alter table public.employees
  add column if not exists invite_email         text,
  add column if not exists invite_status        text,   -- null | 'pending' | 'accepted' | 'revoked'
  add column if not exists clerk_invitation_id  text;

-- When an invited employee accepts and signs in, their Clerk user id can be
-- linked back so we know which login maps to which employee record.
alter table public.employees
  add column if not exists clerk_user_id text;
