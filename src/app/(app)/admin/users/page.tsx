import { requirePermission } from "@/lib/guard";
import { createClient } from "@/lib/supabase-server";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  await requirePermission("admin.users");
  const supabase = createClient();
  const [{ data: users }, { data: roles }] = await Promise.all([
    supabase.from("users").select("id, email, full_name, role_id, is_active, is_superadmin").order("email"),
    supabase.from("roles").select("id, name").order("name"),
  ]);

  return (
    <>
      <PageHeader title="Users" description="Assign roles and control who can access the system." />
      <UsersManager initialUsers={users ?? []} roles={roles ?? []} />
    </>
  );
}
