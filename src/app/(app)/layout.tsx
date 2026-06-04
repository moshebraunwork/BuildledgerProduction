import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { ApplyTheme } from "@/components/apply-theme";
import { AskAiProvider } from "@/components/ask-ai/ask-ai-context";
import { LocationTracker } from "@/components/location/location-tracker";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.isActive && !user.isSuperadmin) {
    const companyRows = await sql`select contact_email, name from public.companies where id = ${user.companyId} limit 1`;
    const company = companyRows[0] as any;
    const firstName = user.fullName?.split(" ")[0] ?? null;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md">
          {/* Logo / brand */}
          <div className="mb-8 text-center">
            {company?.name && (
              <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {company.name}
              </p>
            )}
          </div>

          {/* Card */}
          <div className="rounded-2xl border bg-background p-8 shadow-sm text-center space-y-4">
            {/* Hourglass icon */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl">
              ⏳
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-semibold">
                {firstName ? `Hey ${firstName}, you're almost in!` : "You're almost in!"}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your account is set up and waiting — an admin just needs to enable it before you can get started.
                This usually only takes a moment.
              </p>
            </div>

            {company?.contact_email && (
              <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                Need it sooner? Reach out to{" "}
                <a
                  href={`mailto:${company.contact_email}`}
                  className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                >
                  {company.contact_email}
                </a>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Signed in as {user.email} &nbsp;·&nbsp;{" "}
            <a href="/sign-out" className="underline underline-offset-2 hover:text-foreground">Sign out</a>
          </p>
        </div>
      </div>
    );
  }

  const c = (perm: string) => can(user.isSuperadmin, user.permissions, perm);

  return (
    <AskAiProvider
      canUse={c("ai.use")}
      userName={user.fullName}
      capabilities={{
        logs: c("logs.view"),
        jobs: c("jobs.view"),
        invoices: c("invoices.view"),
        inventory: c("inventory.view"),
        employees: c("employees.view"),
        time: c("punches.view"),
      }}
    >
      <div className="flex h-screen overflow-hidden">
        <ApplyTheme theme={user.theme} />
        {/* Location-required roles are tracked + gated here (superadmin exempt). */}
        <LocationTracker required={user.requireLocation && !user.isSuperadmin} />
        <Sidebar
          isSuperadmin={user.isSuperadmin}
          permissions={user.permissions}
          email={user.email}
          fullName={user.fullName}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <MobileNav
            isSuperadmin={user.isSuperadmin}
            permissions={user.permissions}
            email={user.email}
            fullName={user.fullName}
          />
          <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6">{children}</main>
        </div>
        <MobileTabBar isSuperadmin={user.isSuperadmin} permissions={user.permissions} />
      </div>
    </AskAiProvider>
  );
}
