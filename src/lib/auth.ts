import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "./db";
import type { PermissionMap } from "./permissions";

const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_ROLE_ID = "00000000-0000-0000-0000-0000000000a1";

export interface CurrentUser {
  id: string; // our internal users.id (uuid)
  clerkUserId: string;
  email: string;
  fullName: string | null;
  companyId: string;
  roleId: string | null;
  isSuperadmin: boolean;
  isActive: boolean;
  theme: string;
  permissions: PermissionMap;
  requireLocation: boolean;
}

// Ensures a profile row exists in Neon for the signed-in Clerk user.
// If a pre-provisioned row exists for that email (created when an invite was sent),
// it claims it by writing in the clerk_user_id. Otherwise a new inactive row is created.
// The support admin email becomes superadmin (full access, always active).
async function ensureProfile(clerkUserId: string, email: string, fullName: string | null) {
  const supportEmail = (process.env.SUPPORT_ADMIN_EMAIL ?? "").toLowerCase();
  const isSupport = email.toLowerCase() === supportEmail;

  // Check if there's already a row linked to this Clerk user ID
  const existing = await sql`
    select id, is_superadmin from public.users where clerk_user_id = ${clerkUserId} limit 1
  `;
  if (existing.length) {
    if (isSupport && !existing[0].is_superadmin) {
      await sql`
        update public.users
        set is_superadmin = true, is_active = true, role_id = ${ADMIN_ROLE_ID}
        where clerk_user_id = ${clerkUserId}
      `;
    }
    return;
  }

  // Check for a pre-provisioned row by email (created when admin sent an invite)
  const preProvisioned = await sql`
    select id from public.users
    where lower(email) = lower(${email}) and clerk_user_id is null
    limit 1
  `;
  if (preProvisioned.length) {
    // Claim this row — link the Clerk user ID and update name. If the account
    // was invited with a role already assigned (one-step onboarding), activate
    // it now so they can use the app immediately, no manual approval step.
    await sql`
      update public.users
      set clerk_user_id = ${clerkUserId},
          full_name = coalesce(full_name, ${fullName}),
          email = ${email},
          is_active = case when role_id is not null then true else is_active end
      where id = ${preProvisioned[0].id}
    `;
    return;
  }

  // Brand-new user — create inactive row pending admin approval
  await sql`
    insert into public.users (clerk_user_id, company_id, email, full_name, role_id, is_superadmin, is_active)
    values (
      ${clerkUserId},
      ${DEFAULT_COMPANY_ID},
      ${email},
      ${isSupport ? "Support Admin" : fullName},
      ${isSupport ? ADMIN_ROLE_ID : null},
      ${isSupport},
      ${isSupport}
    )
  `;
}

// Loads the authenticated user's profile + effective permissions.
// Returns null if not signed in. Bootstraps the profile row on first call.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const cu = await currentUser();
  const email =
    cu?.primaryEmailAddress?.emailAddress ??
    cu?.emailAddresses?.[0]?.emailAddress ??
    "";
  const fullName =
    [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || null;

  if (email) await ensureProfile(userId, email, fullName);

  const rows = await sql`
    select u.id, u.clerk_user_id, u.email, u.full_name, u.company_id,
           u.role_id, u.is_superadmin, u.is_active, u.theme,
           r.permissions as role_permissions
    from public.users u
    left join public.roles r on r.id = u.role_id
    where u.clerk_user_id = ${userId}
    limit 1
  `;
  if (!rows.length) return null;
  const p = rows[0];

  // Whether this user's role requires sharing location (added in migration 0014).
  // Queried separately + guarded so a database that hasn't run 0014 yet still
  // authenticates normally.
  let requireLocation = false;
  if (p.role_id) {
    try {
      const rl = await sql`select require_location from public.roles where id = ${p.role_id} limit 1`;
      requireLocation = !!rl[0]?.require_location;
    } catch {
      /* column not present yet — treat as not required */
    }
  }

  return {
    id: p.id,
    clerkUserId: p.clerk_user_id,
    email: p.email,
    fullName: p.full_name,
    companyId: p.company_id,
    roleId: p.role_id,
    isSuperadmin: p.is_superadmin,
    isActive: p.is_active,
    theme: p.theme ?? "system",
    permissions: (p.role_permissions as PermissionMap) ?? {},
    requireLocation,
  };
}

export { DEFAULT_COMPANY_ID, ADMIN_ROLE_ID };
