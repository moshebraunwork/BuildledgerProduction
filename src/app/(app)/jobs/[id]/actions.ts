"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

// Authn + permission check. Returns the user, or null if not allowed.
async function requireUser(perm: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, perm)) return null;
  return user;
}

// Tenant-isolation guard: confirms a job belongs to the caller's company.
// Every job-child mutation must pass through this so a user in company A
// cannot read/modify company B's rows by supplying a foreign UUID.
async function jobInCompany(jobId: string, companyId: string) {
  const rows = await sql`select 1 from public.jobs where id = ${jobId} and company_id = ${companyId} limit 1`;
  return rows.length > 0;
}

// ---- crew ----
export async function addCrew(jobId: string, workerId: string) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  if (!(await jobInCompany(jobId, user.companyId))) return { error: "Not found" };
  // Only attach employees that belong to the same company.
  const emp = await sql`select 1 from public.employees where id = ${workerId} and company_id = ${user.companyId} limit 1`;
  if (!emp.length) return { error: "Not found" };
  await sql`insert into public.job_employees (job_id, employee_id) values (${jobId}, ${workerId}) on conflict do nothing`;
  return { ok: true };
}
export async function removeCrew(jobId: string, workerId: string) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  if (!(await jobInCompany(jobId, user.companyId))) return { error: "Not found" };
  await sql`delete from public.job_employees where job_id = ${jobId} and employee_id = ${workerId}`;
  return { ok: true };
}

// ---- punches ----
export async function punchIn(params: {
  jobId: string; workerId: string; kind: string; note: string | null; photoUrl: string | null;
}) {
  const user = await requireUser("punches.manage");
  if (!user) return { error: "Forbidden" };
  if (!(await jobInCompany(params.jobId, user.companyId))) return { error: "Not found" };
  const rows = await sql`
    insert into public.punches (company_id, job_id, employee_id, kind, note, started_photo_url)
    values (${user.companyId}, ${params.jobId}, ${params.workerId}, ${params.kind}, ${params.note}, ${params.photoUrl})
    returning *
  `;
  // auto-activate the job on first punch
  await sql`update public.jobs set status = 'active' where id = ${params.jobId} and company_id = ${user.companyId} and status = 'scheduled'`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.in", entity: "punch", entityId: rows[0].id });
  return { data: rows[0] };
}

