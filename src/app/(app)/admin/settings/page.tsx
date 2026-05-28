import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { CompanySettingsForm } from "./company-settings-form";

export default async function AdminSettingsPage() {
  const user = await requirePermission("admin.company");
  const rows = await sql`select * from public.companies where id = ${user.companyId} limit 1`;
  const company = (rows as any[])[0] ?? null;

  return (
    <>
      <PageHeader title="App settings" description="Company-wide configuration and invoice defaults." />
      <CompanySettingsForm company={company} />
    </>
  );
}
