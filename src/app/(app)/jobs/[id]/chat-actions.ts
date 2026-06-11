"use server";

// ============================================================================
// Per-job chat — replaces the single shared job note. A job can hold any
// number of conversations, each between a fixed set of users:
//   - The participant set is the chat's identity: unique (job_id,
//     participants_key) means creating a chat with the same people resolves to
//     the existing conversation instead of opening a duplicate.
//   - Participants see their own chats; admins (superadmin or admin-area
//     access) see every chat on every job.
//   - File attachments are mirrored into job_files with the chat id, so they
//     show up in the job's media section for exactly the same audience.
// ============================================================================

import { sql } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditUser } from "@/lib/audit";

export interface ChatSummary {
  id: string;
  participants: { id: string; name: string }[];
  isParticipant: boolean;
  lastMessage: { body: string; fileName: string | null; sender: string | null; createdAt: string } | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  body: string;
  fileUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  senderName: string | null;
  mine: boolean;
  createdAt: string;
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
    select c.id, c.job_id
    from public.job_chats c
    where c.id = ${chatId} and c.company_id = ${user.companyId}
      and (
        ${isChatAdmin(user)}
        or exists (select 1 from public.job_chat_participants p where p.chat_id = c.id and p.user_id = ${user.id})
      )
    limit 1
  `;
  return (rows[0] as { id: string; job_id: string } | undefined) ?? null;
}

// The "chat tables haven't been migrated yet" signature — lets the UI degrade
// to a quiet notice instead of a hard error, matching the job_files precedent.
function isMissingTable(e: unknown) {
  return /relation .* does not exist/i.test(String((e as any)?.message ?? ""));
}

// Active company members the caller can start a chat with (everyone but
// themselves — the creator is always included automatically).
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
  try {
    const rows = await sql`
      select c.id, c.created_at, c.last_message_at,
        (select json_agg(json_build_object('id', u.id, 'name', coalesce(u.full_name, u.email))
                         order by coalesce(u.full_name, u.email))
           from public.job_chat_participants p
           join public.users u on u.id = p.user_id
          where p.chat_id = c.id) as participants,
        (select json_build_object('body', m.body, 'fileName', m.file_name, 'createdAt', m.created_at,
                                  'sender', coalesce(su.full_name, su.email))
           from public.job_chat_messages m
           left join public.users su on su.id = m.sender_id
          where m.chat_id = c.id
          order by m.created_at desc limit 1) as last_message,
        exists (select 1 from public.job_chat_participants p2
                 where p2.chat_id = c.id and p2.user_id = ${user.id}) as is_participant
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
      lastMessage: c.last_message
        ? {
            body: c.last_message.body ?? "",
            fileName: c.last_message.fileName ?? null,
            sender: c.last_message.sender ?? null,
            createdAt: c.last_message.createdAt,
          }
        : null,
      createdAt: c.created_at,
    }));
    return { data };
  } catch (e) {
    if (isMissingTable(e)) return { data: [] as ChatSummary[], unavailable: true };
    throw e;
  }
}

// Open (or create) the chat between the caller and the given users on a job.
// If this exact group already has a conversation here, the existing chat is
// returned — the participant set IS the chat, so there are never duplicates.
export async function createJobChat(jobId: string, participantIds: string[]) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!(await jobInCompany(jobId, user.companyId))) return { error: "Not found" };

  const ids = Array.from(new Set([user.id, ...participantIds]));
  if (ids.length < 2) return { error: "Pick at least one other person to chat with." };

  // Every participant must be an active member of the caller's company.
  // (Ids are passed as a comma-joined string — UUIDs never contain commas —
  // to avoid depending on driver-specific array serialization.)
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
      const found = await sql`
        select id from public.job_chats
        where job_id = ${jobId} and participants_key = ${key} limit 1
      `;
      chatId = found[0]?.id;
    }
    if (!chatId) return { error: "Couldn't create the chat. Please try again." };

    if (!existing) {
      for (const uid of ids) {
        await sql`
          insert into public.job_chat_participants (chat_id, user_id)
          values (${chatId}, ${uid})
          on conflict do nothing
        `;
      }
      await auditUser(user, {
        action: "chat.create", entity: "job", entityId: jobId,
        detail: { chatId, participants: ids.length },
      });
    }
    return { data: { id: chatId, existing } };
  } catch (e) {
    if (isMissingTable(e)) return { error: "Chat isn't set up yet — the database migration 0015_job_chats.sql hasn't been applied." };
    throw e;
  }
}

// Full message history for one chat (capped at the most recent 500).
export async function getChatMessages(chatId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  const chat = await chatForUser(chatId, user);
  if (!chat) return { error: "Not found" };
  const rows = await sql`
    select * from (
      select m.id, m.body, m.file_url, m.file_name, m.file_type, m.file_size, m.created_at,
             m.sender_id, coalesce(u.full_name, u.email) as sender_name
      from public.job_chat_messages m
      left join public.users u on u.id = m.sender_id
      where m.chat_id = ${chatId}
      order by m.created_at desc
      limit 500
    ) recent order by created_at asc
  `;
  const data: ChatMessage[] = (rows as any[]).map((m) => ({
    id: m.id,
    body: m.body ?? "",
    fileUrl: m.file_url ?? null,
    fileName: m.file_name ?? null,
    fileType: m.file_type ?? null,
    fileSize: m.file_size != null ? Number(m.file_size) : null,
    senderName: m.sender_name ?? null,
    mine: m.sender_id === user.id,
    createdAt: m.created_at,
  }));
  return { data };
}

// Post a message: text, a file, or both. Attachments are mirrored into the
// job's media section (job_files) tagged with the chat id, so only people who
// can see this chat see the file there.
export async function sendChatMessage(chatId: string, params: {
  body: string;
  file?: { url: string; name: string; contentType: string | null; sizeBytes: number | null } | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  const chat = await chatForUser(chatId, user);
  if (!chat) return { error: "Not found" };

  const body = (params.body ?? "").trim();
  const file = params.file ?? null;
  if (!body && !file) return { error: "Message is empty." };

  if (file) {
    // The stored URL must point at our own object storage — never an arbitrary
    // external link supplied by the client (same rule as job media uploads).
    const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
    if (!publicBase || !file.url.startsWith(`${publicBase}/`)) return { error: "Invalid file URL" };
  }

  const rows = await sql`
    insert into public.job_chat_messages (company_id, chat_id, sender_id, body, file_url, file_name, file_type, file_size)
    values (${user.companyId}, ${chatId}, ${user.id}, ${body},
            ${file?.url ?? null}, ${file ? (file.name || "file").slice(0, 300) : null},
            ${file?.contentType ?? null}, ${file?.sizeBytes ?? null})
    returning id, created_at
  `;
  await sql`update public.job_chats set last_message_at = now() where id = ${chatId} and company_id = ${user.companyId}`;

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

  await auditUser(user, {
    action: "chat.message", entity: "job", entityId: chat.job_id,
    detail: { chatId, hasFile: !!file },
  });

  const message: ChatMessage = {
    id: rows[0].id,
    body,
    fileUrl: file?.url ?? null,
    fileName: file ? (file.name || "file").slice(0, 300) : null,
    fileType: file?.contentType ?? null,
    fileSize: file?.sizeBytes ?? null,
    senderName: user.fullName || user.email,
    mine: true,
    createdAt: rows[0].created_at,
  };
  return { data: { message, sharedFile } };
}
