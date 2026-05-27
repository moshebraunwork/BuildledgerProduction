import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { RolesManager } from "./roles-manager";

export default async function RolesPage() {
  const user = await requirePermission("admin.roles");
  const roles = await sql`
    select * from public.roles where company_id = ${user.companyId}
    order by is_system desc, name
  `;
  return (
    <>
      <PageHeader title="Roles & permissions" description="Create roles and choose exactly what each one can do." />
      <RolesManager initialRoles={roles as any[]} />
    </>
  );
}
