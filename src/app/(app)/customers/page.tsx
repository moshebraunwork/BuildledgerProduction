import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { CustomersManager, type Customer } from "./customers-manager";

const PALETTE = ["#0066ff", "#7c3aed", "#16a34a", "#ea580c", "#0891b2", "#d97706", "#db2777", "#4f46e5"];
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export default async function CustomersPage() {
  const user = await requirePermission("jobs.view");
  const cid = user.companyId;

  // Customers are derived from jobs (no separate table yet). LTV comes from
  // issued/paid invoices tied to that customer's jobs.
  const [jobAgg, revAgg] = await Promise.all([
    sql`
      select trim(customer_name) as name,
             count(*)::int as jobs,
             count(*) filter (where status <> 'complete')::int as open_jobs,
             max(customer_email) as email,
             max(scheduled_date) as last_job,
             coalesce(sum(estimate), 0)::float as estimate
      from public.jobs
      where company_id = ${cid} and customer_name is not null and trim(customer_name) <> ''
      group by 1
    `,
    sql`
      select trim(j.customer_name) as name, coalesce(sum(i.total), 0)::float as revenue
      from public.invoices i
      join public.jobs j on j.id = i.job_id
      where i.company_id = ${cid} and i.status in ('sent', 'paid')
        and j.customer_name is not null and trim(j.customer_name) <> ''
      group by 1
    `,
  ]);

  const revByName = new Map<string, number>();
  for (const r of revAgg as any[]) revByName.set(r.name, Number(r.revenue) || 0);

  const now = Date.now();
  const customers: Customer[] = (jobAgg as any[])
    .map((r) => {
      const name = r.name as string;
      const revenue = revByName.get(name) ?? 0;
      const ltv = revenue > 0 ? revenue : Number(r.estimate) || 0;
      const lastJob: string | null = r.last_job ? new Date(r.last_job).toISOString() : null;
      const daysSince = lastJob ? (now - new Date(lastJob).getTime()) / 86400000 : Infinity;
      let tag: Customer["tag"];
      if (r.jobs >= 5 || revenue >= 10000) tag = "VIP";
      else if (r.jobs <= 1) tag = "NEW";
      else if (daysSince <= 90) tag = "ACTIVE";
      else tag = "PAST";
      return {
        name,
        email: r.email ?? null,
        jobs: Number(r.jobs) || 0,
        openJobs: Number(r.open_jobs) || 0,
        ltv,
        lastJob,
        tag,
        initials: initialsOf(name),
        color: colorFor(name),
      };
    })
    .sort((a, b) => b.ltv - a.ltv);

  return <CustomersManager customers={customers} />;
}
