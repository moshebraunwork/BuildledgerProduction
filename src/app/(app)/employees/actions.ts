"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

interface EmployeeInput {
  name: string; role_title: string | null; phone: string | null;
  pay_rate: number; require_punch_photo: boolean;
}

export async function createEmployee(input: EmployeeInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "employees.edit")) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.employees (company_id, name, role_title, phone, pay_rate, require_punch_photo)
    values (${user.companyId}, ${input.name}, ${input.role_title}, ${input.phone}, ${input.pay_rate}, ${input.require_punch_photo})
    returning *
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "worker.create", entity: "worker", entityId: rows[0].id });
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
