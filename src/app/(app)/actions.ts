"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Saves the signed-in user's theme preference.
export async function saveTheme(theme: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  await sql`update public.users set theme = ${theme} where id = ${user.id}`;
  return { ok: true };
}
