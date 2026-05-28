import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { EmployeesManager } from "./employees-manager";

export default async function EmployeesPage() {
  const user = await requirePermission("employees.view");
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
