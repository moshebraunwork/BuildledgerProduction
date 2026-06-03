"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditUser, diff } from "@/lib/audit";
import { round2 } from "@/lib/billing";
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
    select number, subtotal, tax, total, status, customer_name from public.invoices
    where id = ${invoiceId} and company_id = ${user.companyId}
    limit 1
  `;
  if (!rows[0]) return { error: "Invoice not found" };
  if (rows[0].status === "paid") return { error: "Paid invoices can't be edited." };

  // Recompute money server-side from the submitted line items — never trust the
  // client's subtotal/tax/total. Preserve the invoice's effective tax rate.
  const items: LineItem[] = (data.line_items ?? []).map((l) => ({
    name: String(l.name ?? ""),
    qty: l.qty == null ? undefined : Number(l.qty),
    amount: round2(Number(l.amount) || 0),
  }));
  const subtotal = round2(items.reduce((s, l) => s + l.amount, 0));
  const prevSubtotal = Number(rows[0].subtotal) || 0;
  const prevTax = Number(rows[0].tax) || 0;
  const taxRate = prevSubtotal > 0 ? prevTax / prevSubtotal : 0;
  const tax = round2(subtotal * taxRate);
  const total = round2(subtotal + tax);

  await sql`
    update public.invoices set
      customer_name  = ${data.customer_name},
      customer_email = ${data.customer_email},
      line_items     = ${JSON.stringify(items)}::jsonb,
      notes          = ${data.notes},
      due_date       = ${data.due_date ?? null},
      subtotal       = ${subtotal},
      tax            = ${tax},
      total          = ${total}
    where id = ${invoiceId} and company_id = ${user.companyId}
  `;

  await auditUser(user, {
    action: "invoice.edit",
    entity: "invoice",
    entityId: invoiceId,
    detail: {
      number: rows[0].number,
      changes: diff(
        { subtotal: rows[0].subtotal, tax: rows[0].tax, total: rows[0].total, customer_name: rows[0].customer_name },
        { subtotal, tax, total, customer_name: data.customer_name },
        ["customer_name", "subtotal", "tax", "total"]
      ),
      line_items: items.length,
    },
  });

  revalidatePath("/invoices");
  return { data: { subtotal, tax, total, line_items: items } };
}

// Record a payment against an invoice. Only an already-sent (or paid) invoice
// can be marked paid — you can't collect on a draft that was never issued.
export async function markInvoicePaid(invoiceId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!can(user.isSuperadmin, user.permissions, "invoices.edit")) return { error: "Forbidden" };
  const rows = await sql`select number, status, total from public.invoices where id = ${invoiceId} and company_id = ${user.companyId} limit 1`;
  if (!rows[0]) return { error: "Invoice not found" };
  if (rows[0].status === "draft") return { error: "Send the invoice before marking it paid." };
  await sql`update public.invoices set status = 'paid', paid_at = now() where id = ${invoiceId} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: "invoice.paid", entity: "invoice", entityId: invoiceId,
    detail: { number: rows[0].number, total: rows[0].total },
  });
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Reverse a payment (e.g. recorded by mistake) — back to "sent".
export async function markInvoiceUnpaid(invoiceId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!can(user.isSuperadmin, user.permissions, "invoices.edit")) return { error: "Forbidden" };
  const rows = await sql`select number, status, total from public.invoices where id = ${invoiceId} and company_id = ${user.companyId} limit 1`;
  if (!rows[0]) return { error: "Invoice not found" };
  if (rows[0].status !== "paid") return { error: "Invoice is not marked paid." };
  await sql`update public.invoices set status = 'sent', paid_at = null where id = ${invoiceId} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: "invoice.unpaid", entity: "invoice", entityId: invoiceId,
    detail: { number: rows[0].number, total: rows[0].total },
  });
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteInvoice(invoiceId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!can(user.isSuperadmin, user.permissions, "invoices.edit")) return { error: "Forbidden" };
  const rows = await sql`select id, number, status, total from public.invoices where id = ${invoiceId} and company_id = ${user.companyId} limit 1`;
  if (!rows[0]) return { error: "Invoice not found" };
  if (rows[0].status !== "draft") return { error: "Only draft invoices can be deleted" };
  await sql`delete from public.invoices where id = ${invoiceId}`;
  await auditUser(user, {
    action: "invoice.delete", entity: "invoice", entityId: invoiceId,
    detail: { number: rows[0].number, total: rows[0].total },
  });
  return { ok: true };
}
