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
}

// Ensures a profile row exists in Neon for the signed-in Clerk user.
// The support admin email becomes superadmin (full access, always active).
// Everyone else is created inactive, pending admin approval.
async function ensureProfile(clerkUserId: string, email: string, fullName: string | null) {
  const supportEmail = (process.env.SUPPORT_ADMIN_EMAIL ?? "").toLowerCase();
  const isSupport = email.toLowerCase() === supportEmail;

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
  };
}

export { DEFAULT_COMPANY_ID, ADMIN_ROLE_ID };
