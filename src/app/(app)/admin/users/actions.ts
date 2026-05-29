"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { clerkClient } from "@clerk/nextjs/server";

export async function setUserRole(userId: string, roleId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  const roleRows = await sql`select name from public.roles where id = ${roleId} and company_id = ${user.companyId} limit 1`;
  await sql`update public.users set role_id = ${roleId} where id = ${userId} and company_id = ${user.companyId}`;
  await audit({
    companyId: user.companyId, actorId: user.id, actorEmail: user.email,
    action: "user.set_role", entity: "user", entityId: userId,
    detail: { roleId, roleName: roleRows[0]?.name ?? roleId },
  });
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  const check = await sql`select is_superadmin from public.users where id = ${userId} and company_id = ${user.companyId} limit 1`;
  if (check.length && check[0].is_superadmin) return { error: "Cannot change a superadmin" };
  await sql`update public.users set is_active = ${active} where id = ${userId} and company_id = ${user.companyId}`;
  await audit({
    companyId: user.companyId, actorId: user.id, actorEmail: user.email,
    action: active ? "user.enable" : "user.disable", entity: "user", entityId: userId,
  });
  return { ok: true };
}

export async function setUserFullName(userId: string, fullName: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  await sql`update public.users set full_name = ${fullName || null} where id = ${userId} and company_id = ${user.companyId}`;
  await audit({
    companyId: user.companyId, actorId: user.id, actorEmail: user.email,
    action: "user.update_name", entity: "user", entityId: userId,
    detail: { fullName },
  });
  return { ok: true };
}

export async function getUserLogs(userId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  const logs = await sql`
    select id, action, entity, entity_id, detail, created_at
    from public.audit_log
    where company_id = ${user.companyId} and actor_id = ${userId}
    order by created_at desc
    limit 100
  `;
  return { data: logs };
}

export async function getUserSessions(clerkUserId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  try {
    const client = await clerkClient();
    const sessions = await client.sessions.getSessionList({ userId: clerkUserId, limit: 20 });
    return {
      data: sessions.data.map((s) => ({
        id: s.id,
        status: s.status,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        clientId: s.clientId,
      })),
    };
  } catch {
    return { data: [] };
  }
}

export async function inviteUser(email: string, roleId: string | null) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };

  // Check if already a user
  const existing = await sql`select id from public.users where email = ${email} and company_id = ${user.companyId} limit 1`;
  if (existing.length) return { error: "A user with this email already exists." };

  const client = await clerkClient();
  try {
    await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign-in`,
      publicMetadata: {
        companyId: user.companyId,
        preAssignedRoleId: roleId,
      },
    });
  } catch (e: any) {
    return { error: e?.errors?.[0]?.message ?? "Failed to send invitation" };
  }

  await audit({
    companyId: user.companyId, actorId: user.id, actorEmail: user.email,
    action: "user.invite", entity: "invitation", entityId: email,
    detail: { email, roleId },
  });
  return { ok: true };
}
