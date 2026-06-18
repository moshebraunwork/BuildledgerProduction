"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export interface CustomerDetail {
  emails: string[];
  addresses: string[];
  jobs: { id: string; title: string; status: string; scheduled_date: string | null; estimate: number }[];
  invoices: { id: string; number: string; total: number; status: string; created_at: string }[];
}

export async function getCustomerDetail(name: string): Promise<{ data?: CustomerDetail; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "jobs.view")) return { error: "Forbidden" };
  const canInvoices = can(user.isSuperadmin, user.permissions, "invoices.view");

  const jobs = (await sql`
    select id::text as id, title, status, scheduled_date, coalesce(estimate, 0)::float as estimate,
           customer_email, place
    from public.jobs
    where company_id = ${user.companyId} and trim(customer_name) = ${name}
    order by created_at desc
  `) as any[];

  const invoices = canInvoices
    ? ((await sql`
        select i.id::text as id, i.number, coalesce(i.total, 0)::float as total, i.status, i.created_at
        from public.invoices i
        join public.jobs j on j.id = i.job_id
        where i.company_id = ${user.companyId} and trim(j.customer_name) = ${name}
        order by i.created_at desc
      `) as any[])
    : [];

  const emails = Array.from(new Set(jobs.map((j) => j.customer_email).filter(Boolean))) as string[];
  const addresses = Array.from(new Set(jobs.map((j) => j.place).filter(Boolean))) as string[];

  return {
    data: {
      emails,
      addresses,
      jobs: jobs.map((j) => ({ id: j.id, title: j.title, status: j.status, scheduled_date: j.scheduled_date ? new Date(j.scheduled_date).toISOString() : null, estimate: j.estimate })),
      invoices: invoices.map((i) => ({ id: i.id, number: i.number, total: i.total, status: i.status, created_at: new Date(i.created_at).toISOString() })),
    },
  };
}
