"use server";

import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { auditUser } from "@/lib/audit";
import { DEMO_COOKIE } from "@/lib/demo";

// Saves the signed-in user's theme preference. Intentionally not audited — it's
// a high-frequency cosmetic toggle that would only add noise to the activity log.
export async function saveTheme(theme: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  await sql`update public.users set theme = ${theme} where id = ${user.id}`;
  return { ok: true };
}

// Records a sign-out in the audit log. Clerk performs the actual sign-out on the
// client; this is called first (best-effort) so the activity log shows when each
// user ended their session, with the device/IP, mirroring auth.login.
export async function recordSignOut() {
  const user = await getCurrentUser();
  if (!user) return { ok: true };
  await auditUser(user, {
    action: "auth.logout",
    entity: "session",
    entityId: user.id,
  });
  // If this was a demo guest, also clear the guest cookie so they're logged out.
  try {
    const jar = await cookies();
    if (jar.get(DEMO_COOKIE)) jar.delete(DEMO_COOKIE);
  } catch {
    /* not in a mutable cookie context — ignore */
  }
  return { ok: true };
}
