"use client";
import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "default" | "destructive" | "success";
type Toast = { id: number; title?: string; description?: string; variant?: Variant };
type ToastCtx = { toasts: Toast[]; toast: (t: Omit<Toast, "id">) => void; dismiss: (id: number) => void };

const Ctx = React.createContext<ToastCtx | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const dismiss = React.useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = React.useCallback((t: Omit<Toast, "id">) => {
    const id = ++counter;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => {
          const v = t.variant ?? "default";
          const Icon = v === "destructive" ? AlertCircle : v === "success" ? CheckCircle2 : Info;
          const accent =
            v === "destructive" ? "border-l-destructive" : v === "success" ? "border-l-emerald-500" : "border-l-primary";
          const iconColor =
            v === "destructive" ? "text-destructive" : v === "success" ? "text-emerald-500" : "text-primary";
          return (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              role="status"
              className={cn(
                "relative flex cursor-pointer items-start gap-3 rounded-lg border border-l-4 bg-background p-3.5 pr-8 shadow-lg",
                "duration-300 animate-in fade-in slide-in-from-right-4",
                accent
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} />
              <div className="min-w-0 flex-1">
                {t.title && <div className="text-sm font-medium">{t.title}</div>}
                {t.description && <div className="break-words text-sm text-muted-foreground">{t.description}</div>}
              </div>
              <X className="absolute right-2.5 top-3 h-3.5 w-3.5 text-muted-foreground/60" />
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useToast must be used within ToastProvider");
  return c;
}
