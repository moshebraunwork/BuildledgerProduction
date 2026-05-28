"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

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
