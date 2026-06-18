"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { enabledPrefixes, prettyAction, type NotificationPrefs } from "@/lib/notifications";

export interface NotificationItem {
  id: string;
  message: string;
  actor: string;
  when: string; // ISO
  unread: boolean;
}

// Notifications are derived from the activity log, filtered by the categories the
// user's role is subscribed to (superadmins see everything).
export async function listNotifications(): Promise<{ items: NotificationItem[]; unread: number }> {
  const user = await getCurrentUser();
  if (!user) return { items: [], unread: 0 };

  // Role notification prefs (guarded — column arrives with migration 0016).
  let prefs: NotificationPrefs = {};
  if (user.roleId) {
    try {
      const r = await sql`select notification_prefs from public.roles where id = ${user.roleId} limit 1`;
      prefs = (r[0]?.notification_prefs as NotificationPrefs) ?? {};
    } catch { /* not migrated yet */ }
  }

  let readAt: string | null = null;
  try {
    const u = await sql`select notifications_read_at from public.users where id = ${user.id} limit 1`;
    readAt = (u[0]?.notifications_read_at as string) ?? null;
  } catch { /* not migrated yet */ }

  const prefixes = enabledPrefixes(prefs, user.isSuperadmin);
  if (prefixes.length === 0) return { items: [], unread: 0 };

  const rows = (await sql`
    select id, action, actor_name, actor_email, detail, created_at
    from public.audit_log
    where company_id = ${user.companyId}
    order by created_at desc
    limit 60
  `) as any[];

  const readTs = readAt ? new Date(readAt).getTime() : 0;
  const items: NotificationItem[] = [];
  let unread = 0;

  for (const r of rows) {
    const action: string = r.action ?? "";
    if (!prefixes.some((p) => action.startsWith(p))) continue;
    const actor = r.actor_name || r.actor_email || "Someone";
    const detail = r.detail || {};
    const subject = detail.title || detail.name || detail.number || "";
    const message = `${prettyAction(action)}${subject ? ` — ${subject}` : ""}`;
    const ts = new Date(r.created_at).getTime();
    const isUnread = ts > readTs;
    if (isUnread) unread += 1;
    if (items.length < 20) {
      items.push({ id: String(r.id), message, actor, when: new Date(r.created_at).toISOString(), unread: isUnread });
    }
  }

  return { items, unread };
}

export async function markNotificationsRead(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  try {
    await sql`update public.users set notifications_read_at = now() where id = ${user.id}`;
  } catch { /* not migrated yet */ }
  return { ok: true };
}
