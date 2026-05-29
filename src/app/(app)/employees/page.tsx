import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { EmployeesManager } from "./employees-manager";

export default async function EmployeesPage() {
  const user = await requirePermission("employees.view");
  // Auto-sync invite_status: if a matching user exists in our users table, mark accepted
  await sql`
    update public.employees e
    set invite_status = 'accepted'
    from public.users u
    where e.company_id = ${user.companyId}
      and e.invite_status = 'pending'
      and u.company_id = ${user.companyId}
      and lower(u.email) = lower(e.invite_email)
  `;
  const employees = await sql`select * from public.employees where company_id = ${user.companyId} order by name`;
  return (
    <>
      <PageHeader title="Employees" description="Your crew, pay rates, and punch settings." />
      <EmployeesManager
        initialEmployees={employees as any[]}
        canEdit={can(user.isSuperadmin, user.permissions, "employees.edit")}
        canDelete={can(user.isSuperadmin, user.permissions, "employees.delete")}
      />
    </>
  );
}
