"use server";

// ============================================================================
// Per-job chat — conversations between a fixed set of users on a job.
//
// 0015 gave us chats / participants / messages + admin visibility + media
// mirroring. 0017 ("chat pro") adds delivery + read receipts, reactions,
// replies, edits and tombstone deletes. Every new column/table is read through
// a try/catch fallback so the chat still works before 0017 is applied.
// ============================================================================

import { sql } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditUser } from "@/lib/audit";

export interface ChatSummary {
  id: string;
  participants: { id: string; name: string }[];
  isParticipant: boolean;
  unread: number;
  lastMessage: { body: string; fileName: string | null; sender: string | null; createdAt: string; deleted: boolean } | null;
  createdAt: string;
}

export interface ChatReaction { emoji: string; count: number; mine: boolean; names: string[]; }
export interface ReplyPreview { id: string; sender: string | null; body: string; fileName: string | null; deleted: boolean; }

export interface ChatMessage {
  id: string;
  body: string;
  fileUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  senderId: string | null;
  senderName: string | null;
  mine: boolean;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  important: boolean;
  replyTo: ReplyPreview | null;
  reactions: ChatReaction[];
}

export interface ScheduledMessage {
  id: string;
  body: string;
  fileName: string | null;
  important: boolean;
  scheduledAt: string;
}

export interface ImportantAlert {
  id: string;
  body: string;
  fileName: string | null;
  senderName: string | null;
  jobId: string;
  jobTitle: string | null;
  chatId: string;
  createdAt: string;
}

export interface ChatParticipantState {
  id: string;
  name: string;
  lastReadAt: string | null;
  lastSeenAt: string | null;
}

export interface ChatSync {
  messages: ChatMessage[];
  participants: ChatParticipantState[];
  typing: { id: string; name: string }[];
  scheduled: ScheduledMessage[];
  me: string;
}

// Admins see (and can write in) every chat; everyone else only their own.
function isChatAdmin(user: CurrentUser) {
  return user.isSuperadmin || can(user.isSuperadmin, user.permissions, "admin.view");
}

async function jobInCompany(jobId: string, companyId: string) {
  const rows = await sql`select 1 from public.jobs where id = ${jobId} and company_id = ${companyId} limit 1`;
  return rows.length > 0;
}

// Resolve a chat the caller may access (participant or admin), tenant-scoped.
async function chatForUser(chatId: string, user: CurrentUser) {
  const rows = await sql`
    select c.id, c.job_id,
      exists (select 1 from public.job_chat_participants p where p.chat_id = c.id and p.user_id = ${user.id}) as is_participant
    from public.job_chats c
    where c.id = ${chatId} and c.company_id = ${user.companyId}
      and (
        ${isChatAdmin(user)}
        or exists (select 1 from public.job_chat_participants p where p.chat_id = c.id and p.user_id = ${user.id})
      )
    limit 1
  `;
  return (rows[0] as { id: string; job_id: string; is_participant: boolean } | undefined) ?? null;
}

function isMissingSchema(e: unknown) {
  const m = String((e as any)?.message ?? "");
  return /relation .* does not exist/i.test(m) || /column .* does not exist/i.test(m);
}
function isMissingTable(e: unknown) {
  return /relation .* does not exist/i.test(String((e as any)?.message ?? ""));
}

// Release any due scheduled messages for a company into their chats. Runs
// lazily on the next poll by any active user (no background worker needed).
// Guarded so it's a no-op before 0018 is applied.
async function releaseDueScheduled(companyId: string) {
  try {
    const due = (await sql`
      select id, chat_id, job_id, sender_id, body, file_url, file_name, file_type, file_size, reply_to_id, important
      from public.job_chat_scheduled
      where company_id = ${companyId} and scheduled_at <= now()
      order by scheduled_at asc limit 200
    `) as any[];
    for (const s of due) {
      const ins = (await sql`
        insert into public.job_chat_messages
          (company_id, chat_id, sender_id, body, file_url, file_name, file_type, file_size, reply_to_id, important)
        values (${companyId}, ${s.chat_id}, ${s.sender_id}, ${s.body}, ${s.file_url}, ${s.file_name},
                ${s.file_type}, ${s.file_size}, ${s.reply_to_id}, ${s.important})
        returning id
      `) as any[];
      if (s.file_url) {
        const type = s.file_type ?? "";
        const kind = type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : "file";
        await sql`
          insert into public.job_files (company_id, job_id, name, url, content_type, size_bytes, kind, uploaded_by, chat_id)
          values (${companyId}, ${s.job_id}, ${(s.file_name || "file")}, ${s.file_url}, ${s.file_type}, ${s.file_size}, ${kind}, ${s.sender_id}, ${s.chat_id})
        `;
      }
      await sql`update public.job_chats set last_message_at = now() where id = ${s.chat_id}`;
      await sql`delete from public.job_chat_scheduled where id = ${s.id}`;
      void ins;
    }
  } catch { /* pre-0018 or transient — safe to skip */ }
}

