"use client";

import * as React from "react";
import { AskAiPanel } from "./ask-ai-panel";

// Which data areas the current user can ask about — drives the welcome examples
// and is purely cosmetic (the server re-checks every permission).
export interface AiCapabilities {
  logs: boolean;
  jobs: boolean;
  invoices: boolean;
  inventory: boolean;
  employees: boolean;
  time: boolean;
}

interface AskAiCtx {
  open: boolean;
  openPanel: () => void;
  closePanel: () => void;
  canUse: boolean;
}

const Ctx = React.createContext<AskAiCtx | null>(null);

// Lets any client component (sidebar item, mobile tab) open the assistant.
export function useAskAi(): AskAiCtx {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useAskAi must be used inside <AskAiProvider>");
  return c;
}

export function AskAiProvider({
  canUse,
  capabilities,
  userName,
  children,
}: {
  canUse: boolean;
  capabilities: AiCapabilities;
  userName: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const openPanel = React.useCallback(() => setOpen(true), []);
  const closePanel = React.useCallback(() => setOpen(false), []);

  const value = React.useMemo(
    () => ({ open, openPanel, closePanel, canUse }),
    [open, openPanel, closePanel, canUse]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {canUse && (
        <AskAiPanel open={open} onClose={closePanel} capabilities={capabilities} userName={userName} />
      )}
    </Ctx.Provider>
  );
}
