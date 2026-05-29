import { NextResponse } from "next/server";

// Used as forceRedirectUrl after Clerk sign-in / sign-up.
// A real HTTP GET here forces a fresh round-trip so the session cookie is
// committed before the layout runs ensureProfile and getCurrentUser.
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
