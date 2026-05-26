import { requirePermission } from "@/lib/guard";
import { createClient, getCurrentUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { WorkersManager } from "./workers-manager";

export default async function WorkersPage() {
  const user = await requirePermission("workers.view");
  const supabase = createClient();
  const { data: workers } = await supabase.from("workers").select("*").order("name");

  return (
    <>
      <PageHeader title="Workers" description="Your crew, pay rates, and punch settings." />
      <WorkersManager
        initialWorkers={workers ?? []}
        canEdit={can(user.isSuperadmin, user.permissions, "workers.edit")}
        canDelete={can(user.isSuperadmin, user.permissions, "workers.delete")}
        companyId={user.companyId}
      />
    </>
  );
}
