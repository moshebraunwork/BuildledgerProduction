import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { ApplyTheme } from "@/components/apply-theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.isActive && !user.isSuperadmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">Account pending</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn&apos;t active yet. An administrator needs to assign you a role and
            enable access before you can use BuildLedger.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <ApplyTheme theme={user.theme} />
      <Sidebar
        isSuperadmin={user.isSuperadmin}
        permissions={user.permissions}
        email={user.email}
        fullName={user.fullName}
      />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
