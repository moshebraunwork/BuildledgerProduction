"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Eye, Pencil, Trash2, AlertTriangle, CheckCircle2, Download, Printer, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---- Right-click context menu for table rows ----
// Usage: wrap a row's onContextMenu to call open({x,y}); render <RowContextMenu/>
export interface ContextMenuState {
  x: number;
  y: number;
  actions: ContextAction[];
}
export interface ContextAction {
  label: string;
  icon?: "view" | "edit" | "delete" | "check" | "download" | "print" | "send";
  onClick: () => void;
  destructive?: boolean;
}

export function RowContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState | null;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!state) return;
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [state, onClose]);

  if (!state) return null;

  const iconFor = (i?: string) =>
    i === "view" ? <Eye className="h-4 w-4" /> :
    i === "edit" ? <Pencil className="h-4 w-4" /> :
    i === "delete" ? <Trash2 className="h-4 w-4" /> :
    i === "check" ? <CheckCircle2 className="h-4 w-4" /> :
    i === "download" ? <Download className="h-4 w-4" /> :
    i === "print" ? <Printer className="h-4 w-4" /> :
    i === "send" ? <Send className="h-4 w-4" /> : null;

  // Keep the menu on-screen
  const left = Math.min(state.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 200);
  const top = Math.min(state.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 40 * state.actions.length - 16);

  return (
    <div
      className="fixed z-[60] min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {state.actions.map((a, i) => (
        <button
          key={i}
          type="button"
          onClick={() => { a.onClick(); onClose(); }}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent",
            a.destructive && "text-destructive hover:bg-destructive/10"
          )}
        >
          {iconFor(a.icon)}
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ---- Strong delete confirmation ----
// Requires typing the record's name (or just confirming for low-risk deletes).
export function DeleteConfirm({
  open,
  onClose,
  onConfirm,
  itemLabel,
  requireTyped,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemLabel: string;
  requireTyped?: string; // if set, user must type this to enable delete
}) {
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => { if (!open) setTyped(""); }, [open]);
  if (!open) return null;

  const canDelete = !requireTyped || typed === requireTyped;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-lg border bg-background p-6 shadow-xl">
        <div className="mb-3 flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="text-base font-semibold">Delete {itemLabel}?</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          This can&apos;t be undone.
          {requireTyped && <> To confirm, type <span className="font-medium text-foreground">{requireTyped}</span> below.</>}
        </p>
        {requireTyped && (
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={requireTyped}
            className="mb-4"
            autoFocus
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={!canDelete} onClick={() => { onConfirm(); onClose(); }}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
