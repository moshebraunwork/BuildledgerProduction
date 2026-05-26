import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { PermissionMap } from "./permissions";

// Server client bound to the request cookies (respects RLS as the logged-in user)
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component — safe to ignore, middleware refreshes
          }
        },
      },
    }
  );
}

// Service-role client — BYPASSES RLS. Use ONLY in trusted server code
// (bootstrap, admin user creation, sending invoices). Never expose to client.
export function createServiceClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  companyId: string;
  roleId: string | null;
  isSuperadmin: boolean;
  isActive: boolean;
  theme: string;
  permissions: PermissionMap;
}

// Loads the authenticated user's profile + effective permissions (from their role).
// Returns null if not logged in or no profile yet.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*, roles(permissions)")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const permissions: PermissionMap =
    (profile as any).roles?.permissions ?? {};

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    companyId: profile.company_id,
    roleId: profile.role_id,
    isSuperadmin: profile.is_superadmin,
    isActive: profile.is_active,
    theme: profile.theme ?? "system",
    permissions,
  };
}
