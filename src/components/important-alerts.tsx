"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X, ChevronRight, Paperclip } from "lucide-react";
import { listImportantAlerts, dismissAlert, type ImportantAlert } from "@/app/(app)/jobs/[id]/chat-actions";

// App-wide banner for important chat messages. Mounted in the app shell so it
// shows on every page and stays until each alert is dismissed. Polls so newly
// flagged (or scheduled-and-now-due) messages surface within ~15s.
const POLL_MS = 15000;

export function ImportantAlerts() {
  const router = useRouter();
  const [alerts, setAlerts] = React.useState<ImportantAlert[]>([]);
  // Locally hidden ids (optimistic dismiss) so they vanish instantly.
  const hidden = React.useRef<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    try {
      const res = await listImportantAlerts();
      setAlerts((res.data ?? []).filter((a) => !hidden.current.has(a.id)));
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  function dismiss(a: ImportantAlert) {
    hidden.current.add(a.id);
    setAlerts((cur) => cur.filter((x) => x.id !== a.id));
    dismissAlert(a.id).catch(() => {});
  }

  function view(a: ImportantAlert) {
    dismiss(a);
    router.push(`/jobs/${a.jobId}`);
  }

  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      {alerts.slice(0, 3).map((a) => (
        <div
          key={a.id}
          className="pointer-events-auto ws-fade flex w-full max-w-xl items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-50 p-3 shadow-lg dark:bg-amber-950/80 dark:backdrop-blur"
          role="alert"
        >
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Important</span>
              <span className="truncate text-xs text-amber-700/70 dark:text-amber-400/70">
                {a.senderName ?? "Someone"}{a.jobTitle ? ` · ${a.jobTitle}` : ""}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 break-words text-sm text-foreground">
              {a.body || (a.fileName ? <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{a.fileName}</span> : "Attachment")}
            </p>
            <button
              type="button"
              onClick={() => view(a)}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
            >
              View in job <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => dismiss(a)}
            className="shrink-0 rounded-full p-1.5 text-amber-700/70 transition-colors hover:bg-amber-500/15 dark:text-amber-400/70"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
