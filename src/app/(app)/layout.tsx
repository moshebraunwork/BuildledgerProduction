import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Sidebar } from "@/components/sidebar";
import { ApplyTheme } from "@/components/apply-theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.isActive && !user.isSuperadmin) {
    const companyRows = await sql`select contact_email, name from public.companies where id = ${user.companyId} limit 1`;
    const company = companyRows[0] as any;
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">Account pending approval</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn&apos;t active yet. An administrator needs to assign you a role and
            enable access before you can use BuildLedger.
          </p>
          {company?.contact_email && (
            <p className="text-sm text-muted-foreground">
              To request access, contact{" "}
              <a href={`mailto:${company.contact_email}`} className="font-medium text-foreground underline underline-offset-2">
                {company.contact_email}
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
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
