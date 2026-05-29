import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const user = await requirePermission("admin.users");
  const [users, roles] = await Promise.all([
    sql`select id, clerk_user_id, email, full_name, role_id, is_active, is_superadmin
        from public.users where company_id = ${user.companyId} order by email`,
    sql`select id, name from public.roles where company_id = ${user.companyId} order by name`,
  ]);
  return (
    <>
      <PageHeader title="Users" description="Assign roles and control who can access the system." />
      <UsersManager initialUsers={users as any[]} roles={roles as any[]} />
    </>
  );
}
