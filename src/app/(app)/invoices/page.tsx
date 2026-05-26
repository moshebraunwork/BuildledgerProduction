import { requirePermission } from "@/lib/guard";
import { createClient, getCurrentUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { InvoicesManager } from "./invoices-manager";

export default async function InvoicesPage() {
  const user = await requirePermission("invoices.view");
  const supabase = createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, number, customer_name, customer_email, subtotal, tax, total, line_items, status, sent_at, created_at, job_id")
    .order("created_at", { ascending: false });

  const { data: company } = await supabase.from("companies").select("*").eq("id", user.companyId).single();

  return (
    <>
      <PageHeader title="Invoices" description="Every invoice generated across all jobs." />
      <InvoicesManager
        initialInvoices={invoices ?? []}
        company={company}
        canSend={can(user.isSuperadmin, user.permissions, "invoices.send")}
      />
    </>
  );
}
