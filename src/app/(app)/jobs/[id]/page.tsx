import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { JobDetail } from "./job-detail";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params; // Next 15: params is async
  const user = await requirePermission("jobs.view");

  const jobRows = await sql`select * from public.jobs where id = ${jobId} and company_id = ${user.companyId} limit 1`;
  if (!jobRows.length) notFound();
  const job = jobRows[0];

  const [crewRows, allEmployees, jobItems, catalog, costs, punches, companyRows, existingInvoices] = await Promise.all([
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
    sql`select id, number, status, total, created_at from public.invoices where job_id = ${jobId} order by created_at desc`,
  ]);

  return (
    <JobDetail
      job={job as any}
      crew={crewRows as any[]}
      allEmployees={allEmployees as any[]}
      jobItems={jobItems as any[]}
      catalog={catalog as any[]}
      costs={costs as any[]}
      punches={punches as any[]}
      company={(companyRows as any[])[0] ?? null}
      invoices={existingInvoices as any[]}
      companyId={user.companyId}
      perms={{
        edit: can(user.isSuperadmin, user.permissions, "jobs.edit"),
        punches: can(user.isSuperadmin, user.permissions, "punches.manage"),
        invoiceCreate: can(user.isSuperadmin, user.permissions, "invoices.create"),
        invoiceSend: can(user.isSuperadmin, user.permissions, "invoices.send"),
        isSuperadmin: user.isSuperadmin,
      }}
    />
  );
}
