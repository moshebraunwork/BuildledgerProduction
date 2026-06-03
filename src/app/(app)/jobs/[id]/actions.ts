"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditUser } from "@/lib/audit";
import { computeBilling } from "@/lib/billing";
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
  const emp = await sql`select name from public.employees where id = ${workerId} and company_id = ${user.companyId} limit 1`;
  if (!emp.length) return { error: "Not found" };
  await sql`insert into public.job_employees (job_id, employee_id) values (${jobId}, ${workerId}) on conflict do nothing`;
  await auditUser(user, {
    action: "crew.add", entity: "job", entityId: jobId,
    detail: { employee: emp[0].name },
  });
  return { ok: true };
}
export async function removeCrew(jobId: string, workerId: string) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  if (!(await jobInCompany(jobId, user.companyId))) return { error: "Not found" };
  const emp = await sql`select name from public.employees where id = ${workerId} and company_id = ${user.companyId} limit 1`;
  await sql`delete from public.job_employees where job_id = ${jobId} and employee_id = ${workerId}`;
  await auditUser(user, {
    action: "crew.remove", entity: "job", entityId: jobId,
    detail: { employee: emp[0]?.name },
  });
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
  const empName = await sql`select name from public.employees where id = ${params.workerId} and company_id = ${user.companyId} limit 1`;
  await auditUser(user, {
    action: "punch.in", entity: "punch", entityId: rows[0].id,
    detail: { employee: empName[0]?.name, kind: params.kind },
  });
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
  await auditUser(user, { action: "punch.out", entity: "punch", entityId: params.punchId });
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
  await auditUser(user, {
    action: "job_item.add", entity: "job", entityId: params.jobId,
    detail: { item: item.name, qty, charge: item.charge },
  });
  return { data: rows[0] };
}
export async function removeJobItem(id: string) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  // job_items has no company_id; scope via its parent job.
  const before = await sql`
    select ji.job_id, ji.name, ji.qty from public.job_items ji
    join public.jobs j on j.id = ji.job_id
    where ji.id = ${id} and j.company_id = ${user.companyId} limit 1
  `;
  await sql`
    delete from public.job_items ji
    using public.jobs j
    where ji.id = ${id} and ji.job_id = j.id and j.company_id = ${user.companyId}
  `;
  if (before[0]) {
    await auditUser(user, {
      action: "job_item.remove", entity: "job", entityId: before[0].job_id,
      detail: { item: before[0].name, qty: before[0].qty },
    });
  }
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
  await auditUser(user, {
    action: "job_cost.add", entity: "job", entityId: params.jobId,
    detail: { label: params.label, charge: params.charge },
  });
  return { data: rows[0] };
}
export async function removeJobCost(id: string) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  const before = await sql`
    select jc.job_id, jc.label, jc.charge from public.job_costs jc
    join public.jobs j on j.id = jc.job_id
    where jc.id = ${id} and j.company_id = ${user.companyId} limit 1
  `;
  await sql`
    delete from public.job_costs jc
    using public.jobs j
    where jc.id = ${id} and jc.job_id = j.id and j.company_id = ${user.companyId}
  `;
  if (before[0]) {
    await auditUser(user, {
      action: "job_cost.remove", entity: "job", entityId: before[0].job_id,
      detail: { label: before[0].label, charge: before[0].charge },
    });
  }
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
// Authoritative billing: the server recomputes line items and totals from the
// job's own items/costs/punches and the company's rate/tax. Client-supplied
// amounts are never trusted. `excludeStoreTime` is the only billing preference
// taken from the client (it isn't persisted on the job).
export async function generateInvoice(params: { jobId: string; excludeStoreTime?: boolean }) {
  const user = await requireUser("invoices.create");
  if (!user) return { error: "Forbidden" };

  const jobRows = await sql`
    select id, customer_name, customer_email, billing_mode, billing_rate
    from public.jobs where id = ${params.jobId} and company_id = ${user.companyId} limit 1
  `;
  if (!jobRows.length) return { error: "Not found" };
  const job = jobRows[0];

  const [items, costs, punches, companyRows, empRows] = await Promise.all([
    sql`select name, qty, charge, excluded from public.job_items where job_id = ${params.jobId}`,
    sql`select label, charge, excluded from public.job_costs where job_id = ${params.jobId}`,
    sql`select employee_id, kind, started_at, ended_at from public.punches where job_id = ${params.jobId}`,
    sql`select default_rate, tax_rate from public.companies where id = ${user.companyId} limit 1`,
    // Names for everyone who could appear on a labor line (crew + anyone punched).
    sql`select id, name from public.employees where company_id = ${user.companyId}`,
  ]);

  const employeeName: Record<string, string> = {};
  for (const e of empRows as any[]) employeeName[e.id] = e.name;

  const company = (companyRows as any[])[0] ?? null;
  const rate = Number(job.billing_rate ?? company?.default_rate ?? 0);
  const taxRate = Number(company?.tax_rate ?? 0);

  const { lines, subtotal, tax, total } = computeBilling({
    billingMode: job.billing_mode,
    rate,
    taxRate,
    excludeStoreTime: params.excludeStoreTime ?? true,
    items: (items as any[]).map((i) => ({ name: i.name, qty: Number(i.qty), charge: Number(i.charge), excluded: i.excluded })),
    costs: (costs as any[]).map((c) => ({ label: c.label, charge: Number(c.charge), excluded: c.excluded })),
    punches: punches as any[],
    employeeName,
    nowMs: Date.now(),
  });

  if (lines.length === 0) return { error: "Nothing to bill yet." };

  // Atomic, collision-free per-company invoice number.
  const seqRows = await sql`
    update public.companies set invoice_seq = invoice_seq + 1
    where id = ${user.companyId}
    returning invoice_seq
  `;
  const seq = Number(seqRows[0]?.invoice_seq ?? Date.now());
  const number = `INV-${String(seq).padStart(6, "0")}`;

  const rows = await sql`
    insert into public.invoices
      (company_id, job_id, number, customer_name, customer_email, subtotal, tax, total, line_items, status)
    values
      (${user.companyId}, ${params.jobId}, ${number}, ${job.customer_name}, ${job.customer_email},
       ${subtotal}, ${tax}, ${total}, ${JSON.stringify(lines)}, 'draft')
    returning id, number, status, subtotal, tax, total, line_items, created_at
  `;
  await auditUser(user, {
    action: "invoice.create", entity: "invoice", entityId: rows[0].id,
    detail: { number, total, customer: job.customer_name },
  });
  revalidatePath("/invoices");
  return { data: rows[0] };
}