// Active company members the caller can start a chat with.
export async function listChatUsers() {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  const rows = await sql`
    select id, full_name, email from public.users
    where company_id = ${user.companyId} and is_active = true and id <> ${user.id}
    order by coalesce(full_name, email)
  `;
  return { data: (rows as any[]).map((r) => ({ id: r.id as string, name: (r.full_name || r.email) as string })) };
}

// All chats on a job that the caller may see, newest activity first.
export async function listJobChats(jobId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!(await jobInCompany(jobId, user.companyId))) return { error: "Not found" };
  const admin = isChatAdmin(user);
  await releaseDueScheduled(user.companyId);
  // Presence: being on the job's chat list marks my participant rows "seen", so
  // others' messages show as delivered (✓✓) even before I open the thread.
  try {
    await sql`
      update public.job_chat_participants set last_seen_at = now()
      where user_id = ${user.id}
        and chat_id in (select id from public.job_chats where job_id = ${jobId} and company_id = ${user.companyId})
    `;
  } catch { /* pre-0017 */ }
  try {
    return await runListJobChats(jobId, user, admin, true);
  } catch (e) {
    if (isMissingSchema(e)) {
      try {
        return await runListJobChats(jobId, user, admin, false);
      } catch (e2) {
        if (isMissingTable(e2)) return { data: [] as ChatSummary[], unavailable: true };
        throw e2;
      }
    }
    if (isMissingTable(e)) return { data: [] as ChatSummary[], unavailable: true };
    throw e;
  }
}

async function runListJobChats(jobId: string, user: CurrentUser, admin: boolean, pro: boolean) {
  // Neon's tagged template can't compose nested fragments, so the two shapes are
  // written out in full.
  const rows = pro
    ? await sql`
        select c.id, c.created_at, c.last_message_at,
          (select json_agg(json_build_object('id', u.id, 'name', coalesce(u.full_name, u.email))
                           order by coalesce(u.full_name, u.email))
             from public.job_chat_participants p
             join public.users u on u.id = p.user_id
            where p.chat_id = c.id) as participants,
          (select json_build_object('body', m.body, 'fileName', m.file_name, 'createdAt', m.created_at,
                                    'sender', coalesce(su.full_name, su.email),
                                    'deleted', (m.deleted_at is not null))
             from public.job_chat_messages m
             left join public.users su on su.id = m.sender_id
            where m.chat_id = c.id
            order by m.created_at desc limit 1) as last_message,
          exists (select 1 from public.job_chat_participants p2
                   where p2.chat_id = c.id and p2.user_id = ${user.id}) as is_participant,
          (select count(*)::int from public.job_chat_messages mm
             left join public.job_chat_participants pp on pp.chat_id = c.id and pp.user_id = ${user.id}
            where mm.chat_id = c.id and mm.sender_id is distinct from ${user.id}
              and mm.deleted_at is null
              and (pp.last_read_at is null or mm.created_at > pp.last_read_at)) as unread
        from public.job_chats c
        where c.job_id = ${jobId} and c.company_id = ${user.companyId}
          and (${admin} or exists (select 1 from public.job_chat_participants p3
                                    where p3.chat_id = c.id and p3.user_id = ${user.id}))
        order by c.last_message_at desc
      `
    : await sql`
        select c.id, c.created_at, c.last_message_at,
          (select json_agg(json_build_object('id', u.id, 'name', coalesce(u.full_name, u.email))
                           order by coalesce(u.full_name, u.email))
             from public.job_chat_participants p
             join public.users u on u.id = p.user_id
            where p.chat_id = c.id) as participants,
          (select json_build_object('body', m.body, 'fileName', m.file_name, 'createdAt', m.created_at,
                                    'sender', coalesce(su.full_name, su.email), 'deleted', false)
             from public.job_chat_messages m
             left join public.users su on su.id = m.sender_id
            where m.chat_id = c.id
            order by m.created_at desc limit 1) as last_message,
          exists (select 1 from public.job_chat_participants p2
                   where p2.chat_id = c.id and p2.user_id = ${user.id}) as is_participant,
          0 as unread
        from public.job_chats c
        where c.job_id = ${jobId} and c.company_id = ${user.companyId}
          and (${admin} or exists (select 1 from public.job_chat_participants p3
                                    where p3.chat_id = c.id and p3.user_id = ${user.id}))
        order by c.last_message_at desc
      `;
  const data: ChatSummary[] = (rows as any[]).map((c) => ({
    id: c.id,
    participants: c.participants ?? [],
    isParticipant: !!c.is_participant,
    unread: Number(c.unread) || 0,
    lastMessage: c.last_message
      ? {
          body: c.last_message.body ?? "",
          fileName: c.last_message.fileName ?? null,
          sender: c.last_message.sender ?? null,
          createdAt: c.last_message.createdAt,
          deleted: !!c.last_message.deleted,
        }
      : null,
    createdAt: c.created_at,
  }));
  return { data };
}

