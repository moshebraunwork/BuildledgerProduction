"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditUser, diff } from "@/lib/audit";

interface ItemInput {
  name: string; cost: number; charge: number; source: string | null;
  stock: number; low_threshold: number;
}

const ITEM_AUDIT_FIELDS = ["name", "cost", "charge", "source", "stock", "low_threshold"];

export async function createItem(input: ItemInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "inventory.edit")) return { error: "Forbidden" };
  const rows = await sql`
    insert into public.items (company_id, name, cost, charge, source, stock, low_threshold)
    values (${user.companyId}, ${input.name}, ${input.cost}, ${input.charge}, ${input.source}, ${input.stock}, ${input.low_threshold})
    returning *
  `;
  await auditUser(user, {
    action: "item.create", entity: "item", entityId: rows[0].id,
    detail: { name: input.name, cost: input.cost, charge: input.charge, stock: input.stock },
  });
  return { data: rows[0] };
}

export async function updateItem(id: string, input: ItemInput) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "inventory.edit")) return { error: "Forbidden" };
  const beforeRows = await sql`
    select name, cost, charge, source, stock, low_threshold
    from public.items where id = ${id} and company_id = ${user.companyId} limit 1
  `;
  const rows = await sql`
    update public.items set name = ${input.name}, cost = ${input.cost}, charge = ${input.charge},
      source = ${input.source}, stock = ${input.stock}, low_threshold = ${input.low_threshold}
    where id = ${id} and company_id = ${user.companyId}
    returning name, cost, charge, source, stock, low_threshold
  `;
  await auditUser(user, {
    action: "item.update", entity: "item", entityId: id,
    detail: { name: input.name, changes: diff(beforeRows[0], rows[0], ITEM_AUDIT_FIELDS) },
  });
  return { ok: true };
}

export async function deleteItem(id: string) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "inventory.delete")) return { error: "Forbidden" };
  const beforeRows = await sql`select name, stock from public.items where id = ${id} and company_id = ${user.companyId} limit 1`;
  await sql`delete from public.items where id = ${id} and company_id = ${user.companyId}`;
  await auditUser(user, {
    action: "item.delete", entity: "item", entityId: id,
    detail: beforeRows[0] ? { name: beforeRows[0].name, stock: beforeRows[0].stock } : undefined,
  });
  return { ok: true };
}
