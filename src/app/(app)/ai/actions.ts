"use server";

import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadMessages, clearMessages, type StoredMessage } from "@/lib/ai/conversation";

// Load the signed-in user's Ask AI conversation (their own only).
export async function loadAiHistory(): Promise<{ messages: StoredMessage[] } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!can(user.isSuperadmin, user.permissions, "ai.use")) return { error: "Forbidden" };
  const messages = await loadMessages(user.id);
  return { messages };
}

// Clear the signed-in user's conversation.
export async function clearAiHistory(): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!can(user.isSuperadmin, user.permissions, "ai.use")) return { error: "Forbidden" };
  await clearMessages(user.id);
  return { ok: true };
}
