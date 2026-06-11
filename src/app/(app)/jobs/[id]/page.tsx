import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { JobSlideOver } from "../job-slide-over";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params; // Next 15: params is async
  const user = await requirePermission("jobs.view");

  const jobRows = await sql`select id from public.jobs where id = ${jobId} and company_id = ${user.companyId} limit 1`;
  if (!jobRows.length) notFound();

  const c = (perm: string) => can(user.isSuperadmin, user.permissions, perm);

  return (
    <JobSlideOver
      jobId={jobId}
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
      }}
    />
  );
}
