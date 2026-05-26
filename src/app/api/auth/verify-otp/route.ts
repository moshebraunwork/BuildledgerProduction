import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { ensureUserProfile } from "@/lib/bootstrap";
import { audit } from "@/lib/audit";

// Called by the client right after a successful email-OTP verification.
// Creates/repairs the public.users profile row and logs the sign-in.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await ensureUserProfile(user.id, user.email);

  // Look up company for the audit entry
  const { data: profile } = await supabase
    .from("users")
    .select("company_id")
    .eq("id", user.id)
    .single();

  await audit({
    companyId: profile?.company_id ?? null,
    actorId: user.id,
    actorEmail: user.email,
    action: "auth.login",
  });

  return NextResponse.json({ ok: true });
}
