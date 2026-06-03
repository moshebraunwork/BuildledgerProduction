"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditUser, diff } from "@/lib/audit";
import { revalidatePath } from "next/cache";

// Columns worth recording a before/after for on a job edit.
const JOB_AUDIT_FIELDS = [
  "title", "place", "scheduled_date", "customer_name", "customer_email",
  "estimate", "billing_mode", "billing_rate", "status",
];

interface JobInput {
  title: string; place: string | null; scheduled_date: string | null;
  customer_name: string | null; customer_email: string | null;
  estimate: number; billing_mode: string; billing_rate?: number | null;
  status?: string;
}

const JOB_STATUSES = ["scheduled", "active", "complete"];

export async function createJob(input: JobInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "jobs.edit")) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.jobs (company_id, title, place, scheduled_date, customer_name, customer_email, estimate, billing_mode, status)
    values (${user.companyId}, ${input.title}, ${input.place}, ${input.scheduled_date},
            ${input.customer_name}, ${input.customer_email}, ${input.estimate}, ${input.billing_mode}, 'scheduled')
    returning *
  `;
  await auditUser(user, {
    action: "job.create", entity: "job", entityId: rows[0].id,
    detail: {
      title: input.title,
      customer: input.customer_name,
      estimate: input.estimate,
      billing_mode: input.billing_mode,
    },
  });
  revalidatePath("/jobs");
  return { data: rows[0] };
}

export async function updateJob(id: string, input: JobInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "jobs.edit")) return { error: "Forbidden" };
  const status = input.status && JOB_STATUSES.includes(input.status) ? input.status : null;
  // Snapshot before the update so the log can show exactly what changed.
  const beforeRows = await sql`
    select title, place, scheduled_date, customer_name, customer_email,
           estimate, billing_mode, billing_rate, status
    from public.jobs where id = ${id} and company_id = ${user.companyId} limit 1
  `;
  const rows = await sql`
    update public.jobs set
      title = ${input.title},
      place = ${input.place},
      scheduled_date = ${input.scheduled_date},
      customer_name = ${input.customer_name},
      customer_email = ${input.customer_email},
      estimate = ${input.estimate},
      billing_mode = ${input.billing_mode},
      billing_rate = ${input.billing_rate ?? null},
      status = coalesce(${status}, status),
      updated_at = now()
    where id = ${id} and company_id = ${user.companyId}
    returning *
  `;
  await auditUser(user, {
    action: "job.update", entity: "job", entityId: id,
    detail: { title: input.title, changes: diff(beforeRows[0], rows[0], JOB_AUDIT_FIELDS) },
  });
  revalidatePath("/jobs");
  return { data: rows[0] };
}

export async function deleteJob(id: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "jobs.delete")) return { error: "Forbidden" };
  // Capture identifying fields before the row is gone, so the log is readable.
  const beforeRows = await sql`
    select title, customer_name, status from public.jobs where id = ${id} and company_id = ${user.companyId} limit 1
  `;
  await sql`delete from public.jobs where id = ${id} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: "job.delete", entity: "job", entityId: id,
    detail: beforeRows[0]
      ? { title: beforeRows[0].title, customer: beforeRows[0].customer_name, status: beforeRows[0].status }
      : undefined,
  });
  revalidatePath("/jobs");
  return { ok: true };
}

export async function getJobDetail(jobId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "jobs.view")) return { error: "Forbidden" };

  const [jobRows, crewRows, allEmployees, jobItems, catalog, costs, punches, companyRows, invoices, notesRows, filesRows] =
    await Promise.all([
      sql`select * from public.jobs where id = ${jobId} and company_id = ${user.companyId} limit 1`,
      sql`select w.id, w.name, w.role_title, w.pay_rate, w.require_punch_photo
          from public.job_employees jw join public.employees w on w.id = jw.employee_id
          where jw.job_id = ${jobId}`,
      sql`select id, name, role_title, pay_rate, require_punch_photo from public.employees
          where company_id = ${user.companyId} order by name`,
      sql`select * from public.job_items where job_id = ${jobId}`,
      sql`select * from public.items where company_id = ${user.companyId} order by name`,
      sql`select * from public.job_costs where job_id = ${jobId}`,
      sql`select * from public.punches where job_id = ${jobId} order by started_at desc`,
      sql`select * from public.companies where id = ${user.companyId} limit 1`,
      sql`select id, number, status, total, created_at, subtotal, tax, line_items,
              customer_name, customer_email, notes, due_date, file_name
          from public.invoices where job_id = ${jobId} order by created_at desc`,
      sql`select body_html, updated_at, updated_by from public.job_notes where job_id = ${jobId} limit 1`,
      // Resilient if the job_files table hasn't been migrated yet.
      sql`select id, name, url, content_type, size_bytes, kind, created_at
          from public.job_files where job_id = ${jobId} order by created_at desc`.catch(() => [] as any[]),
    ]);

  if (!jobRows.length) return { error: "Not found" };

  return {
    data: {
      job: jobRows[0],
      crew: crewRows,
      allEmployees,
      jobItems,
      catalog,
      costs,
      punches,
      company: companyRows[0] ?? null,
      invoices,
      notes: notesRows[0] ?? null,
      files: filesRows,
    },
  };
}
