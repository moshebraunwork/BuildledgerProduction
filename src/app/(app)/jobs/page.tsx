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

  const c = (perm: string) => can(user.isSuperadmin, user.permissions, perm);

  return (
    <>
      <PageHeader title="Jobs" description="All jobs, scheduling, and status." />
      <JobsManager
        initialJobs={jobs as any[]}
        canEdit={c("jobs.edit")}
        canDelete={c("jobs.delete")}
        perms={{
          jobEdit: c("jobs.edit"),
          jobDelete: c("jobs.delete"),
          punchesView: c("punches.view"),
          punchesManage: c("punches.manage"),
          mediaView: c("media.view"),
          mediaManage: c("media.manage"),
          invoicesView: c("invoices.view"),
          invoicesCreate: c("invoices.create"),
          invoicesEdit: c("invoices.edit"),
          invoicesSend: c("invoices.send"),
          notesView: c("notes.view"),
          notesEdit: c("notes.edit"),
        }}
      />
    </>
  );
}
