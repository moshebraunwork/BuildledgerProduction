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
      and u.clerk_user_id is not null
  `;

  // Each employee with its linked login account (if any), so the unified Team
  // editor can show work details and app access together.
  const employees = await sql`
    select e.*,
           acc.id::text          as account_id,
           acc.role_id::text     as account_role_id,
           acc.is_active         as account_active,
           acc.email             as account_email,
           acc.is_superadmin     as account_superadmin,
           (acc.clerk_user_id is not null) as account_signed_up
    from public.employees e
    left join lateral (
      select u.* from public.users u
      where u.company_id = e.company_id
        and (
          (e.user_id is not null and u.id = e.user_id)
          or (e.invite_email is not null and lower(u.email) = lower(e.invite_email))
        )
      order by case when e.user_id is not null and u.id = e.user_id then 0 else 1 end
      limit 1
    ) acc on true
    where e.company_id = ${user.companyId}
    order by e.name
  `;

  const canManageAccess = can(user.isSuperadmin, user.permissions, "admin.users");
  const roles = canManageAccess
    ? await sql`select id::text as id, name from public.roles where company_id = ${user.companyId} order by is_system desc, name`
    : [];

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
      canManageAccess={canManageAccess}
      roles={roles as { id: string; name: string }[]}
      canMap={canMap}
      locationPins={locationPins}
    />
  );
}
