"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export async function saveProfile(fullName: string, theme: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  await sql`update public.users set full_name = ${fullName}, theme = ${theme} where id = ${user.id}`;
  return { ok: true };
}

export async function saveCompany(input: {
  name: string; invoice_from: string | null; default_rate: number; tax_rate: number; logo_url?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.company")) return { error: "Forbidden" };
  await sql`
    update public.companies set name = ${input.name}, invoice_from = ${input.invoice_from},
      default_rate = ${input.default_rate}, tax_rate = ${input.tax_rate},
      logo_url = ${input.logo_url ?? null}
    where id = ${user.companyId}
  `;
  await audit({ companyId: user.companyId, actorId: user.id, actorEmail: user.email, action: "company.update", entity: "company", entityId: user.companyId });
  return { ok: true };
}
