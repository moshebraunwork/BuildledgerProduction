import { sql } from "./db";

// Writes an entry to the audit log. Never throws into the caller's flow.
export async function audit(params: {
  companyId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  detail?: Record<string, unknown>;
}) {
  try {
    await sql`
      insert into public.audit_log (company_id, actor_id, actor_email, action, entity, entity_id, detail)
      values (
        ${params.companyId},
        ${params.actorId},
        ${params.actorEmail},
        ${params.action},
        ${params.entity ?? null},
        ${params.entityId ?? null},
        ${params.detail ? JSON.stringify(params.detail) : null}
      )
    `;
  } catch (e) {
    console.error("audit log write failed", e);
  }
}
