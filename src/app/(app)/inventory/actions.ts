"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

interface ItemInput {
  name: string; cost: number; charge: number; source: string | null;
  stock: number; low_threshold: number;
}

export async function createItem(input: ItemInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "inventory.edit")) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.items (company_id, name, cost, charge, source, stock, low_threshold)
    values (${user.companyId}, ${input.name}, ${input.cost}, ${input.charge}, ${input.source}, ${input.stock}, ${input.low_threshold})
    returning *
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "item.create", entity: "item", entityId: rows[0].id });
  return { data: rows[0] };
}

export async function updateItem(id: string, input: ItemInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "inventory.edit")) return { error: "Forbidden" };
  await sql`
    update public.items set name = ${input.name}, cost = ${input.cost}, charge = ${input.charge},
      source = ${input.source}, stock = ${input.stock}, low_threshold = ${input.low_threshold}
    where id = ${id} and company_id = ${user.companyId}
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "item.update", entity: "item", entityId: id });
  return { ok: true };
}

export async function deleteItem(id: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "inventory.delete")) return { error: "Forbidden" };
  await sql`delete from public.items where id = ${id} and company_id = ${user.companyId}`;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "item.delete", entity: "item", entityId: id });
  return { ok: true };
}
