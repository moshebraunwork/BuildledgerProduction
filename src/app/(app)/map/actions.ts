"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

// Record the signed-in user's current device location. Called periodically by
// the location tracker. Best-effort: a DB that hasn't run migration 0014 simply
// no-ops rather than erroring.
export async function reportLocation(loc: { lat: number; lng: number; accuracy?: number | null }) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "Invalid coordinates" };
  try {
    await sql`
      update public.users
      set last_lat = ${lat}, last_lng = ${lng}, last_location_at = now(),
          location_accuracy = ${loc.accuracy ?? null}
      where id = ${user.id}
    `;
    return { ok: true };
  } catch {
    return { error: "not-configured" };
  }
}

export interface EmployeeLocation {
  name: string;
  lat: number;
  lng: number;
  at: string | null;
}

// Current known locations of people in the company (for the map + periodic
// refresh). Gated by map.employees.
export async function getEmployeeLocations(): Promise<{ employees: EmployeeLocation[] } | { error: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "map.employees")) return { error: "Forbidden" };
  try {
    const rows = await sql`
      select coalesce(e.name, u.full_name, u.email) as name,
             u.last_lat as lat, u.last_lng as lng, u.last_location_at as at
      from public.users u
      left join public.employees e on (e.user_id = u.id or e.clerk_user_id = u.clerk_user_id)
      where u.company_id = ${user.companyId}
        and u.last_lat is not null and u.last_lng is not null
      order by u.last_location_at desc nulls last
      limit 200
    `;
    return { employees: rows as EmployeeLocation[] };
  } catch {
    return { employees: [] };
  }
}