export async function punchOut(params: { punchId: string; note: string | null; photoUrl: string | null }) {
  const user = await requireUser("punches.manage");
  if (!user) return { error: "Forbidden" };
  await sql`
    update public.punches
    set ended_at = now(), note = ${params.note}, ended_photo_url = ${params.photoUrl}
    where id = ${params.punchId} and company_id = ${user.companyId}
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.out", entity: "punch", entityId: params.punchId });
  return { ok: true };
}

// ---- items ----
// The item's name/cost/charge are taken from the catalog server-side (not from
// the client) so a caller can't set arbitrary pricing or reference a foreign item.
export async function addJobItem(params: {
  jobId: string; itemId: string; name: string; qty: number; cost: number; charge: number; currentStock: number;
}) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  if (!(await jobInCompany(params.jobId, user.companyId))) return { error: "Not found" };
  const itemRows = await sql`
    select id, name, cost, charge from public.items where id = ${params.itemId} and company_id = ${user.companyId} limit 1
  `;
  if (!itemRows.length) return { error: "Not found" };
  const item = itemRows[0];
  const qty = Math.max(1, Math.floor(Number(params.qty) || 1));
  const rows = await sql`
    insert into public.job_items (job_id, item_id, name, qty, cost, charge)
    values (${params.jobId}, ${item.id}, ${item.name}, ${qty}, ${item.cost}, ${item.charge})
    returning *
  `;
  // Atomic decrement: compute from the current DB value, never below zero,
  // so two concurrent adds can't clobber each other's stock count.
  await sql`
    update public.items
    set stock = greatest(0, stock - ${qty})
    where id = ${item.id} and company_id = ${user.companyId}
  `;
  return { data: rows[0] };
}
export async function removeJobItem(id: string) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  // job_items has no company_id; scope via its parent job.
  await sql`
    delete from public.job_items ji
    using public.jobs j
    where ji.id = ${id} and ji.job_id = j.id and j.company_id = ${user.companyId}
  `;
  return { ok: true };
}
export async function setJobItemExcluded(id: string, excluded: boolean) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  await sql`
    update public.job_items ji
    set excluded = ${excluded}
    from public.jobs j
    where ji.id = ${id} and ji.job_id = j.id and j.company_id = ${user.companyId}
  `;
  return { ok: true };
}

// ---- one-time costs ----
export async function addJobCost(params: { jobId: string; label: string; cost: number; charge: number }) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  if (!(await jobInCompany(params.jobId, user.companyId))) return { error: "Not found" };
  const rows = await sql`
    insert into public.job_costs (job_id, label, cost, charge)
    values (${params.jobId}, ${params.label}, ${params.cost}, ${params.charge})
    returning *
  `;
  return { data: rows[0] };
}
export async function removeJobCost(id: string) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  await sql`
    delete from public.job_costs jc
    using public.jobs j
    where jc.id = ${id} and jc.job_id = j.id and j.company_id = ${user.companyId}
  `;
  return { ok: true };
}
export async function setJobCostExcluded(id: string, excluded: boolean) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  await sql`
    update public.job_costs jc
    set excluded = ${excluded}
    from public.jobs j
    where jc.id = ${id} and jc.job_id = j.id and j.company_id = ${user.companyId}
  `;
  return { ok: true };
}

// ---- invoice generation ----
export async function generateInvoice(params: {
  jobId: string; customerName: string | null; customerEmail: string | null;
  subtotal: number; tax: number; total: number; lineItems: any[];
}) {
  const user = await requireUser("invoices.create");
  if (!user) return { error: "Forbidden" };
  if (!(await jobInCompany(params.jobId, user.companyId))) return { error: "Not found" };
  const number = `INV-${Date.now().toString().slice(-6)}`;
  const rows = await sql`
    insert into public.invoices
      (company_id, job_id, number, customer_name, customer_email, subtotal, tax, total, line_items, status)
    values
      (${user.companyId}, ${params.jobId}, ${number}, ${params.customerName}, ${params.customerEmail},
       ${params.subtotal}, ${params.tax}, ${params.total}, ${JSON.stringify(params.lineItems)}, 'draft')
    returning id, number, status, total, created_at
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "invoice.create", entity: "invoice", entityId: rows[0].id });
  revalidatePath("/invoices");
  return { data: rows[0] };
}

// ---- job status ----
export async function setJobStatus(jobId: string, status: string) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  // Whitelist the status values the UI can set.
  if (!["scheduled", "active", "complete"].includes(status)) return { error: "Invalid status" };
  await sql`update public.jobs set status = ${status} where id = ${jobId} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "job.status", entity: "job", entityId: jobId, detail: { status } });
  revalidatePath("/jobs");
  return { ok: true };
}

// ---- admin punch management ----
export async function adminCreatePunch(params: {
  jobId: string; employeeId: string; kind: string;
  startedAt: string; endedAt: string | null;
  note: string | null; startedPhotoUrl: string | null; endedPhotoUrl: string | null;
}) {
  const user = await requireUser("punches.manage");
  if (!user) return { error: "Forbidden" };
  if (!(await jobInCompany(params.jobId, user.companyId))) return { error: "Not found" };
  const emp = await sql`select 1 from public.employees where id = ${params.employeeId} and company_id = ${user.companyId} limit 1`;
  if (!emp.length) return { error: "Not found" };
  const rows = await sql`
    insert into public.punches
      (company_id, job_id, employee_id, kind, started_at, ended_at, note,
       started_photo_url, ended_photo_url, edited_by, edited_at)
    values
      (${user.companyId}, ${params.jobId}, ${params.employeeId}, ${params.kind},
       ${params.startedAt}, ${params.endedAt ?? null}, ${params.note},
       ${params.startedPhotoUrl}, ${params.endedPhotoUrl}, ${user.id}, now())
    returning *
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.admin_create", entity: "punch", entityId: rows[0].id });
  return { data: rows[0] };
}

