import { headers } from "next/headers";
import { sql } from "./db";
import { logger } from "./logger";
import type { CurrentUser } from "./auth";

// ============================================================================
// Audit log — the durable, user-facing record of "who did what" that powers the
// Activity Log page. Distinct from `logger` (transient stdout for debugging).
//
// Every meaningful change should call this. Two ways to do it:
//   • auditUser(user, { action, entity, entityId, detail })  ← preferred
//   • audit({ companyId, actorId, actorEmail, ... })          ← when there is
//                                                               no CurrentUser
//
// Writes are best-effort: a failure here is logged but never thrown into the
// caller's flow, so logging can never break the action it is recording.
// ============================================================================

export interface AuditParams {
  companyId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorName?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  detail?: Record<string, unknown> | null;
  // Request context. Auto-captured from the incoming request headers when
  // omitted; pass explicitly only when calling from outside a request scope.
  ipAddress?: string | null;
  userAgent?: string | null;
}

// Pulls the client IP and user-agent off the current request. Returns nulls
// outside a request scope (e.g. a background task) rather than throwing.
async function requestContext(): Promise<{ ip: string | null; ua: string | null }> {
  try {
    const h = await headers();
    // x-forwarded-for is a comma list (client, proxy1, ...) — the first is the
    // real client. Fall back to other common proxy headers.
    const fwd = h.get("x-forwarded-for");
    const ip =
      (fwd ? fwd.split(",")[0]?.trim() : null) ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      null;
    const ua = h.get("user-agent");
    return { ip: ip || null, ua: ua || null };
  } catch {
    return { ip: null, ua: null };
  }
}

// Writes an entry to the audit log. Never throws into the caller's flow.
export async function audit(params: AuditParams) {
  try {
    // Capture request context unless the caller supplied it explicitly.
    let ip = params.ipAddress ?? null;
    let ua = params.userAgent ?? null;
    if (ip == null || ua == null) {
      const ctx = await requestContext();
      if (ip == null) ip = ctx.ip;
      if (ua == null) ua = ctx.ua;
    }

    await sql`
      insert into public.audit_log
        (company_id, actor_id, actor_email, actor_name, action, entity, entity_id, detail, ip_address, user_agent)
      values (
        ${params.companyId},
        ${params.actorId},
        ${params.actorEmail},
        ${params.actorName ?? null},
        ${params.action},
        ${params.entity ?? null},
        ${params.entityId ?? null},
        ${params.detail ? JSON.stringify(params.detail) : null},
        ${ip},
        ${ua}
      )
    `;
  } catch (e) {
    logger.error("audit", "audit log write failed", { action: params.action, err: e });
  }
}

// Preferred entry point: fills the actor fields from the signed-in user so call
// sites only describe the action and its detail. Keeps actor metadata
// consistent (name included) across every log line.
export async function auditUser(
  user: Pick<CurrentUser, "companyId" | "id" | "email" | "fullName">,
  params: {
    action: string;
    entity?: string;
    entityId?: string;
    detail?: Record<string, unknown> | null;
  }
) {
  await audit({
    companyId: user.companyId,
    actorId: user.id,
    actorEmail: user.email,
    actorName: user.fullName ?? null,
    ...params,
  });
}

// ----------------------------------------------------------------------------
// diff(before, after, fields?) — compute a compact, human-readable description
// of what changed, for the `detail` of an update. Only keys whose values
// actually changed are included, each as { from, to }. Use `fields` to restrict
// to (and order) the columns worth recording.
//
//   detail: diff(prev, next, ["title", "estimate", "status"])
//   → { estimate: { from: 1200, to: 1500 } }   (title/status unchanged → omitted)
// ----------------------------------------------------------------------------
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields?: string[]
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const b = before ?? {};
  const a = after ?? {};
  const keys = fields ?? Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  for (const k of keys) {
    const from = (b as any)[k];
    const to = (a as any)[k];
    if (!valuesEqual(from, to)) out[k] = { from: normalize(from), to: normalize(to) };
  }
  return out;
}

// Loose equality that treats null/undefined and numeric-vs-string money the same
// (DB often returns numerics as strings) so we don't flag spurious "changes".
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" || typeof b === "object") {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  // Numeric-ish compare (e.g. 1500 vs "1500.00").
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== "" && String(b).trim() !== "") {
    return na === nb;
  }
  return String(a) === String(b);
}

function normalize(v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}