export async function createJobChat(jobId: string, participantIds: string[]) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!(await jobInCompany(jobId, user.companyId))) return { error: "Not found" };

  const ids = Array.from(new Set([user.id, ...participantIds]));
  if (ids.length < 2) return { error: "Pick at least one other person to chat with." };

  const valid = await sql`
    select id from public.users
    where company_id = ${user.companyId} and is_active = true
      and id::text = any(string_to_array(${ids.join(",")}, ','))
  `;
  if (valid.length !== ids.length) return { error: "One of the selected people isn't an active member of your company." };

  const key = [...ids].sort().join(",");
  try {
    const inserted = await sql`
      insert into public.job_chats (company_id, job_id, participants_key, created_by)
      values (${user.companyId}, ${jobId}, ${key}, ${user.id})
      on conflict (job_id, participants_key) do nothing
      returning id
    `;
    const existing = inserted.length === 0;
    let chatId = inserted[0]?.id as string | undefined;
    if (!chatId) {
      const found = await sql`select id from public.job_chats where job_id = ${jobId} and participants_key = ${key} limit 1`;
      chatId = found[0]?.id;
    }
    if (!chatId) return { error: "Couldn't create the chat. Please try again." };

    if (!existing) {
      for (const uid of ids) {
        await sql`insert into public.job_chat_participants (chat_id, user_id) values (${chatId}, ${uid}) on conflict do nothing`;
      }
      await auditUser(user, { action: "chat.create", entity: "job", entityId: jobId, detail: { chatId, participants: ids.length } });
    }
    return { data: { id: chatId, existing } };
  } catch (e) {
    if (isMissingTable(e)) return { error: "Chat isn't set up yet — the database migration 0015_job_chats.sql hasn't been applied." };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Sync: fetch messages + participant read/presence state + typing, and refresh
// my own presence (last_seen_at) so others' messages flip to "delivered".
// This is what the open thread polls.
// ---------------------------------------------------------------------------
export async function syncChat(chatId: string): Promise<{ data?: ChatSync; error?: string; unavailable?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  const chat = await chatForUser(chatId, user);
  if (!chat) return { error: "Not found" };

  await releaseDueScheduled(user.companyId);

  // Best-effort presence heartbeat (0017). Admins peeking aren't participants.
  if (chat.is_participant) {
    try { await sql`update public.job_chat_participants set last_seen_at = now() where chat_id = ${chatId} and user_id = ${user.id}`; } catch { /* pre-0017 */ }
  }

  // Messages (rich → basic fallback).
  let msgRows: any[];
  let pro = true;
  try {
    msgRows = (await sql`
      select m.id, m.body, m.file_url, m.file_name, m.file_type, m.file_size, m.created_at,
             m.edited_at, m.deleted_at, m.sender_id, coalesce(u.full_name, u.email) as sender_name,
             m.reply_to_id, r.body as reply_body, r.file_name as reply_file_name,
             (r.deleted_at is not null) as reply_deleted, coalesce(ru.full_name, ru.email) as reply_sender
      from public.job_chat_messages m
      left join public.users u on u.id = m.sender_id
      left join public.job_chat_messages r on r.id = m.reply_to_id
      left join public.users ru on ru.id = r.sender_id
      where m.chat_id = ${chatId}
      order by m.created_at desc limit 500
    `) as any[];
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
    pro = false;
    msgRows = (await sql`
      select m.id, m.body, m.file_url, m.file_name, m.file_type, m.file_size, m.created_at,
             m.sender_id, coalesce(u.full_name, u.email) as sender_name
      from public.job_chat_messages m
      left join public.users u on u.id = m.sender_id
      where m.chat_id = ${chatId}
      order by m.created_at desc limit 500
    `) as any[];
  }

  // Reactions for this chat (0017).
  const reactionsByMsg = new Map<string, ChatReaction[]>();
  if (pro) {
    try {
      const rxRows = (await sql`
        select jr.message_id, jr.emoji, jr.user_id, coalesce(u.full_name, u.email) as name
        from public.job_chat_reactions jr
        join public.job_chat_messages m on m.id = jr.message_id
        join public.users u on u.id = jr.user_id
        where m.chat_id = ${chatId}
      `) as any[];
      const tmp = new Map<string, Map<string, { count: number; mine: boolean; names: string[] }>>();
      for (const r of rxRows) {
        if (!tmp.has(r.message_id)) tmp.set(r.message_id, new Map());
        const byEmoji = tmp.get(r.message_id)!;
        if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, { count: 0, mine: false, names: [] });
        const agg = byEmoji.get(r.emoji)!;
        agg.count += 1;
        agg.names.push(r.name);
        if (r.user_id === user.id) agg.mine = true;
      }
      for (const [mid, byEmoji] of tmp) {
        reactionsByMsg.set(mid, [...byEmoji.entries()].map(([emoji, a]) => ({ emoji, count: a.count, mine: a.mine, names: a.names })));
      }
    } catch { /* pre-0017 */ }
  }

  const messages: ChatMessage[] = (msgRows as any[])
    .reverse()
    .map((m) => ({
      id: m.id,
      body: m.deleted_at ? "" : (m.body ?? ""),
      fileUrl: m.deleted_at ? null : (m.file_url ?? null),
      fileName: m.deleted_at ? null : (m.file_name ?? null),
      fileType: m.deleted_at ? null : (m.file_type ?? null),
      fileSize: m.deleted_at ? null : (m.file_size != null ? Number(m.file_size) : null),
      senderId: m.sender_id ?? null,
      senderName: m.sender_name ?? null,
      mine: m.sender_id === user.id,
      createdAt: m.created_at,
      editedAt: m.edited_at ?? null,
      deleted: !!m.deleted_at,
      important: false,
      replyTo: m.reply_to_id
        ? { id: m.reply_to_id, sender: m.reply_sender ?? null, body: m.reply_body ?? "", fileName: m.reply_file_name ?? null, deleted: !!m.reply_deleted }
        : null,
      reactions: reactionsByMsg.get(m.id) ?? [],
    }));

  // Participant read/presence state (0017).
  let participants: ChatParticipantState[] = [];
  let typing: { id: string; name: string }[] = [];
  try {
    const pRows = (await sql`
      select p.user_id as id, coalesce(u.full_name, u.email) as name,
             p.last_read_at, p.last_seen_at, p.typing_at
      from public.job_chat_participants p
      join public.users u on u.id = p.user_id
      where p.chat_id = ${chatId}
    `) as any[];
    participants = pRows.map((p) => ({
      id: p.id, name: p.name,
      lastReadAt: p.last_read_at ?? null,
      lastSeenAt: p.last_seen_at ?? null,
    }));
    const now = Date.now();
    typing = pRows
      .filter((p) => p.id !== user.id && p.typing_at && now - new Date(p.typing_at).getTime() < 6000)
      .map((p) => ({ id: p.id, name: p.name }));
  } catch {
    const pRows = (await sql`
      select p.user_id as id, coalesce(u.full_name, u.email) as name
      from public.job_chat_participants p join public.users u on u.id = p.user_id
      where p.chat_id = ${chatId}
    `) as any[];
    participants = pRows.map((p) => ({ id: p.id, name: p.name, lastReadAt: null, lastSeenAt: null }));
  }

  // Flag important messages (0018) — separate query so the main fetch stays
  // tier-agnostic.
  try {
    const imp = (await sql`select id from public.job_chat_messages where chat_id = ${chatId} and important = true`) as any[];
    const ids = new Set(imp.map((r) => r.id));
    for (const m of messages) if (ids.has(m.id)) m.important = true;
  } catch { /* pre-0018 */ }

  // My own pending scheduled messages for this chat (0018).
  let scheduled: ScheduledMessage[] = [];
  try {
    const sRows = (await sql`
      select id, body, file_name, important, scheduled_at
      from public.job_chat_scheduled
      where chat_id = ${chatId} and sender_id = ${user.id}
      order by scheduled_at asc
    `) as any[];
    scheduled = sRows.map((s) => ({
      id: s.id, body: s.body ?? "", fileName: s.file_name ?? null,
      important: !!s.important, scheduledAt: s.scheduled_at,
    }));
  } catch { /* pre-0018 */ }

  return { data: { messages, participants, typing, scheduled, me: user.id } };
}

