import { getCurrentUser, createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canEditCompany = can(user.isSuperadmin, user.permissions, "admin.company");
  const supabase = createClient();
  const { data: company } = canEditCompany
    ? await supabase.from("companies").select("*").eq("id", user.companyId).single()
    : { data: null };

  return (
    <>
      <PageHeader title="Settings" description="Your preferences and account." />
      <SettingsForm
        theme={user.theme}
        fullName={user.fullName}
        canEditCompany={canEditCompany}
        company={company}
      />
    </>
  );
}
