// Demo / guest mode. When DEMO_MODE=true the login page offers an "Explore as
// guest" button that grants a shared superadmin guest account — handy for
// showing the app to a friend or prospective client without sign-up.
//
// This is intentionally open (anyone with the link can enter), so it should only
// ever be enabled on a throwaway demo deployment, never on real customer data.

export const DEMO_COOKIE = "bl_demo";

// Server-side switch (do not use NEXT_PUBLIC here — the gate must be server-trusted).
export function demoEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}