// Cancel one of my own scheduled messages before it sends.
export async function cancelScheduledMessage(scheduledId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  try {
    await sql`delete from public.job_chat_scheduled where id = ${scheduledId} and sender_id = ${user.id} and company_id = ${user.companyId}`;
    return { ok: true };
  } catch (e) {
    if (isMissingTable(e)) return { error: "Scheduling needs migration 0018." };
    throw e;
  }
}

// App-wide important alerts: flagged messages in my chats that I haven't
// dismissed (excludes my own). Drives the on-screen banner on every page.
export async function listImportantAlerts(): Promise<{ data: ImportantAlert[] }> {
  const user = await getCurrentUser();
  if (!user) return { data: [] };
  await releaseDueScheduled(user.companyId);
  try {
    const rows = (await sql`
      select m.id, m.body, m.file_name, m.created_at, m.chat_id, c.job_id,
             coalesce(su.full_name, su.email) as sender_name, j.title as job_title
      from public.job_chat_messages m
      join public.job_chats c on c.id = m.chat_id
      join public.jobs j on j.id = c.job_id
      left join public.users su on su.id = m.sender_id
      where m.company_id = ${user.companyId}
        and m.important = true and m.deleted_at is null
        and m.sender_id is distinct from ${user.id}
        and m.created_at > now() - interval '30 days'
        and (${isChatAdmin(user)} or exists (
              select 1 from public.job_chat_participants p where p.chat_id = m.chat_id and p.user_id = ${user.id}))
        and not exists (
              select 1 from public.job_chat_alert_dismissals d where d.message_id = m.id and d.user_id = ${user.id})
      order by m.created_at desc
      limit 20
    `) as any[];
    return {
      data: rows.map((r) => ({
        id: r.id, body: r.body ?? "", fileName: r.file_name ?? null,
        senderName: r.sender_name ?? null, jobId: r.job_id, jobTitle: r.job_title ?? null,
        chatId: r.chat_id, createdAt: r.created_at,
      })),
    };
  } catch {
    return { data: [] };
  }
}

