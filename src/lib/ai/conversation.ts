import { sql } from "@/lib/db";
import type { Content } from "./gemini";

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// How many recent messages to keep "in memory" for follow-up context (~10
// exchanges). The full history is still stored; this only bounds what we send
// to the model on each turn.
export const MEMORY_LIMIT = 20;

// Load a user's conversation, oldest-first, for display.
export async function loadMessages(userId: string): Promise<StoredMessage[]> {
  const rows = await sql`
    select id::text as id, role, content, created_at
    from public.ai_messages
    where user_id = ${userId}
    order by created_at asc
  `;
  return rows as StoredMessage[];
}

// The last MEMORY_LIMIT messages, mapped to Gemini contents (oldest-first).
export async function recentContents(userId: string): Promise<Content[]> {
  const rows = await sql`
    select role, content from (
      select role, content, created_at
      from public.ai_messages
      where user_id = ${userId}
      order by created_at desc
      limit ${MEMORY_LIMIT}
    ) t
    order by created_at asc
  `;
  return (rows as any[]).map((r) => ({
    role: r.role === "assistant" ? "model" : "user",
    parts: [{ text: r.content }],
  }));
}

export async function saveMessage(
  companyId: string,
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await sql`
    insert into public.ai_messages (company_id, user_id, role, content)
    values (${companyId}, ${userId}, ${role}, ${content})
  `;
}

export async function clearMessages(userId: string): Promise<void> {
  await sql`delete from public.ai_messages where user_id = ${userId}`;
}
