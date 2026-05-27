import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canEditCompany = can(user.isSuperadmin, user.permissions, "admin.company");
  let company = null;
  if (canEditCompany) {
    const rows = await sql`select * from public.companies where id = ${user.companyId} limit 1`;
    company = rows[0] ?? null;
  }

  return (
    <>
      <PageHeader title="Settings" description="Your preferences and account." />
      <SettingsForm theme={user.theme} fullName={user.fullName} canEditCompany={canEditCompany} company={company as any} />
    </>
  );
}
