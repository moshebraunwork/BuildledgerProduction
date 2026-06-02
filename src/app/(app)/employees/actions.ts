"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

interface EmployeeInput {
  name: string; role_title: string | null; phone: string | null;
  pay_rate: number; require_punch_photo: boolean;
  invite_email?: string | null;
}

export async function createEmployee(input: EmployeeInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "employees.edit")) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.employees (company_id, name, role_title, phone, pay_rate, require_punch_photo)
    values (${user.companyId}, ${input.name}, ${input.role_title}, ${input.phone}, ${input.pay_rate}, ${input.require_punch_photo})
    returning *
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "employee.create", entity: "employee", entityId: rows[0].id });

  // Optionally invite them to the system right away
  if (input.invite_email) {
    const res = await inviteEmployee(rows[0].id, input.invite_email);
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
  await sql`
    update public.employees set name = ${input.name}, role_title = ${input.role_title}, phone = ${input.phone},
      pay_rate = ${input.pay_rate}, require_punch_photo = ${input.require_punch_photo}
    where id = ${id} and company_id = ${user.companyId}
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "worker.update", entity: "worker", entityId: id });
  return { ok: true };
}

export async function deleteEmployee(id: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "employees.delete")) return { error: "Forbidden" };
  await sql`delete from public.employees where id = ${id} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "worker.delete", entity: "worker", entityId: id });
  return { ok: true };
}

// ---- system invitations (Clerk) ----
import { clerkClient } from "@clerk/nextjs/server";

// Invite an employee to log into the system. Creates a Clerk invitation,
// pre-provisions a user row immediately (so they appear in Users page right away),
// and records the pending status on the employee.
export async function inviteEmployee(employeeId: string, email: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "employees.edit")) return { error: "Forbidden" };
  if (!email) return { error: "Email required" };

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

    // Pre-provision a user row so the admin can see and manage them immediately.
    // clerk_user_id is null until they actually sign up — ensureProfile will claim it.
    const alreadyExists = await sql`
      select id from public.users where lower(email) = lower(${email}) and company_id = ${user.companyId} limit 1
    `;
    if (!alreadyExists.length) {
      await sql`
        insert into public.users (company_id, email, full_name, is_active, is_superadmin)
        values (${user.companyId}, ${email}, ${empName}, false, false)
      `;
    }

    await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "employee.invite", entity: "employee", entityId: employeeId, detail: { email } });
    return { ok: true, status: "pending" as const };
  } catch (e: any) {
    return { error: e?.errors?.[0]?.message ?? e?.message ?? "Invite failed" };
  }
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
    await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "employee.invite_resend", entity: "employee", entityId: employeeId });
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
