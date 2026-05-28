"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

async function requireJobAccess(perm: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, perm)) return null;
  return user;
}

// ---- crew ----
export async function addCrew(jobId: string, workerId: string) {
  const user = await requireJobAccess("jobs.edit");
  if (!user) return { error: "Forbidden" };
  await sql`insert into public.job_employees (job_id, employee_id) values (${jobId}, ${workerId}) on conflict do nothing`;
  return { ok: true };
}
export async function removeCrew(jobId: string, workerId: string) {
  const user = await requireJobAccess("jobs.edit");
  if (!user) return { error: "Forbidden" };
  await sql`delete from public.job_employees where job_id = ${jobId} and employee_id = ${workerId}`;
  return { ok: true };
}

// ---- punches ----
export async function punchIn(params: {
  jobId: string; workerId: string; kind: string; note: string | null; photoUrl: string | null;
}) {
  const user = await requireJobAccess("punches.manage");
  if (!user) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.punches (company_id, job_id, employee_id, kind, note, started_photo_url)
    values (${user.companyId}, ${params.jobId}, ${params.workerId}, ${params.kind}, ${params.note}, ${params.photoUrl})
    returning *
  `;
  // auto-activate the job on first punch
  await sql`update public.jobs set status = 'active' where id = ${params.jobId} and status = 'scheduled'`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.in", entity: "punch", entityId: rows[0].id });
  return { data: rows[0] };
}

export async function punchOut(params: { punchId: string; note: string | null; photoUrl: string | null }) {
  const user = await requireJobAccess("punches.manage");
  if (!user) return { error: "Forbidden" };
  await sql`
    update public.punches
    set ended_at = now(), note = ${params.note}, ended_photo_url = ${params.photoUrl}
    where id = ${params.punchId}
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "punch.out", entity: "punch", entityId: params.punchId });
  return { ok: true };
}

// ---- items ----
export async function addJobItem(params: {
  jobId: string; itemId: string; name: string; qty: number; cost: number; charge: number; currentStock: number;
}) {
  const user = await requireJobAccess("jobs.edit");
  if (!user) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.job_items (job_id, item_id, name, qty, cost, charge)
    values (${params.jobId}, ${params.itemId}, ${params.name}, ${params.qty}, ${params.cost}, ${params.charge})
    returning *
  `;
  // Atomic decrement: compute from the current DB value, never below zero,
  // so two concurrent adds can't clobber each other's stock count.
  await sql`
    update public.items
    set stock = greatest(0, stock - ${params.qty})
    where id = ${params.itemId}
  `;
  return { data: rows[0] };
}
export async function removeJobItem(id: string) {
  const user = await requireJobAccess("jobs.edit");
  if (!user) return { error: "Forbidden" };
  await sql`delete from public.job_items where id = ${id}`;
  return { ok: true };
}
export async function setJobItemExcluded(id: string, excluded: boolean) {
  const user = await requireJobAccess("jobs.edit");
  if (!user) return { error: "Forbidden" };
  await sql`update public.job_items set excluded = ${excluded} where id = ${id}`;
  return { ok: true };
}

// ---- one-time costs ----
export async function addJobCost(params: { jobId: string; label: string; cost: number; charge: number }) {
  const user = await requireJobAccess("jobs.edit");
  if (!user) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.job_costs (job_id, label, cost, charge)
    values (${params.jobId}, ${params.label}, ${params.cost}, ${params.charge})
    returning *
  `;
  return { data: rows[0] };
}
export async function removeJobCost(id: string) {
  const user = await requireJobAccess("jobs.edit");
  if (!user) return { error: "Forbidden" };
  await sql`delete from public.job_costs where id = ${id}`;
  return { ok: true };
}
export async function setJobCostExcluded(id: string, excluded: boolean) {
  const user = await requireJobAccess("jobs.edit");
  if (!user) return { error: "Forbidden" };
  await sql`update public.job_costs set excluded = ${excluded} where id = ${id}`;
  return { ok: true };
}

// ---- invoice generation ----
export async function generateInvoice(params: {
  jobId: string; customerName: string | null; customerEmail: string | null;
  subtotal: number; tax: number; total: number; lineItems: any[];
}) {
  const user = await requireJobAccess("invoices.create");
  if (!user) return { error: "Forbidden" };
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
  return { data: rows[0] };
}

// ---- job status ----
export async function setJobStatus(jobId: string, status: string) {
  const user = await requireJobAccess("jobs.edit");
  if (!user) return { error: "Forbidden" };
  await sql`update public.jobs set status = ${status} where id = ${jobId} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "job.status", entity: "job", entityId: jobId, detail: { status } });
  return { ok: true };
}
