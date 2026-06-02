"use server";

// ============================================================================
// Self-service clock-in — every signed-in user can clock THEMSELVES in/out for
// a shift, mark store runs, and stop work. This is intentionally separate from
// the manager-facing punch management in jobs/[id]/actions.ts: it does NOT
// require the `punches.manage` permission. Instead it resolves the caller's own
// employee record from the auth session and only ever acts on that employee.
// ============================================================================

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

// Resolve the employee row linked to the signed-in user (by internal user id or
// Clerk id), scoped to their company. Returns nulls when not signed in or when
// no employee profile is linked to the account.
async function currentEmployee() {
  const user = await getCurrentUser();
  if (!user) return { user: null as null, employee: null as any };
  const rows = await sql`
    select id, name, require_punch_photo
    from public.employees
    where company_id = ${user.companyId}
      and (user_id = ${user.id} or clerk_user_id = ${user.clerkUserId})
    limit 1
  `;
  return { user, employee: rows[0] ?? null };
}

// The caller's current shift state + the jobs they can clock into.
export async function getMyShiftStatus() {
  const { user, employee } = await currentEmployee();
  if (!user) return { error: "Unauthorized" };
  if (!employee) return { data: { employee: null, open: null, jobs: [] } };

  // The single open punch (if any). With the pause/resume model there is at
  // most one open punch at a time: 'site' = working, 'store' = at the store.
  const openRows = await sql`
    select p.id, p.job_id, p.kind, p.started_at,
           j.title as job_title, j.place as job_place,
           j.require_punch_photo as job_require_photo
    from public.punches p
    join public.jobs j on j.id = p.job_id
    where p.employee_id = ${employee.id} and p.company_id = ${user.companyId}
      and p.ended_at is null
    order by p.started_at desc
    limit 1
  `;

  // Candidate jobs for the picker + geolocation matching. Assigned jobs first.
  const jobRows = await sql`
    select j.id, j.title, j.place, j.lat, j.lng, j.status, j.require_punch_photo,
           (je.employee_id is not null) as assigned
    from public.jobs j
    left join public.job_employees je
      on je.job_id = j.id and je.employee_id = ${employee.id}
    where j.company_id = ${user.companyId}
      and j.status in ('scheduled', 'active')
    order by assigned desc, j.created_at desc
  `;

  return {
    data: {
      employee: { id: employee.id, name: employee.name, requirePhoto: employee.require_punch_photo },
      open: openRows[0] ?? null,
      jobs: jobRows,
    },
  };
}

// Start a shift: opens a 'site' punch for the caller on the chosen job.
export async function selfPunchIn(params: {
  jobId: string; photoUrl: string | null; deviceLat?: number | null; deviceLng?: number | null;
}) {
  const { user, employee } = await currentEmployee();
  if (!user) return { error: "Unauthorized" };
  if (!employee) return { error: "No employee profile is linked to your account. Ask an admin to link you." };

  // One open shift at a time.
  const open = await sql`
    select 1 from public.punches
    where employee_id = ${employee.id} and company_id = ${user.companyId} and ended_at is null
    limit 1
  `;
  if (open.length) return { error: "You already have an open shift. Stop it before starting a new one." };

  const jobRows = await sql`
    select id, require_punch_photo, lat, lng
    from public.jobs where id = ${params.jobId} and company_id = ${user.companyId} limit 1
  `;
  if (!jobRows.length) return { error: "Job not found." };
  const job = jobRows[0];

  if ((employee.require_punch_photo || job.require_punch_photo) && !params.photoUrl) {
    return { error: "A start photo is required for your punches." };
  }

  const rows = await sql`
    insert into public.punches (company_id, job_id, employee_id, kind, started_photo_url)
    values (${user.companyId}, ${params.jobId}, ${employee.id}, 'site', ${params.photoUrl})
    returning id
  `;
  // Auto-activate the job on first punch (mirrors the manager punchIn flow).
  await sql`
    update public.jobs set status = 'active'
    where id = ${params.jobId} and company_id = ${user.companyId} and status = 'scheduled'
  `;
  // Seed the job's coordinates from the worker's device the first time someone
  // clocks in on-site, so future clock-ins can auto-detect this job.
  if (job.lat == null && job.lng == null && params.deviceLat != null && params.deviceLng != null) {
    await sql`
      update public.jobs set lat = ${params.deviceLat}, lng = ${params.deviceLng}
      where id = ${params.jobId} and company_id = ${user.companyId} and lat is null and lng is null
    `;
  }
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.self_in", entity: "punch", entityId: rows[0].id });
  revalidatePath("/jobs");
  return { ok: true };
}

