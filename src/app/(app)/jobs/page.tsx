import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { JobsManager } from "./jobs-manager";
import type { EmpPin } from "@/app/(app)/map/map-view";

export default async function JobsPage() {
  const user = await requirePermission("jobs.view");
  const jobs = await sql`
    select id, title, place, scheduled_date, customer_name, status, estimate, billing_mode, lat, lng
    from public.jobs where company_id = ${user.companyId}
    order by created_at desc
  `;

  const c = (perm: string) => can(user.isSuperadmin, user.permissions, perm);
  const canMap = c("map.view");
  const canSeeEmployees = c("map.employees");

  // Employee locations for the embedded map (only if the user may see them).
  let employeePins: EmpPin[] = [];
  if (canMap && canSeeEmployees) {
    try {
      employeePins = (await sql`
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
      employeePins = [];
    }
  }

  return (
    <JobsManager
      initialJobs={jobs as any[]}
      canEdit={c("jobs.edit")}
      canDelete={c("jobs.delete")}
      canMap={canMap}
      canSeeEmployees={canSeeEmployees}
      employeePins={employeePins}
    />
  );
}
