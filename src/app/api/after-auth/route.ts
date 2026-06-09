import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { auditUser } from "@/lib/audit";
import { logger } from "@/lib/logger";

// Used as forceRedirectUrl after Clerk sign-in / sign-up.
// A real HTTP GET here forces a fresh round-trip so the session cookie is
// committed before the layout runs ensureProfile and getCurrentUser.
//
// This round-trip is also the one reliable server-side moment we see every
// sign-in, so it's where we record the `auth.login` audit entry (with the
// originating IP + device, captured automatically from the request headers).
export async function GET(request: Request) {
  try {
    // getCurrentUser() bootstraps the profile row and returns it; once it
    // exists we have the company/actor needed for an attributable log line.
    const user = await getCurrentUser();
    if (user) {
      await auditUser(user, {
        action: "auth.login",
        entity: "session",
        entityId: user.id,
        detail: { method: "clerk" },
      });
    }
  } catch (e) {
    // Logging a sign-in must never block the redirect into the app.
    logger.error("after-auth", "failed to record login", { err: e });
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
