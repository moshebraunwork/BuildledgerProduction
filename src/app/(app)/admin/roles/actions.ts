"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can, type PermissionMap } from "@/lib/permissions";
import { auditUser } from "@/lib/audit";

// Names of the permissions granted (true) by a role — readable in the log
// instead of a raw permission map.
function grantedPerms(permissions: PermissionMap): string[] {
  return Object.entries(permissions ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort();
}

export async function createRole(
  name: string,
  permissions: PermissionMap,
  requireLocation = false,
  notificationPrefs: Record<string, boolean> = {},
) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.roles")) return { error: "Forbidden" };
  const json = JSON.stringify(permissions);
  // require_location arrives with migration 0014; fall back if not yet applied.
  let rows: any[];
  try {
    rows = (await sql`
      insert into public.roles (company_id, name, permissions, is_system, require_location)
      values (${user.companyId}, ${name}, ${json}::jsonb, false, ${requireLocation})
      returning *
    `) as any[];
  } catch (e) {
    if (!/require_location/.test(String((e as any)?.message ?? ""))) throw e;
    rows = (await sql`
      insert into public.roles (company_id, name, permissions, is_system)
      values (${user.companyId}, ${name}, ${json}::jsonb, false)
      returning *
    `) as any[];
  }
  // Notification prefs (migration 0016) — set separately + guarded.
  try {
    await sql`update public.roles set notification_prefs = ${JSON.stringify(notificationPrefs)}::jsonb where id = ${rows[0].id}`;
    rows[0].notification_prefs = notificationPrefs;
  } catch { /* not migrated yet */ }
  await auditUser(user, {
    action: "role.create", entity: "role", entityId: rows[0].id,
    detail: { name, permissions: grantedPerms(permissions), requireLocation },
  });
  return { data: rows[0] };
}

export async function updateRole(
  id: string,
  name: string,
  permissions: PermissionMap,
  requireLocation = false,
  notificationPrefs: Record<string, boolean> = {},
) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.roles")) return { error: "Forbidden" };
  const beforeRows = await sql`select name, permissions from public.roles where id = ${id} and company_id = ${user.companyId} limit 1`;
  const json = JSON.stringify(permissions);
  try {
    await sql`
      update public.roles set name = ${name}, permissions = ${json}::jsonb, require_location = ${requireLocation}
      where id = ${id} and company_id = ${user.companyId}
    `;
  } catch (e) {
    if (!/require_location/.test(String((e as any)?.message ?? ""))) throw e;
    await sql`
      update public.roles set name = ${name}, permissions = ${json}::jsonb
      where id = ${id} and company_id = ${user.companyId}
    `;
  }
  try {
    await sql`update public.roles set notification_prefs = ${JSON.stringify(notificationPrefs)}::jsonb where id = ${id} and company_id = ${user.companyId}`;
  } catch { /* not migrated yet */ }
  const before = beforeRows[0]?.permissions ? grantedPerms(beforeRows[0].permissions as PermissionMap) : [];
  const after = grantedPerms(permissions);
  await auditUser(user, {
    action: "role.update", entity: "role", entityId: id,
    detail: {
      name,
      added: after.filter((p) => !before.includes(p)),
      removed: before.filter((p) => !after.includes(p)),
    },
  });
  return { ok: true };
}

export async function deleteRole(id: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.roles")) return { error: "Forbidden" };
  // Guard: never delete a system role
  const check = await sql`select name, is_system from public.roles where id = ${id} and company_id = ${user.companyId} limit 1`;
  if (!check.length || check[0].is_system) return { error: "Cannot delete this role" };
  await sql`delete from public.roles where id = ${id} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: "role.delete", entity: "role", entityId: id,
    detail: { name: check[0].name },
  });
  return { ok: true };
}
