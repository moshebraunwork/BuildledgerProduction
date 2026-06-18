"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditUser } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export interface JobStatus { id: string; key: string; label: string; color: string; position: number; is_system: boolean; }

// The three built-ins, used as a fallback if migration 0016 hasn't run yet.
const DEFAULT_STATUSES: JobStatus[] = [
  { id: "scheduled", key: "scheduled", label: "Scheduled", color: "#0ea5e9", position: 0, is_system: true },
  { id: "active", key: "active", label: "In progress", color: "#10b981", position: 1, is_system: true },
  { id: "complete", key: "complete", label: "Completed", color: "#a1a1aa", position: 2, is_system: true },
];

export async function listJobStatuses(companyId: string): Promise<JobStatus[]> {
  try {
    const rows = (await sql`
      select id::text as id, key, label, color, position, is_system
      from public.job_statuses where company_id = ${companyId}
      order by position, label
    `) as any[];
    if (rows.length) return rows as JobStatus[];
    return DEFAULT_STATUSES;
  } catch {
    return DEFAULT_STATUSES;
  }
}

function slugify(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "status";
}

export async function createJobStatus(label: string, color: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "jobs.statuses")) return { error: "Forbidden" };
  const clean = label.trim();
  if (!clean) return { error: "Label required" };

  let key = slugify(clean);
  try {
    // Ensure a unique key within the company.
    const existing = (await sql`select key from public.job_statuses where company_id = ${user.companyId}`) as any[];
    const taken = new Set(existing.map((r) => r.key));
    if (taken.has(key)) {
      let i = 2;
      while (taken.has(`${key}-${i}`)) i++;
      key = `${key}-${i}`;
    }
    const posRows = (await sql`select coalesce(max(position), -1) + 1 as p from public.job_statuses where company_id = ${user.companyId}`) as any[];
    const position = posRows[0]?.p ?? 0;
    const rows = (await sql`
      insert into public.job_statuses (company_id, key, label, color, position, is_system)
      values (${user.companyId}, ${key}, ${clean}, ${color || "#71717a"}, ${position}, false)
      returning id::text as id, key, label, color, position, is_system
    `) as any[];
    await auditUser(user, { action: "job.status_add", entity: "job_status", entityId: rows[0].id, detail: { label: clean } });
    revalidatePath("/jobs");
    return { data: rows[0] as JobStatus };
  } catch (e) {
    return { error: "Job statuses need migration 0016 — run it in Neon first." };
  }
}

export async function deleteJobStatus(id: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "jobs.statuses")) return { error: "Forbidden" };
  try {
    const rows = (await sql`select key, is_system, label from public.job_statuses where id = ${id} and company_id = ${user.companyId} limit 1`) as any[];
    if (!rows.length) return { error: "Not found" };
    if (rows[0].is_system) return { error: "Built-in statuses can't be deleted" };
    const key = rows[0].key as string;
    // Re-home any jobs currently in this status so none are orphaned.
    await sql`update public.jobs set status = 'scheduled' where company_id = ${user.companyId} and status = ${key}`;
    await sql`delete from public.job_statuses where id = ${id} and company_id = ${user.companyId}`;
    await auditUser(user, { action: "job.status_remove", entity: "job_status", entityId: id, detail: { label: rows[0].label } });
    revalidatePath("/jobs");
    return { ok: true };
  } catch {
    return { error: "Could not delete status" };
  }
}
