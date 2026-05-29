import { redirect } from "next/navigation";

// Used as forceRedirectUrl after Clerk sign-in / sign-up.
// A real HTTP GET here forces a fresh round-trip so the session cookie is
// committed before the layout runs ensureProfile and getCurrentUser.
export async function GET() {
  redirect("/dashboard");
}
