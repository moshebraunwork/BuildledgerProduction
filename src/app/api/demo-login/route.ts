import { NextResponse } from "next/server";
import { DEMO_COOKIE, demoEnabled } from "@/lib/demo";

// Enter the demo as a guest superadmin. Only works when DEMO_MODE=true.
export async function GET(req: Request) {
  if (!demoEnabled()) return NextResponse.redirect(new URL("/login", req.url));
  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  res.cookies.set(DEMO_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return res;
}
