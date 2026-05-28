import { NextResponse } from "next/server";
import { Resend } from "resend";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { fmtMoney, fmtDate } from "@/lib/utils";

interface IncludeOptions {
  logo?: boolean;
  jobDetails?: boolean;
  paymentInstructions?: boolean;
  dueDate?: boolean;
  prices?: boolean;
}

// POST /api/invoices/send
// { invoiceId, overrideEmail?, includeOptions? }
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.isSuperadmin, user.permissions, "invoices.send")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { invoiceId, overrideEmail, includeOptions = {} } = body as {
    invoiceId: string;
    overrideEmail?: string;
    includeOptions?: IncludeOptions;
  };

  const opts: Required<IncludeOptions> = {
    logo: includeOptions.logo ?? true,
    jobDetails: includeOptions.jobDetails ?? true,
    paymentInstructions: includeOptions.paymentInstructions ?? true,
    dueDate: includeOptions.dueDate ?? true,
    prices: includeOptions.prices ?? true,
  };

  const rows = await sql`
    select i.*, j.title as job_title, j.place as job_place, j.scheduled_date as job_date,
           c.name as company_name, c.invoice_from, c.logo_url
    from public.invoices i
    left join public.jobs j on j.id = i.job_id
    left join public.companies c on c.id = i.company_id
    where i.id = ${invoiceId} and i.company_id = ${user.companyId}
    limit 1
  `;
  const inv = rows[0];
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const toEmail = overrideEmail || inv.customer_email;
  if (!toEmail) return NextResponse.json({ error: "This invoice has no customer email" }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVOICE_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json(
      { error: "Email is not configured. Set RESEND_API_KEY and INVOICE_FROM_EMAIL." },
      { status: 500 }
    );
  }

  const companyDisplay = inv.invoice_from || inv.company_name || "";
  const lines = (inv.line_items as Array<{ name: string; qty?: number; amount: number }>) ?? [];

  const primary = "#1e40af";
  const lightBg = "#f8fafc";
  const border = "#e2e8f0";

  const logoHtml =
    opts.logo && inv.logo_url
      ? `<img src="${inv.logo_url}" alt="logo" style="max-height:48px;max-width:180px;object-fit:contain" />`
      : opts.logo
      ? `<span style="font-size:18px;font-weight:700;color:#ffffff">${companyDisplay}</span>`
      : "";

  const lineRowsHtml = lines
    .map(
      (l, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}">
        <td style="padding:10px 16px;border-bottom:1px solid ${border}">${l.name}${l.qty ? ` &times; ${l.qty}` : ""}</td>
        ${opts.prices ? `<td style="padding:10px 16px;border-bottom:1px solid ${border};text-align:right;white-space:nowrap">${fmtMoney(l.amount)}</td>` : ""}
      </tr>`
    )
    .join("");

  const totalsHtml = opts.prices
    ? `
    <table style="width:100%;margin-top:16px;border-collapse:collapse">
      <tr>
        <td style="padding:6px 16px;text-align:right;color:#64748b">Subtotal</td>
        <td style="padding:6px 16px;text-align:right;width:120px">${fmtMoney(Number(inv.subtotal))}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px;text-align:right;color:#64748b">Tax</td>
        <td style="padding:6px 16px;text-align:right">${fmtMoney(Number(inv.tax))}</td>
      </tr>
      <tr style="background:${primary}">
        <td style="padding:10px 16px;text-align:right;font-weight:700;font-size:16px;color:#ffffff">Total</td>
        <td style="padding:10px 16px;text-align:right;font-weight:700;font-size:16px;color:#ffffff;white-space:nowrap">${fmtMoney(Number(inv.total))}</td>
      </tr>
    </table>`
    : "";

  const dueDateHtml =
    opts.dueDate && inv.due_date
      ? `<div style="padding:4px 0;color:#64748b;font-size:13px"><strong>Due Date:</strong> ${fmtDate(String(inv.due_date))}</div>`
      : "";

  const jobHtml =
    opts.jobDetails && (inv.job_title || inv.job_place)
      ? `
    <div style="background:${lightBg};border:1px solid ${border};border-radius:8px;padding:16px;margin:20px 0">
      <p style="margin:0 0 8px;font-weight:600;font-size:13px;color:#374151">Job Details</p>
      ${inv.job_title ? `<p style="margin:2px 0;font-size:13px;color:#64748b">Job: ${inv.job_title}</p>` : ""}
      ${inv.job_place ? `<p style="margin:2px 0;font-size:13px;color:#64748b">Location: ${inv.job_place}</p>` : ""}
      ${inv.job_date ? `<p style="margin:2px 0;font-size:13px;color:#64748b">Date: ${fmtDate(String(inv.job_date))}</p>` : ""}
    </div>`
      : "";

  const notesHtml =
    opts.paymentInstructions && inv.notes
      ? `
    <div style="margin-top:20px;padding:16px;background:${lightBg};border-left:4px solid ${primary};border-radius:4px">
      <p style="margin:0 0 4px;font-weight:600;font-size:13px;color:#374151">Notes</p>
      <p style="margin:0;font-size:13px;color:#64748b;white-space:pre-line">${inv.notes}</p>
    </div>`
      : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

    <!-- Header -->
    <div style="background:${primary};padding:28px 32px;display:flex;justify-content:space-between;align-items:center">
      <div>${logoHtml || `<span style="font-size:18px;font-weight:700;color:#ffffff">${companyDisplay}</span>`}</div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:2px">INVOICE</div>
        <div style="font-size:13px;color:#bfdbfe;margin-top:2px">${inv.number}</div>
      </div>
    </div>

    <!-- Meta bar -->
    <div style="background:${lightBg};border-bottom:1px solid ${border};padding:16px 32px;display:flex;gap:32px">
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:3px">Billed To</div>
        <div style="font-weight:600;font-size:14px">${inv.customer_name ?? "Customer"}</div>
        ${inv.customer_email ? `<div style="font-size:12px;color:#64748b">${inv.customer_email}</div>` : ""}
      </div>
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:3px">Issued</div>
        <div style="font-size:13px;font-weight:600">${fmtDate(String(inv.created_at))}</div>
      </div>
      ${dueDateHtml ? `<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:3px">Due</div><div style="font-size:13px;font-weight:600">${fmtDate(String(inv.due_date))}</div></div>` : ""}
    </div>

    <!-- Body -->
    <div style="padding:24px 32px">

      ${jobHtml}

      <!-- Line items -->
      <table style="width:100%;border-collapse:collapse;border:1px solid ${border};border-radius:8px;overflow:hidden;margin-top:8px">
        <thead>
          <tr style="background:${lightBg}">
            <th style="padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;border-bottom:1px solid ${border}">Description</th>
            ${opts.prices ? `<th style="padding:10px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;border-bottom:1px solid ${border}">Amount</th>` : ""}
          </tr>
        </thead>
        <tbody>${lineRowsHtml}</tbody>
      </table>

      ${totalsHtml}

      ${notesHtml}
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid ${border};text-align:center">
      <p style="margin:0;font-size:13px;color:#94a3b8">Thank you for your business.</p>
      <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1">${companyDisplay}</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from, to: toEmail, subject: `Invoice ${inv.number}`, html });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Send failed" }, { status: 502 });
  }

  // Only mark as sent when sending to the actual customer email
  if (!overrideEmail) {
    await sql`
      update public.invoices set status = 'sent', sent_at = now() where id = ${invoiceId}
    `;
  }

  await audit({
    companyId: user.companyId,
    actorId: user.id,
    actorEmail: user.email,
    action: "invoice.send",
    entity: "invoice",
    entityId: invoiceId,
    detail: { to: toEmail, total: inv.total },
  });

  return NextResponse.json({ ok: true });
}