export async function dismissAlert(messageId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  try {
    await sql`insert into public.job_chat_alert_dismissals (message_id, user_id) values (${messageId}, ${user.id}) on conflict do nothing`;
    return { ok: true };
  } catch (e) {
    if (isMissingTable(e)) return { ok: true };
    throw e;
  }
}

// Mark everything in a chat read up to now (called when the thread is open).
export async function markChatRead(chatId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  const chat = await chatForUser(chatId, user);
  if (!chat || !chat.is_participant) return { ok: true };
  try { await sql`update public.job_chat_participants set last_read_at = now(), last_seen_at = now() where chat_id = ${chatId} and user_id = ${user.id}`; } catch { /* pre-0017 */ }
  return { ok: true };
}

// Lightweight typing heartbeat.
export async function setTyping(chatId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const chat = await chatForUser(chatId, user);
  if (!chat || !chat.is_participant) return { ok: true };
  try { await sql`update public.job_chat_participants set typing_at = now() where chat_id = ${chatId} and user_id = ${user.id}`; } catch { /* pre-0017 */ }
  return { ok: true };
}

export async function toggleReaction(messageId: string, emoji: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  const clean = (emoji || "").slice(0, 8);
  if (!clean) return { error: "No emoji" };
  // Resolve the message's chat and check access.
  const rows = await sql`select chat_id from public.job_chat_messages where id = ${messageId} limit 1`;
  const chatId = rows[0]?.chat_id as string | undefined;
  if (!chatId) return { error: "Not found" };
  const chat = await chatForUser(chatId, user);
  if (!chat) return { error: "Not found" };
  try {
    const existing = await sql`select 1 from public.job_chat_reactions where message_id = ${messageId} and user_id = ${user.id} and emoji = ${clean} limit 1`;
    if (existing.length) {
      await sql`delete from public.job_chat_reactions where message_id = ${messageId} and user_id = ${user.id} and emoji = ${clean}`;
      return { data: { on: false } };
    }
    await sql`insert into public.job_chat_reactions (message_id, user_id, emoji) values (${messageId}, ${user.id}, ${clean}) on conflict do nothing`;
    return { data: { on: true } };
  } catch (e) {
    if (isMissingTable(e)) return { error: "Reactions need migration 0017." };
    throw e;
  }
}

