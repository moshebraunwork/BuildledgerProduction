"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditUser, diff } from "@/lib/audit";
import { logger } from "@/lib/logger";

interface EmployeeInput {
  name: string; role_title: string | null; phone: string | null;
  pay_rate: number; require_punch_photo: boolean;
  invite_email?: string | null;
  // One-step onboarding: the access role to grant when inviting.
  invite_role_id?: string | null;
}

const EMPLOYEE_AUDIT_FIELDS = ["name", "role_title", "phone", "pay_rate", "require_punch_photo"];

export async function createEmployee(input: EmployeeInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "employees.edit")) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.employees (company_id, name, role_title, phone, pay_rate, require_punch_photo)
    values (${user.companyId}, ${input.name}, ${input.role_title}, ${input.phone}, ${input.pay_rate}, ${input.require_punch_photo})
    returning *
  `;
  await auditUser(user, {
    action: "employee.create", entity: "employee", entityId: rows[0].id,
    detail: { name: input.name, role: input.role_title, pay_rate: input.pay_rate },
  });

  // Optionally invite them to the system right away (one-step onboarding):
  // sends the invite AND pre-assigns the access role so they're ready on accept.
  if (input.invite_email) {
    const res = await inviteEmployee(rows[0].id, input.invite_email, input.invite_role_id ?? null);
    if ((res as any).ok) {
      rows[0].invite_email = input.invite_email;
      rows[0].invite_status = "pending";
    }
  }
  return { data: rows[0] };
}

export async function updateEmployee(id: string, input: EmployeeInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "employees.edit")) return { error: "Forbidden" };
  const beforeRows = await sql`
    select name, role_title, phone, pay_rate, require_punch_photo
    from public.employees where id = ${id} and company_id = ${user.companyId} limit 1
  `;
  const rows = await sql`
    update public.employees set name = ${input.name}, role_title = ${input.role_title}, phone = ${input.phone},
      pay_rate = ${input.pay_rate}, require_punch_photo = ${input.require_punch_photo}
    where id = ${id} and company_id = ${user.companyId}
    returning name, role_title, phone, pay_rate, require_punch_photo
  `;
  await auditUser(user, {
    action: "employee.update", entity: "employee", entityId: id,
    detail: { name: input.name, changes: diff(beforeRows[0], rows[0], EMPLOYEE_AUDIT_FIELDS) },
  });
  return { ok: true };
}

export async function deleteEmployee(id: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "employees.delete")) return { error: "Forbidden" };
  const beforeRows = await sql`select name, role_title from public.employees where id = ${id} and company_id = ${user.companyId} limit 1`;
  await sql`delete from public.employees where id = ${id} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: "employee.delete", entity: "employee", entityId: id,
    detail: beforeRows[0] ? { name: beforeRows[0].name, role: beforeRows[0].role_title } : undefined,
  });
  return { ok: true };
}

// ---- system invitations (Clerk) ----
import { clerkClient } from "@clerk/nextjs/server";

// Invite an employee to log into the system. Creates a Clerk invitation,
// pre-provisions a user row immediately (so they appear in Users page right away),
// and records the pending status on the employee. When a roleId is supplied (and
// the caller can manage users), the pre-provisioned account is given that role
// and marked active, so the person can log in the moment they accept — no
// separate "assign role / activate" step.
export async function inviteEmployee(employeeId: string, email: string, roleId: string | null = null) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "employees.edit")) return { error: "Forbidden" };
  if (!email) return { error: "Email required" };

  // Only honour a role if the caller is allowed to manage users + the role exists.
  let grantRole: string | null = null;
  if (roleId && can(user.isSuperadmin, user.permissions, "admin.users")) {
    const r = await sql`select id from public.roles where id = ${roleId} and company_id = ${user.companyId} limit 1`;
    if (r.length) grantRole = roleId;
  }
  const active = !!grantRole; // a role-bearing account is active on accept

  // Get the employee's name for the pre-provisioned user row
  const empRows = await sql`select name from public.employees where id = ${employeeId} and company_id = ${user.companyId} limit 1`;
  const empName = empRows[0]?.name ?? null;

  try {
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      ignoreExisting: true,
      redirectUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
        : undefined,
    });

    await sql`
      update public.employees
      set invite_email = ${email}, invite_status = 'pending', clerk_invitation_id = ${invitation.id}
      where id = ${employeeId} and company_id = ${user.companyId}
    `;

    // Pre-provision (or update) a user row so the admin can see and manage them
    // immediately. clerk_user_id is null until they sign up — ensureProfile claims it.
    const existing = await sql`
      select id from public.users where lower(email) = lower(${email}) and company_id = ${user.companyId} limit 1
    `;
    if (!existing.length) {
      await sql`
        insert into public.users (company_id, email, full_name, role_id, is_active, is_superadmin)
        values (${user.companyId}, ${email}, ${empName}, ${grantRole}, ${active}, false)
      `;
    } else if (grantRole) {
      await sql`
        update public.users set role_id = ${grantRole}, is_active = true
        where id = ${existing[0].id} and company_id = ${user.companyId} and is_superadmin = false
      `;
    }

    await auditUser(user, {
      action: "employee.invite", entity: "employee", entityId: employeeId,
      detail: { name: empName, email, role: grantRole ? "assigned" : null },
    });
    return { ok: true, status: "pending" as const };
  } catch (e: any) {
    return { error: e?.errors?.[0]?.message ?? e?.message ?? "Invite failed" };
  }
}

