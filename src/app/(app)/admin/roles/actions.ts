"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can, type PermissionMap } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export async function createRole(name: string, permissions: PermissionMap) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.roles")) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.roles (company_id, name, permissions, is_system)
    values (${user.companyId}, ${name}, ${JSON.stringify(permissions)}::jsonb, false)
    returning *
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "role.create", entity: "role", entityId: rows[0].id });
  return { data: rows[0] };
}

export async function updateRole(id: string, name: string, permissions: PermissionMap) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.roles")) return { error: "Forbidden" };
  await sql`
    update public.roles set name = ${name}, permissions = ${JSON.stringify(permissions)}::jsonb
    where id = ${id} and company_id = ${user.companyId}
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "role.update", entity: "role", entityId: id });
  return { ok: true };
}

export async function deleteRole(id: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.roles")) return { error: "Forbidden" };
  // Guard: never delete a system role
  const check = await sql`select is_system from public.roles where id = ${id} and company_id = ${user.companyId} limit 1`;
  if (!check.length || check[0].is_system) return { error: "Cannot delete this role" };
  await sql`delete from public.roles where id = ${id} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "role.delete", entity: "role", entityId: id });
  return { ok: true };
}
