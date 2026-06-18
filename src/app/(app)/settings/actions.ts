"use server";

import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditUser, diff } from "@/lib/audit";

export async function saveProfile(
  fullName: string,
  theme: string,
  fontScaleDesktop?: string,
  fontScaleMobile?: string,
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  await sql`update public.users set full_name = ${fullName}, theme = ${theme} where id = ${user.id}`;
  // Font scale columns arrive with migration 0016 — guard so older databases
  // still save the name/theme.
  if (fontScaleDesktop || fontScaleMobile) {
    const allowed = ["sm", "md", "lg", "xl"];
    const d = allowed.includes(fontScaleDesktop ?? "") ? fontScaleDesktop : "md";
    const m = allowed.includes(fontScaleMobile ?? "") ? fontScaleMobile : "md";
    try {
      await sql`update public.users set font_scale_desktop = ${d}, font_scale_mobile = ${m} where id = ${user.id}`;
    } catch { /* not migrated yet */ }
  }
  // Record the name change (theme is cosmetic; only log it when the name moves).
  if ((user.fullName ?? "") !== fullName) {
    await auditUser(user, {
      action: "profile.update", entity: "user", entityId: user.id,
      detail: { changes: diff({ full_name: user.fullName }, { full_name: fullName }, ["full_name"]) },
    });
  }
  return { ok: true };
}

export async function saveCompany(input: {
  name: string; invoice_from: string | null; default_rate: number; tax_rate: number; logo_url?: string | null; contact_email?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user.isSuperadmin, user.permissions, "admin.company")) return { error: "Forbidden" };
  const beforeRows = await sql`
    select name, invoice_from, default_rate, tax_rate, logo_url, contact_email
    from public.companies where id = ${user.companyId} limit 1
  `;
  const rows = await sql`
    update public.companies set name = ${input.name}, invoice_from = ${input.invoice_from},
      default_rate = ${input.default_rate}, tax_rate = ${input.tax_rate},
      logo_url = ${input.logo_url ?? null}, contact_email = ${input.contact_email ?? null}
    where id = ${user.companyId}
    returning name, invoice_from, default_rate, tax_rate, logo_url, contact_email
  `;
  await auditUser(user, {
    action: "company.update", entity: "company", entityId: user.companyId,
    detail: {
      changes: diff(beforeRows[0], rows[0], [
        "name", "invoice_from", "default_rate", "tax_rate", "logo_url", "contact_email",
      ]),
    },
  });
  return { ok: true };
}
