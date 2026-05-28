"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

interface JobInput {
  title: string; place: string | null; scheduled_date: string | null;
  customer_name: string | null; customer_email: string | null;
  estimate: number; billing_mode: string;
}

export async function createJob(input: JobInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "jobs.edit")) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.jobs (company_id, title, place, scheduled_date, customer_name, customer_email, estimate, billing_mode, status)
    values (${user.companyId}, ${input.title}, ${input.place}, ${input.scheduled_date},
            ${input.customer_name}, ${input.customer_email}, ${input.estimate}, ${input.billing_mode}, 'scheduled')
    returning *
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "job.create", entity: "job", entityId: rows[0].id });
  return { data: rows[0] };
}

export async function deleteJob(id: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "jobs.delete")) return { error: "Forbidden" };
  await sql`delete from public.jobs where id = ${id} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "job.delete", entity: "job", entityId: id });
  return { ok: true };
}
