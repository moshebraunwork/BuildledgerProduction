import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { EmployeesManager } from "./employees-manager";
import type { EmpPin } from "@/app/(app)/map/map-view";

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

  const canMap = can(user.isSuperadmin, user.permissions, "map.employees");
  let locationPins: EmpPin[] = [];
  if (canMap) {
    try {
      locationPins = (await sql`
        select e.id::text as employee_id,
               coalesce(e.name, u.full_name, u.email) as name,
               u.last_lat as lat, u.last_lng as lng, u.last_location_at as at
        from public.users u
        left join public.employees e on (e.user_id = u.id or e.clerk_user_id = u.clerk_user_id)
        where u.company_id = ${user.companyId}
          and u.last_lat is not null and u.last_lng is not null
        limit 200
      `) as EmpPin[];
    } catch {
      locationPins = [];
    }
  }

  return (
    <EmployeesManager
      initialEmployees={employees as any[]}
      canEdit={can(user.isSuperadmin, user.permissions, "employees.edit")}
      canDelete={can(user.isSuperadmin, user.permissions, "employees.delete")}
      canMap={canMap}
      locationPins={locationPins}
    />
  );
}
