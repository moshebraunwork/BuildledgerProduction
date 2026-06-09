import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo";

// Leave the demo guest session.
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
