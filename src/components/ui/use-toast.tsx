"use client";
import * as React from "react";

type Toast = { id: number; title?: string; description?: string; variant?: "default" | "destructive" };
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
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div key={t.id} onClick={() => dismiss(t.id)} className={`rounded-md border p-4 shadow-lg cursor-pointer bg-background ${t.variant === "destructive" ? "border-destructive text-destructive" : ""}`}>
            {t.title && <div className="font-medium text-sm">{t.title}</div>}
            {t.description && <div className="text-sm text-muted-foreground">{t.description}</div>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export function useToast() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useToast must be used within ToastProvider");
  return c;
}
