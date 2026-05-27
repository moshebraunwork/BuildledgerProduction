import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { InvoicesManager } from "./invoices-manager";

export default async function InvoicesPage() {
  const user = await requirePermission("invoices.view");

  const [invoices, companyRows] = await Promise.all([
    sql`select id, number, customer_name, customer_email, subtotal, tax, total, line_items, status, sent_at, created_at, job_id
        from public.invoices where company_id = ${user.companyId} order by created_at desc`,
    sql`select * from public.companies where id = ${user.companyId} limit 1`,
  ]);

  return (
    <>
      <PageHeader title="Invoices" description="Every invoice generated across all jobs." />
      <InvoicesManager
        initialInvoices={invoices as any[]}
        company={(companyRows as any[])[0] ?? null}
        canSend={can(user.isSuperadmin, user.permissions, "invoices.send")}
      />
    </>
  );
}
