import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo";

// Public (unauthenticated) routes: the login flow + webhook + demo endpoints.
const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/api/after-auth",
  "/api/webhooks(.*)",
  "/api/demo-login",
  "/api/demo-logout",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const path = req.nextUrl.pathname;
  // A guest demo session counts as authenticated when DEMO_MODE is on.
  const isDemo = process.env.DEMO_MODE === "true" && !!req.cookies.get(DEMO_COOKIE);
  const authed = !!userId || isDemo;

  // Not signed in (and not a guest) and hitting a protected route → login.
  if (!authed && !isPublicRoute(req)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Don't redirect away from /login while Clerk is mid-flow on a sub-route
  // (verification, factor-one, factor-two). Only the bare /login should
  // bounce already-authenticated users to the dashboard.
  if (authed && path === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
