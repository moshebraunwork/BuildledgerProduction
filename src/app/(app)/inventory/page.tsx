import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { InventoryManager } from "./inventory-manager";

export default async function InventoryPage() {
  const user = await requirePermission("inventory.view");
  const items = await sql`select * from public.items where company_id = ${user.companyId} order by name`;

  return (
    <>
      <PageHeader title="Inventory" description="Your reusable item catalog with stock tracking." />
      <InventoryManager
        initialItems={items as any[]}
        canEdit={can(user.isSuperadmin, user.permissions, "inventory.edit")}
        canDelete={can(user.isSuperadmin, user.permissions, "inventory.delete")}
      />
    </>
  );
}
