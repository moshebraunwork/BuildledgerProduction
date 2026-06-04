import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { MapView, type JobPin, type EmpPin } from "./map-view";

export default async function MapPage() {
  const user = await requirePermission("map.view");
  const canEmployees = can(user.isSuperadmin, user.permissions, "map.employees");

  const jobs = await sql`
    select id::text as id, title, place, status, lat, lng
    from public.jobs
    where company_id = ${user.companyId} and lat is not null and lng is not null
    order by created_at desc
  `;

  let employees: any[] = [];
  if (canEmployees) {
    try {
      employees = await sql`
        select coalesce(e.name, u.full_name, u.email) as name,
               u.last_lat as lat, u.last_lng as lng, u.last_location_at as at
        from public.users u
        left join public.employees e on (e.user_id = u.id or e.clerk_user_id = u.clerk_user_id)
        where u.company_id = ${user.companyId}
          and u.last_lat is not null and u.last_lng is not null
        limit 200
      `;
    } catch {
      // migration 0014 not applied yet — show jobs only
      employees = [];
    }
  }

  return (
    <>
      <PageHeader
        title="Map"
        description={canEmployees ? "Jobs and live employee locations." : "Your jobs on the map."}
      />
      <MapView jobs={jobs as JobPin[]} initialEmployees={employees as EmpPin[]} canSeeEmployees={canEmployees} />
    </>
  );
}
