import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { UserSettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <PageHeader title="My settings" description="Your personal preferences." />
      <UserSettingsForm
        theme={user.theme}
        fullName={user.fullName}
        fontScaleDesktop={user.fontScaleDesktop}
        fontScaleMobile={user.fontScaleMobile}
      />
    </>
  );
}
