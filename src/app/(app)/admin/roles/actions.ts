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

export async function createRole(name: string, permissions: PermissionMap) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.roles")) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.roles (company_id, name, permissions, is_system)
    values (${user.companyId}, ${name}, ${JSON.stringify(permissions)}::jsonb, false)
    returning *
  `;
  await auditUser(user, {
    action: "role.create", entity: "role", entityId: rows[0].id,
    detail: { name, permissions: grantedPerms(permissions) },
  });
  return { data: rows[0] };
}

export async function updateRole(id: string, name: string, permissions: PermissionMap) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.roles")) return { error: "Forbidden" };
  const beforeRows = await sql`select name, permissions from public.roles where id = ${id} and company_id = ${user.companyId} limit 1`;
  await sql`
    update public.roles set name = ${name}, permissions = ${JSON.stringify(permissions)}::jsonb
    where id = ${id} and company_id = ${user.companyId}
  `;
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