export async function editMessage(messageId: string, body: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  const clean = (body ?? "").trim();
  if (!clean) return { error: "Message can't be empty." };
  const rows = await sql`select chat_id, sender_id from public.job_chat_messages where id = ${messageId} limit 1`;
  if (!rows.length) return { error: "Not found" };
  if (rows[0].sender_id !== user.id) return { error: "You can only edit your own messages." };
  try {
    await sql`update public.job_chat_messages set body = ${clean}, edited_at = now() where id = ${messageId} and sender_id = ${user.id} and deleted_at is null`;
    return { data: { body: clean } };
  } catch (e) {
    if (isMissingSchema(e)) return { error: "Editing needs migration 0017." };
    throw e;
  }
}

export async function deleteChatMessage(messageId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  const rows = await sql`select chat_id, sender_id, company_id from public.job_chat_messages where id = ${messageId} limit 1`;
  if (!rows.length) return { error: "Not found" };
  const isOwner = rows[0].sender_id === user.id;
  if (!isOwner && !isChatAdmin(user)) return { error: "You can only delete your own messages." };
  try {
    await sql`update public.job_chat_messages set deleted_at = now() where id = ${messageId}`;
    // Pull any mirrored media copy so it disappears from the job's media grid too.
    await sql`delete from public.job_files where chat_id = ${rows[0].chat_id} and url = (select file_url from public.job_chat_messages where id = ${messageId})`;
    return { data: { deleted: true } };
  } catch (e) {
    if (isMissingSchema(e)) return { error: "Deleting needs migration 0017." };
    throw e;
  }
}