// Set the access (role + active) on the user account linked to an employee.
// Used by the unified Team editor's "App access" section. Requires admin.users.
export async function setEmployeeAccess(employeeId: string, params: { roleId: string | null; active: boolean }) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.users")) return { error: "Forbidden" };

  const emp = await sql`select user_id::text as user_id, invite_email, name from public.employees where id = ${employeeId} and company_id = ${user.companyId} limit 1`;
  if (!emp.length) return { error: "Employee not found" };

  const linked = await sql`
    select id::text as id, is_superadmin from public.users
    where company_id = ${user.companyId}
      and (
        (${emp[0].user_id}::uuid is not null and id = ${emp[0].user_id}::uuid)
        or (${emp[0].invite_email}::text is not null and lower(email) = lower(${emp[0].invite_email}))
      )
    limit 1
  `;
  if (!linked.length) return { error: "No account linked yet — send an invite first." };
  if (linked[0].is_superadmin) return { error: "Cannot change a superadmin's access." };
  if (params.active && !params.roleId) return { error: "Assign a role before enabling login." };

  const roleId = params.roleId || null;
  if (roleId) {
    const r = await sql`select 1 from public.roles where id = ${roleId} and company_id = ${user.companyId} limit 1`;
    if (!r.length) return { error: "Role not found" };
  }
  await sql`
    update public.users set role_id = ${roleId}, is_active = ${params.active}
    where id = ${linked[0].id} and company_id = ${user.companyId}
  `;
  await auditUser(user, {
    action: "user.set_access", entity: "user", entityId: linked[0].id,
    detail: { employee: emp[0].name, roleId, active: params.active },
  });
  return { ok: true };
}

// Revoke the old invitation and send a fresh one.
export async function resendInvite(employeeId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "employees.edit")) return { error: "Forbidden" };

  const rows = await sql`
    select invite_email, clerk_invitation_id from public.employees
    where id = ${employeeId} and company_id = ${user.companyId} limit 1
  `;
  const emp = (rows as any[])[0];
  if (!emp?.invite_email) return { error: "No invite email on file" };

  try {
    const client = await clerkClient();
    // Revoke the previous invitation if still pending (ignore errors if already gone)
    if (emp.clerk_invitation_id) {
      // Best-effort: the old invite may already be accepted/revoked, in which
      // case Clerk throws — that's fine, but record it so a real failure here
      // (e.g. auth/network) isn't completely invisible.
      try {
        await client.invitations.revokeInvitation(emp.clerk_invitation_id);
      } catch (e) {
        logger.warn("employees", "could not revoke prior invitation", { employeeId, err: e });
      }
    }
    const invitation = await client.invitations.createInvitation({
      emailAddress: emp.invite_email,
      ignoreExisting: true,
      redirectUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
        : undefined,
    });
    await sql`
      update public.employees
      set invite_status = 'pending', clerk_invitation_id = ${invitation.id}
      where id = ${employeeId} and company_id = ${user.companyId}
    `;
    await auditUser(user, {
      action: "employee.invite_resend", entity: "employee", entityId: employeeId,
      detail: { email: emp.invite_email },
    });
    return { ok: true };
  } catch (e: any) {
    return { error: e?.errors?.[0]?.message ?? e?.message ?? "Resend failed" };
  }
}

// Refreshes invite_status for all employees with a pending invite by checking
// Clerk for the current state (accepted invitations flip to 'accepted').
export async function refreshInviteStatuses() {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "employees.view")) return { error: "Forbidden" };

  const rows = await sql`
    select id, clerk_invitation_id from public.employees
    where company_id = ${user.companyId} and invite_status = 'pending' and clerk_invitation_id is not null
  `;
  const pending = rows as any[];
  if (!pending.length) return { ok: true, updated: 0 };

  try {
    const client = await clerkClient();
    const list = await client.invitations.getInvitationList({ status: "accepted" });
    const acceptedIds = new Set((list.data ?? []).map((i: any) => i.id));
    let updated = 0;
    for (const emp of pending) {
      if (acceptedIds.has(emp.clerk_invitation_id)) {
        await sql`update public.employees set invite_status = 'accepted' where id = ${emp.id}`;
        updated++;
      }
    }
    return { ok: true, updated };
  } catch (e: any) {
    return { error: e?.message ?? "Status check failed" };
  }
}
