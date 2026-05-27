"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export async function setUserRole(userId: string, roleId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  await sql`update public.users set role_id = ${roleId} where id = ${userId} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "user.set_role", entity: "user", entityId: userId, detail: { roleId } });
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  // Never allow toggling a superadmin off
  const check = await sql`select is_superadmin from public.users where id = ${userId} and company_id = ${user.companyId} limit 1`;
  if (check.length && check[0].is_superadmin) return { error: "Cannot change a superadmin" };
  await sql`update public.users set is_active = ${active} where id = ${userId} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: active ? "user.enable" : "user.disable", entity: "user", entityId: userId });
  return { ok: true };
}
