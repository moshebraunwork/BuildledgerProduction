import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { WorkersManager } from "./workers-manager";

export default async function WorkersPage() {
  const user = await requirePermission("workers.view");
  const workers = await sql`select * from public.workers where company_id = ${user.companyId} order by name`;
  return (
    <>
      <PageHeader title="Workers" description="Your crew, pay rates, and punch settings." />
      <WorkersManager
        initialWorkers={workers as any[]}
        canEdit={can(user.isSuperadmin, user.permissions, "workers.edit")}
        canDelete={can(user.isSuperadmin, user.permissions, "workers.delete")}
      />
    </>
  );
}
