import { createServiceClient } from "./supabase-server";

// Writes an entry to the audit log. Fire-and-forget friendly; never throws into
// the caller's flow (logging must not break the actual operation).
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
    const svc = createServiceClient();
    await svc.from("audit_log").insert({
      company_id: params.companyId,
      actor_id: params.actorId,
      actor_email: params.actorEmail,
      action: params.action,
      entity: params.entity ?? null,
      entity_id: params.entityId ?? null,
      detail: params.detail ?? null,
    });
  } catch (e) {
    console.error("audit log write failed", e);
  }
}
