import { requirePermission } from "@/lib/guard";
import { createClient, getCurrentUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { JobsManager } from "./jobs-manager";

export default async function JobsPage() {
  const user = await requirePermission("jobs.view");
  const supabase = createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, place, scheduled_date, customer_name, status, estimate, billing_mode")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader title="Jobs" description="All jobs, scheduling, and status." />
      <JobsManager
        initialJobs={jobs ?? []}
        canEdit={can(user.isSuperadmin, user.permissions, "jobs.edit")}
        companyId={user.companyId}
      />
    </>
  );
}
