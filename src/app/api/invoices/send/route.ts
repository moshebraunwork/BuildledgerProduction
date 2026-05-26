import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, getCurrentUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { fmtMoney } from "@/lib/utils";

// POST /api/invoices/send  { invoiceId: string }
// Sends the invoice to its customer email via Resend, marks it sent, logs it.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.isSuperadmin, user.permissions, "invoices.send")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { invoiceId } = await req.json();
  const supabase = createClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (error || !invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!invoice.customer_email)
    return NextResponse.json({ error: "This invoice has no customer email" }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVOICE_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json(
      { error: "Email is not configured. Set RESEND_API_KEY and INVOICE_FROM_EMAIL." },
      { status: 500 }
    );
  }

  const lines = (invoice.line_items as Array<{ name: string; qty?: number; amount: number }>) ?? [];
  const rows = lines
    .map(
      (l) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee">${l.name}${
          l.qty ? ` × ${l.qty}` : ""
        }</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${fmtMoney(
          l.amount
        )}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="margin-bottom:4px">Invoice ${invoice.number}</h2>
      <p style="color:#666;margin-top:0">Billed to ${invoice.customer_name ?? "customer"}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <tbody>${rows}</tbody>
      </table>
      <table style="width:100%;margin-top:16px">
        <tr><td style="text-align:right;color:#666">Subtotal</td><td style="text-align:right;width:120px">${fmtMoney(Number(invoice.subtotal))}</td></tr>
        <tr><td style="text-align:right;color:#666">Tax</td><td style="text-align:right">${fmtMoney(Number(invoice.tax))}</td></tr>
        <tr><td style="text-align:right;font-weight:600;font-size:18px">Total</td><td style="text-align:right;font-weight:600;font-size:18px">${fmtMoney(Number(invoice.total))}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">Thank you for your business.</p>
    </div>`;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: invoice.customer_email,
      subject: `Invoice ${invoice.number}`,
      html,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Send failed" }, { status: 502 });
  }

  await supabase
    .from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", invoiceId);

  await audit({
    companyId: user.companyId,
    actorId: user.id,
    actorEmail: user.email,
    action: "invoice.send",
    entity: "invoice",
    entityId: invoiceId,
    detail: { to: invoice.customer_email, total: invoice.total },
  });

  return NextResponse.json({ ok: true });
}
