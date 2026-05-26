import { createServiceClient } from "./supabase-server";
import { allTruePermissions } from "./permissions";

const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_ROLE_ID = "00000000-0000-0000-0000-0000000000a1";

// Called right after a successful auth verification. Ensures the user has a
// profile row in public.users. If their email matches SUPPORT_ADMIN_EMAIL,
// they are made the superadmin (full access, cannot be locked out).
//
// New users who are NOT the support admin are created inactive with no role,
// so an admin must explicitly enable them — nobody gets in by self-signup.
export async function ensureUserProfile(authUserId: string, email: string) {
  const svc = createServiceClient();
  const supportEmail = (process.env.SUPPORT_ADMIN_EMAIL ?? "").toLowerCase();
  const isSupport = email.toLowerCase() === supportEmail;

  const { data: existing } = await svc
    .from("users")
    .select("id, is_superadmin")
    .eq("id", authUserId)
    .maybeSingle();

  if (existing) {
    // Keep superadmin flag correct if the support email logs in
    if (isSupport && !existing.is_superadmin) {
      await svc
        .from("users")
        .update({ is_superadmin: true, is_active: true, role_id: ADMIN_ROLE_ID })
        .eq("id", authUserId);
    }
    return;
  }

  await svc.from("users").insert({
    id: authUserId,
    company_id: DEFAULT_COMPANY_ID,
    email,
    full_name: isSupport ? "Support Admin" : null,
    role_id: isSupport ? ADMIN_ROLE_ID : null,
    is_superadmin: isSupport,
    is_active: isSupport, // non-admins start inactive, pending admin approval
  });
}

export { DEFAULT_COMPANY_ID, ADMIN_ROLE_ID, allTruePermissions };