// Post a message: text, a file, or both, optionally replying, flagged important,
// or scheduled to send later.
export async function sendChatMessage(chatId: string, params: {
  body: string;
  file?: { url: string; name: string; contentType: string | null; sizeBytes: number | null } | null;
  replyToId?: string | null;
  important?: boolean;
  scheduledAt?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  const chat = await chatForUser(chatId, user);
  if (!chat) return { error: "Not found" };

  const body = (params.body ?? "").trim();
  const file = params.file ?? null;
  const replyToId = params.replyToId ?? null;
  const important = params.important === true;
  if (!body && !file) return { error: "Message is empty." };

  if (file) {
    const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
    if (!publicBase || !file.url.startsWith(`${publicBase}/`)) return { error: "Invalid file URL" };
  }

  // Scheduled send → queue in job_chat_scheduled; released when due.
  if (params.scheduledAt) {
    const when = new Date(params.scheduledAt);
    if (isNaN(when.getTime())) return { error: "Invalid schedule time." };
    if (when.getTime() < Date.now() + 30 * 1000) return { error: "Pick a time at least a minute from now." };
    try {
      const rows = (await sql`
        insert into public.job_chat_scheduled
          (company_id, chat_id, job_id, sender_id, body, file_url, file_name, file_type, file_size, reply_to_id, important, scheduled_at)
        values (${user.companyId}, ${chatId}, ${chat.job_id}, ${user.id}, ${body},
                ${file?.url ?? null}, ${file ? (file.name || "file").slice(0, 300) : null},
                ${file?.contentType ?? null}, ${file?.sizeBytes ?? null}, ${replyToId}, ${important}, ${when.toISOString()})
        returning id, scheduled_at
      `) as any[];
      await auditUser(user, { action: "chat.schedule", entity: "job", entityId: chat.job_id, detail: { chatId, scheduledAt: when.toISOString() } });
      const scheduled: ScheduledMessage = {
        id: rows[0].id, body, fileName: file ? (file.name || "file").slice(0, 300) : null,
        important, scheduledAt: rows[0].scheduled_at,
      };
      return { data: { scheduled } };
    } catch (e) {
      if (isMissingTable(e)) return { error: "Scheduling needs migration 0018." };
      throw e;
    }
  }

  // Validate the reply target belongs to this chat (best-effort / guarded).
  let replyPreview: ReplyPreview | null = null;
  if (replyToId) {
    try {
      const rt = await sql`
        select m.id, m.body, m.file_name, (m.deleted_at is not null) as deleted,
               coalesce(u.full_name, u.email) as sender
        from public.job_chat_messages m left join public.users u on u.id = m.sender_id
        where m.id = ${replyToId} and m.chat_id = ${chatId} limit 1
      `;
      if (rt[0]) replyPreview = { id: rt[0].id, sender: rt[0].sender ?? null, body: rt[0].body ?? "", fileName: rt[0].file_name ?? null, deleted: !!rt[0].deleted };
    } catch { /* pre-0017 */ }
  }

  let rows: any[];
  try {
    rows = (await sql`
      insert into public.job_chat_messages (company_id, chat_id, sender_id, body, file_url, file_name, file_type, file_size, reply_to_id)
      values (${user.companyId}, ${chatId}, ${user.id}, ${body},
              ${file?.url ?? null}, ${file ? (file.name || "file").slice(0, 300) : null},
              ${file?.contentType ?? null}, ${file?.sizeBytes ?? null}, ${replyPreview ? replyToId : null})
      returning id, created_at
    `) as any[];
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
    rows = (await sql`
      insert into public.job_chat_messages (company_id, chat_id, sender_id, body, file_url, file_name, file_type, file_size)
      values (${user.companyId}, ${chatId}, ${user.id}, ${body},
              ${file?.url ?? null}, ${file ? (file.name || "file").slice(0, 300) : null},
              ${file?.contentType ?? null}, ${file?.sizeBytes ?? null})
      returning id, created_at
    `) as any[];
    replyPreview = null;
  }

  await sql`update public.job_chats set last_message_at = now() where id = ${chatId} and company_id = ${user.companyId}`;
  // Sending implies I've read up to now.
  try { await sql`update public.job_chat_participants set last_read_at = now(), last_seen_at = now(), typing_at = null where chat_id = ${chatId} and user_id = ${user.id}`; } catch { /* pre-0017 */ }

  // Flag important (0018) — separate update keeps the insert tier-agnostic.
  let importantSet = false;
  if (important) {
    try { await sql`update public.job_chat_messages set important = true where id = ${rows[0].id}`; importantSet = true; } catch { /* pre-0018 */ }
  }

  let sharedFile: any = null;
  if (file) {
    const type = file.contentType ?? "";
    const kind = type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : "file";
    const fileRows = await sql`
      insert into public.job_files (company_id, job_id, name, url, content_type, size_bytes, kind, uploaded_by, chat_id)
      values (${user.companyId}, ${chat.job_id}, ${(file.name || "file").slice(0, 300)}, ${file.url},
              ${file.contentType}, ${file.sizeBytes}, ${kind}, ${user.id}, ${chatId})
      returning id, name, url, content_type, size_bytes, kind, created_at, chat_id
    `;
    sharedFile = fileRows[0] ?? null;
  }

  await auditUser(user, { action: "chat.message", entity: "job", entityId: chat.job_id, detail: { chatId, hasFile: !!file } });

  const message: ChatMessage = {
    id: rows[0].id,
    body,
    fileUrl: file?.url ?? null,
    fileName: file ? (file.name || "file").slice(0, 300) : null,
    fileType: file?.contentType ?? null,
    fileSize: file?.sizeBytes ?? null,
    senderId: user.id,
    senderName: user.fullName || user.email,
    mine: true,
    createdAt: rows[0].created_at,
    editedAt: null,
    deleted: false,
    important: importantSet,
    replyTo: replyPreview,
    reactions: [],
  };
  return { data: { message, sharedFile } };
}
