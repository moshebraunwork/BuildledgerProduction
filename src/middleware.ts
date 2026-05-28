import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public (unauthenticated) routes: the login flow + webhook endpoints.
const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const path = req.nextUrl.pathname;

  // Not signed in and hitting a protected route → send to login.
  if (!userId && !isPublicRoute(req)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Don't redirect away from /login while Clerk is mid-flow on a sub-route
  // (verification, factor-one, factor-two). Only the bare /login should
  // bounce signed-in users to the dashboard.
  if (userId && path === "/login") {
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
