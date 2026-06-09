import { SignIn } from "@clerk/nextjs";
import { HardHat, Clock, FileText, Boxes, Sparkles } from "lucide-react";

// Clerk's prebuilt sign-in handles the entire email-OTP flow (and TOTP 2FA
// once enabled on a paid plan). The catch-all [[...rest]] segment lets Clerk
// manage its own sub-routes (verification, factor steps, etc).
const features = [
  { icon: Clock, title: "Time & crew tracking", desc: "Punch in/out with photos and live hours." },
  { icon: Boxes, title: "Inventory & jobs", desc: "Pull catalog items straight onto a job." },
  { icon: FileText, title: "Invoicing & payments", desc: "Generate, send and get paid — in one place." },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand / marketing panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(60rem_60rem_at_20%_-10%,white,transparent)]" />
        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-foreground/15">
            <HardHat className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">BuildLedger</span>
        </div>

        <div className="relative space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight">
              Run the whole job, from clock-in to paid invoice.
            </h1>
            <p className="max-w-md text-primary-foreground/80">
              The all-in-one back office for construction crews — time, inventory, jobs and billing.
            </p>
          </div>
          <ul className="space-y-4">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.title} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">{f.title}</p>
                    <p className="text-sm text-primary-foreground/70">{f.desc}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/60">© {new Date().getFullYear()} BuildLedger</p>
      </div>

      {/* Sign-in panel */}
      <div className="flex flex-col items-center justify-center gap-6 bg-muted/30 p-6">
        {/* Compact brand for small screens */}
        <div className="flex items-center gap-2 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HardHat className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">BuildLedger</span>
        </div>
        <SignIn
          routing="path"
          path="/login"
          signUpUrl="/login"
          forceRedirectUrl="/api/after-auth"
          fallbackRedirectUrl="/api/after-auth"
        />

        {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
          <div className="flex w-full max-w-sm flex-col items-center gap-1">
            <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <a
              href="/api/demo-login"
              className="mt-2 inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
            >
              <Sparkles className="h-4 w-4 text-primary" /> Explore as guest
            </a>
            <p className="text-xs text-muted-foreground">Full demo access — no sign-up</p>
          </div>
        )}
      </div>
    </div>
  );
}