// ---- job status ----
export async function setJobStatus(jobId: string, status: string) {
  const user = await requireUser("jobs.edit");
  if (!user) return { error: "Forbidden" };
  // Whitelist the status values the UI can set.
  if (!["scheduled", "active", "complete"].includes(status)) return { error: "Invalid status" };
  const before = await sql`select title, status from public.jobs where id = ${jobId} and company_id = ${user.companyId} limit 1`;
  await sql`update public.jobs set status = ${status} where id = ${jobId} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: "job.status", entity: "job", entityId: jobId,
    detail: { title: before[0]?.title, from: before[0]?.status, to: status },
  });
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
  const empName = await sql`select name from public.employees where id = ${params.employeeId} and company_id = ${user.companyId} limit 1`;
  await auditUser(user, {
    action: "punch.admin_create", entity: "punch", entityId: rows[0].id,
    detail: { employee: empName[0]?.name, kind: params.kind, started_at: params.startedAt, ended_at: params.endedAt },
  });
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
  await auditUser(user, {
    action: "punch.admin_edit", entity: "punch", entityId: punchId,
    detail: { started_at: params.startedAt, ended_at: params.endedAt, kind: params.kind },
  });
  return { ok: true };
}

export async function adminDeletePunchEndTime(punchId: string) {
  const user = await requireUser("punches.manage");
  if (!user) return { error: "Forbidden" };
  await sql`
    update public.punches set ended_at = null, ended_photo_url = null, edited_by = ${user.id}, edited_at = now()
    where id = ${punchId} and company_id = ${user.companyId}
  `;
  await auditUser(user, { action: "punch.admin_remove_end", entity: "punch", entityId: punchId });
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
  await auditUser(user, { action: "punch.admin_delete", entity: "punch", entityId: punchId });
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
  await auditUser(user, { action: "job_notes.save", entity: "job", entityId: jobId });
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
  await auditUser(user, {
    action: "media.upload", entity: "job", entityId: params.jobId,
    detail: { name, kind, size_bytes: params.sizeBytes },
  });
  return { data: rows[0] };
}

export async function removeJobFile(id: string) {
  const user = await requireUser("media.manage");
  if (!user) return { error: "Forbidden" };
  const before = await sql`select job_id, name, kind from public.job_files where id = ${id} and company_id = ${user.companyId} limit 1`;
  await sql`delete from public.job_files where id = ${id} and company_id = ${user.companyId}`;
  if (before[0]) {
    await auditUser(user, {
      action: "media.delete", entity: "job", entityId: before[0].job_id,
      detail: { name: before[0].name, kind: before[0].kind },
    });
  }
  return { ok: true };
}
