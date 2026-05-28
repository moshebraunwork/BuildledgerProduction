import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { JobsManager } from "./jobs-manager";

export default async function JobsPage() {
  const user = await requirePermission("jobs.view");
  const jobs = await sql`
    select id, title, place, scheduled_date, customer_name, status, estimate, billing_mode
    from public.jobs where company_id = ${user.companyId}
    order by created_at desc
  `;
  return (
    <>
      <PageHeader title="Jobs" description="All jobs, scheduling, and status." />
      <JobsManager
        initialJobs={jobs as any[]}
        canEdit={can(user.isSuperadmin, user.permissions, "jobs.edit")}
        canDelete={can(user.isSuperadmin, user.permissions, "jobs.delete")}
      />
    </>
  );
}
