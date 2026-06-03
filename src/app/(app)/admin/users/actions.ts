"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditUser, diff } from "@/lib/audit";
import { clerkClient } from "@clerk/nextjs/server";

// Identifying fields for the *target* user of an admin action, so the log reads
// "Assigned role to jane@acme.com" rather than referencing an opaque id.
async function targetUser(userId: string, companyId: string) {
  const rows = await sql`select email, full_name from public.users where id = ${userId} and company_id = ${companyId} limit 1`;
  return rows[0] ?? null;
}

export async function setUserRole(userId: string, roleId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  const roleRows = await sql`select name from public.roles where id = ${roleId} and company_id = ${user.companyId} limit 1`;
  const target = await targetUser(userId, user.companyId);
  await sql`update public.users set role_id = ${roleId} where id = ${userId} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: "user.set_role", entity: "user", entityId: userId,
    detail: { targetEmail: target?.email, targetName: target?.full_name, roleName: roleRows[0]?.name ?? roleId },
  });
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  const check = await sql`select email, full_name, is_superadmin, role_id from public.users where id = ${userId} and company_id = ${user.companyId} limit 1`;
  if (!check.length) return { error: "User not found" };
  if (check[0].is_superadmin) return { error: "Cannot change a superadmin" };
  if (active && !check[0].role_id) return { error: "Assign a role before enabling this user" };
  await sql`update public.users set is_active = ${active} where id = ${userId} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: active ? "user.enable" : "user.disable", entity: "user", entityId: userId,
    detail: { targetEmail: check[0].email, targetName: check[0].full_name },
  });
  return { ok: true };
}

export async function setUserFullName(userId: string, fullName: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  const target = await targetUser(userId, user.companyId);
  await sql`update public.users set full_name = ${fullName || null} where id = ${userId} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: "user.update_name", entity: "user", entityId: userId,
    detail: { targetEmail: target?.email, changes: diff({ full_name: target?.full_name }, { full_name: fullName || null }, ["full_name"]) },
  });
  return { ok: true };
}

export async function getUserLogs(userId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  // ip_address / user_agent arrive with migration 0011 — fall back gracefully if
  // the database hasn't been migrated yet so this panel never errors.
  let logs: any[];
  try {
    logs = (await sql`
      select id, action, entity, entity_id::text as entity_id, detail, ip_address, user_agent, created_at
      from public.audit_log
      where company_id = ${user.companyId} and actor_id = ${userId}
      order by created_at desc
      limit 100
    `) as any[];
  } catch {
    logs = (await sql`
      select id, action, entity, entity_id::text as entity_id, detail, null as ip_address, null as user_agent, created_at
      from public.audit_log
      where company_id = ${user.companyId} and actor_id = ${userId}
      order by created_at desc
      limit 100
    `) as any[];
  }
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

export async function updateUserEmail(userId: string, newEmail: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed) return { error: "Email required" };
  const target = await targetUser(userId, user.companyId);
  await sql`update public.users set email = ${trimmed} where id = ${userId} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: "user.update_email", entity: "user", entityId: userId,
    detail: { changes: diff({ email: target?.email }, { email: trimmed }, ["email"]) },
  });
  return { ok: true };
}

export async function reinviteUser(email: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };
  const client = await clerkClient();
  try {
    await client.invitations.createInvitation({
      emailAddress: email,
      ignoreExisting: true,
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign-in`,
    });
  } catch (e: any) {
    return { error: e?.errors?.[0]?.message ?? "Failed to send invitation" };
  }
  await auditUser(user, {
    action: "user.reinvite", entity: "invitation", entityId: email,
    detail: { email },
  });
  return { ok: true };
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

  const roleRows = roleId
    ? await sql`select name from public.roles where id = ${roleId} and company_id = ${user.companyId} limit 1`
    : [];
  await auditUser(user, {
    action: "user.invite", entity: "invitation", entityId: email,
    detail: { email, role: roleRows[0]?.name ?? null },
  });
  return { ok: true };
}
