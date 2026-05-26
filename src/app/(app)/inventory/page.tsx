import { requirePermission } from "@/lib/guard";
import { createClient, getCurrentUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { InventoryManager } from "./inventory-manager";

export default async function InventoryPage() {
  const user = await requirePermission("inventory.view");
  const supabase = createClient();
  const { data: items } = await supabase.from("items").select("*").order("name");

  return (
    <>
      <PageHeader title="Inventory" description="Your reusable item catalog with stock tracking." />
      <InventoryManager
        initialItems={items ?? []}
        canEdit={can(user.isSuperadmin, user.permissions, "inventory.edit")}
        canDelete={can(user.isSuperadmin, user.permissions, "inventory.delete")}
        companyId={user.companyId}
      />
    </>
  );
}
