// ============================================================================
// Tiny structured logger — server-side only.
//
// Why this exists: failures used to be either swallowed in empty catch blocks
// (invisible when debugging) or surfaced raw to users (confusing). This gives a
// single place to record what went wrong, with enough context to find it in the
// host's logs, while callers still show users a friendly message.
//
// It deliberately has no dependencies and writes to the console — PM2 captures
// stdout/stderr on the VM, so these lines land in the app log automatically.
// Swap the sink here later (e.g. ship to a log service) without touching callers.
// ============================================================================

type Level = "info" | "warn" | "error";

function emit(level: Level, scope: string, message: string, meta?: Record<string, unknown>) {
  const entry = {
    t: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta ? { meta: safeMeta(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// Never let logging itself throw (e.g. circular refs) or leak a stack-y Error
// object as "{}" — pull out the useful fields.
function safeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else {
      try {
        JSON.stringify(v);
        out[k] = v;
      } catch {
        out[k] = String(v);
      }
    }
  }
  return out;
}

export const logger = {
  info: (scope: string, message: string, meta?: Record<string, unknown>) => emit("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) => emit("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: Record<string, unknown>) => emit("error", scope, message, meta),
};
