import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";

// Guards a page by permission. Returns the current user if allowed, otherwise
// redirects. Superadmin always passes.
export async function requirePermission(perm: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.isSuperadmin, user.permissions, perm)) redirect("/dashboard");
  return user;
}