// Pause to go to the store: closes the open 'site' punch and opens a 'store'
// punch on the same job. Keeps shift and store time as separate, non-overlapping
// records so billing stays exact in both "exclude store time" modes.
export async function selfStoreOut() {
  const { user, employee } = await currentEmployee();
  if (!user) return { error: "Unauthorized" };
  if (!employee) return { error: "No employee profile linked." };

  const openRows = await sql`
    select id, job_id, kind from public.punches
    where employee_id = ${employee.id} and company_id = ${user.companyId} and ended_at is null
    order by started_at desc limit 1
  `;
  const cur = openRows[0];
  if (!cur) return { error: "You're not clocked in." };
  if (cur.kind !== "site") return { error: "You're already marked at the store." };

  await sql`update public.punches set ended_at = now() where id = ${cur.id} and company_id = ${user.companyId}`;
  await sql`
    insert into public.punches (company_id, job_id, employee_id, kind)
    values (${user.companyId}, ${cur.job_id}, ${employee.id}, 'store')
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.store_out", entity: "punch", entityId: cur.id });
  return { ok: true };
}

// Return from the store: closes the open 'store' punch and resumes a 'site'
// punch on the same job.
export async function selfStoreReturn() {
  const { user, employee } = await currentEmployee();
  if (!user) return { error: "Unauthorized" };
  if (!employee) return { error: "No employee profile linked." };

  const openRows = await sql`
    select id, job_id, kind from public.punches
    where employee_id = ${employee.id} and company_id = ${user.companyId} and ended_at is null
    order by started_at desc limit 1
  `;
  const cur = openRows[0];
  if (!cur) return { error: "You're not clocked in." };
  if (cur.kind !== "store") return { error: "You're not marked at the store." };

  await sql`update public.punches set ended_at = now() where id = ${cur.id} and company_id = ${user.companyId}`;
  await sql`
    insert into public.punches (company_id, job_id, employee_id, kind)
    values (${user.companyId}, ${cur.job_id}, ${employee.id}, 'site')
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.store_return", entity: "punch", entityId: cur.id });
  return { ok: true };
}

// Stop working for this shift: closes whichever punch is currently open.
export async function selfPunchOut(params: { photoUrl: string | null }) {
  const { user, employee } = await currentEmployee();
  if (!user) return { error: "Unauthorized" };
  if (!employee) return { error: "No employee profile linked." };

  const openRows = await sql`
    select p.id, p.job_id, p.kind, j.require_punch_photo as job_require_photo
    from public.punches p
    join public.jobs j on j.id = p.job_id
    where p.employee_id = ${employee.id} and p.company_id = ${user.companyId} and p.ended_at is null
    order by p.started_at desc limit 1
  `;
  const cur = openRows[0];
  if (!cur) return { error: "You're not clocked in." };

  if ((employee.require_punch_photo || cur.job_require_photo) && !params.photoUrl) {
    return { error: "An end photo is required for your punches." };
  }

  await sql`
    update public.punches set ended_at = now(), ended_photo_url = ${params.photoUrl}
    where id = ${cur.id} and company_id = ${user.companyId}
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.self_out", entity: "punch", entityId: cur.id });
  revalidatePath("/jobs");
  return { ok: true };
}
