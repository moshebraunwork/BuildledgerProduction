import { requirePermission } from "@/lib/guard";
import { createClient } from "@/lib/supabase-server";
import { PageHeader } from "@/components/page-header";
import { RolesManager } from "./roles-manager";

export default async function RolesPage() {
  await requirePermission("admin.roles");
  const supabase = createClient();
  const { data: roles } = await supabase
    .from("roles")
    .select("*")
    .order("is_system", { ascending: false })
    .order("name");

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Create roles and choose exactly what each one can do."
      />
      <RolesManager initialRoles={roles ?? []} />
    </>
  );
}