export async function adminUpdatePunch(punchId: string, params: {
  employeeId: string; kind: string;
  startedAt: string; endedAt: string | null;
  note: string | null; startedPhotoUrl: string | null; endedPhotoUrl: string | null;
}) {
  const user = await requireUser("punches.manage");
  if (!user) return { error: "Forbidden" };
  // Only allow reassigning to an employee within the same company.
  const emp = await sql`select 1 from public.employees where id = ${params.employeeId} and company_id = ${user.companyId} limit 1`;
  if (!emp.length) return { error: "Not found" };
  await sql`
    update public.punches set
      employee_id = ${params.employeeId},
      kind = ${params.kind},
      started_at = ${params.startedAt},
      ended_at = ${params.endedAt ?? null},
      note = ${params.note},
      started_photo_url = ${params.startedPhotoUrl},
      ended_photo_url = ${params.endedPhotoUrl},
      edited_by = ${user.id},
      edited_at = now()
    where id = ${punchId} and company_id = ${user.companyId}
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.admin_edit", entity: "punch", entityId: punchId });
  return { ok: true };
}

export async function adminDeletePunchEndTime(punchId: string) {
  const user = await requireUser("punches.manage");
  if (!user) return { error: "Forbidden" };
  await sql`
    update public.punches set ended_at = null, ended_photo_url = null, edited_by = ${user.id}, edited_at = now()
    where id = ${punchId} and company_id = ${user.companyId}
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.admin_remove_end", entity: "punch", entityId: punchId });
  return { ok: true };
}

export async function adminDeletePunch(punchId: string) {
  const user = await requireUser("punches.manage");
  if (!user) return { error: "Forbidden" };
  // Safety: only delete if punch has no end time (scoped to the caller's company).
  const rows = await sql`select ended_at from public.punches where id = ${punchId} and company_id = ${user.companyId} limit 1`;
  if (!rows.length) return { error: "Not found" };
  if (rows[0].ended_at) return { error: "Remove end time first before deleting this punch." };
  await sql`delete from public.punches where id = ${punchId} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.admin_delete", entity: "punch", entityId: punchId });
  return { ok: true };
}

// ---- job notes ----
export async function saveJobNotes(jobId: string, bodyHtml: string) {
  const user = await requireUser("notes.edit");
  if (!user) return { error: "Forbidden" };
  if (!(await jobInCompany(jobId, user.companyId))) return { error: "Not found" };
  await sql`
    insert into public.job_notes (company_id, job_id, body_html, updated_at, updated_by)
    values (${user.companyId}, ${jobId}, ${bodyHtml}, now(), ${user.id})
    on conflict (job_id) do update set body_html = ${bodyHtml}, updated_at = now(), updated_by = ${user.id}
  `;
  return { ok: true };
}

// ---- job files / media ----
export async function addJobFile(params: {
  jobId: string; name: string; url: string; contentType: string | null; sizeBytes: number | null; kind: string;
}) {
  const user = await requireUser("media.manage");
  if (!user) return { error: "Forbidden" };
  if (!(await jobInCompany(params.jobId, user.companyId))) return { error: "Not found" };
  // The stored URL must point at our own object storage — never an arbitrary
  // external link supplied by the client.
  const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!publicBase || !params.url.startsWith(`${publicBase}/`)) {
    return { error: "Invalid file URL" };
  }
  const kind = ["image", "video", "file"].includes(params.kind) ? params.kind : "file";
  const name = (params.name || "file").slice(0, 300);
  const rows = await sql`
    insert into public.job_files (company_id, job_id, name, url, content_type, size_bytes, kind, uploaded_by)
    values (${user.companyId}, ${params.jobId}, ${name}, ${params.url}, ${params.contentType}, ${params.sizeBytes}, ${kind}, ${user.id})
    returning id, name, url, content_type, size_bytes, kind, created_at
  `;
  return { data: rows[0] };
}

export async function removeJobFile(id: string) {
  const user = await requireUser("media.manage");
  if (!user) return { error: "Forbidden" };
  await sql`delete from public.job_files where id = ${id} and company_id = ${user.companyId}`;
  return { ok: true };
}
