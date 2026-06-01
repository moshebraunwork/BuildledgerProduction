"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

interface LineItem { name: string; qty?: number; amount: number; }

export async function updateInvoice(
  invoiceId: string,
  data: {
    customer_name: string | null;
    customer_email: string | null;
    line_items: LineItem[];
    notes: string | null;
    due_date: string | null;
    subtotal: number;
    tax: number;
    total: number;
  }
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!can(user.isSuperadmin, user.permissions, "invoices.edit")) return { error: "Forbidden" };

  const rows = await sql`
    select id from public.invoices
    where id = ${invoiceId} and company_id = ${user.companyId}
    limit 1
  `;
  if (!rows[0]) return { error: "Invoice not found" };

  await sql`
    update public.invoices set
      customer_name  = ${data.customer_name},
      customer_email = ${data.customer_email},
      line_items     = ${JSON.stringify(data.line_items)}::jsonb,
      notes          = ${data.notes},
      due_date       = ${data.due_date ?? null},
      subtotal       = ${data.subtotal},
      tax            = ${data.tax},
      total          = ${data.total}
    where id = ${invoiceId}
  `;

  await audit({
    companyId: user.companyId,
    actorId: user.id,
    actorEmail: user.email,
    action: "invoice.edit",
    entity: "invoice",
    entityId: invoiceId,
  });

  return { ok: true };
}

// Record a payment against an invoice. Only an already-sent (or paid) invoice
// can be marked paid — you can't collect on a draft that was never issued.
export async function markInvoicePaid(invoiceId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!can(user.isSuperadmin, user.permissions, "invoices.edit")) return { error: "Forbidden" };
  const rows = await sql`select status from public.invoices where id = ${invoiceId} and company_id = ${user.companyId} limit 1`;
  if (!rows[0]) return { error: "Invoice not found" };
  if (rows[0].status === "draft") return { error: "Send the invoice before marking it paid." };
  await sql`update public.invoices set status = 'paid', paid_at = now() where id = ${invoiceId} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "invoice.paid", entity: "invoice", entityId: invoiceId });
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Reverse a payment (e.g. recorded by mistake) — back to "sent".
export async function markInvoiceUnpaid(invoiceId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!can(user.isSuperadmin, user.permissions, "invoices.edit")) return { error: "Forbidden" };
  const rows = await sql`select status from public.invoices where id = ${invoiceId} and company_id = ${user.companyId} limit 1`;
  if (!rows[0]) return { error: "Invoice not found" };
  if (rows[0].status !== "paid") return { error: "Invoice is not marked paid." };
  await sql`update public.invoices set status = 'sent', paid_at = null where id = ${invoiceId} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "invoice.unpaid", entity: "invoice", entityId: invoiceId });
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteInvoice(invoiceId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!can(user.isSuperadmin, user.permissions, "invoices.edit")) return { error: "Forbidden" };
  const rows = await sql`select id, status from public.invoices where id = ${invoiceId} and company_id = ${user.companyId} limit 1`;
  if (!rows[0]) return { error: "Invoice not found" };
  if (rows[0].status !== "draft") return { error: "Only draft invoices can be deleted" };
  await sql`delete from public.invoices where id = ${invoiceId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "invoice.delete", entity: "invoice", entityId: invoiceId });
  return { ok: true };
}
