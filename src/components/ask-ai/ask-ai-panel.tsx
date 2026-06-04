"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Sparkles, X, Send, Trash2, Loader2 } from "lucide-react";
import { loadAiHistory, clearAiHistory } from "@/app/(app)/ai/actions";
import type { AiCapabilities } from "./ask-ai-context";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// Welcome examples, filtered to what the user can actually ask about.
function examplesFor(caps: AiCapabilities): string[] {
  const out: string[] = [];
  if (caps.jobs) out.push("Which jobs are active right now?");
  if (caps.invoices) out.push("How much is outstanding in unpaid invoices?");
  if (caps.logs) out.push("What changed in the system in the last 24 hours?");
  if (caps.time) out.push("How many hours did the crew log this week?");
  if (caps.inventory) out.push("What inventory is running low on stock?");
  if (caps.employees) out.push("Who's on the team and what are their roles?");
  out.push("How do I generate and send an invoice?");
  return out.slice(0, 5);
}

// --- tiny markdown-ish renderer (bold + bullet lists), no dependency ---
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(<strong key={`${keyBase}-b${i++}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key} className="my-1 ml-4 list-disc space-y-0.5">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b, `${key}-${i}`)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      bullets.push(trimmed.replace(/^[-*]\s+/, ""));
    } else {
      flush(`ul-${idx}`);
      if (trimmed) blocks.push(<p key={`p-${idx}`} className="whitespace-pre-wrap">{renderInline(line, `p-${idx}`)}</p>);
    }
  });
  flush("ul-end");
  return <div className="space-y-1.5 text-sm leading-relaxed">{blocks}</div>;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function AskAiPanel({
  open,
  onClose,
  capabilities,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  capabilities: AiCapabilities;
  userName: string | null;
}) {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const examples = React.useMemo(() => examplesFor(capabilities), [capabilities]);
  const initials = (userName || "You").slice(0, 2).toUpperCase();

  // Load history once, the first time the panel opens.
  React.useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    (async () => {
      const res = await loadAiHistory();
      if (active && "messages" in res) setMessages(res.messages);
      if (active) setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [open, loaded]);

  // Lock body scroll while open (helps the mobile bottom-sheet feel native).
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open]);

  // Keep pinned to the newest message as content streams in.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);

    const now = new Date().toISOString();
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: message, created_at: now };
    const aiId = `a-${Date.now()}`;
    setMessages((m) => [...m, userMsg, { id: aiId, role: "assistant", content: "", created_at: now }]);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        const errText = (j && j.error) || "Something went wrong. Please try again.";
        setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, content: `⚠️ ${errText}` } : x)));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, content: acc } : x)));
      }
      if (!acc.trim()) {
        setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, content: "(no response)" } : x)));
      }
    } catch {
      setMessages((m) =>
        m.map((x) => (x.id === aiId ? { ...x, content: "⚠️ Couldn't reach the assistant. Please try again." } : x))
      );
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function handleClear() {
    if (busy) return;
    setMessages([]);
    await clearAiHistory();
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const showWelcome = loaded && messages.length === 0;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[1100] transition-opacity duration-300",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel: bottom sheet on mobile, right slide-in on desktop */}
      <div
        className={cn(
          "absolute flex flex-col bg-background shadow-2xl transition-transform duration-300 ease-out",
          "inset-x-0 bottom-0 h-[88vh] rounded-t-2xl border-t",
          "md:inset-x-auto md:right-0 md:top-0 md:h-full md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0",
          open ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-y-0 md:translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Ask AI"
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/15 via-violet-500/10 to-transparent" />
          <div className="relative flex items-center justify-between gap-2 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="leading-tight">
                <h2 className="text-base font-semibold">Ask AI</h2>
                <p className="text-xs text-muted-foreground">Read-only · sees only what you can</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Clear chat"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {!loaded && (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {showWelcome && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg">
                <Sparkles className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold">How can I help{userName ? `, ${userName.split(" ")[0]}` : ""}?</h3>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Ask about your jobs, invoices, inventory, team, time, or activity — I'll look it up for you.
              </p>
              <div className="mt-5 w-full max-w-sm space-y-2">
                {examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => send(ex)}
                    className="w-full rounded-xl border bg-card px-4 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!showWelcome && loaded && (
            <div className="space-y-4">
              {messages.map((m) => {
                const isUser = m.role === "user";
                const streaming = busy && m.role === "assistant" && m.id === messages[messages.length - 1]?.id;
                return (
                  <div key={m.id} className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                        isUser ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-primary to-violet-500 text-white"
                      )}
                    >
                      {isUser ? initials : <Sparkles className="h-3.5 w-3.5" />}
                    </div>
                    <div className={cn("min-w-0 max-w-[82%]", isUser ? "items-end text-right" : "items-start")}>
                      <div
                        className={cn(
                          "inline-block rounded-2xl px-3.5 py-2 text-left",
                          isUser ? "bg-primary text-primary-foreground" : "border bg-card"
                        )}
                      >
                        {m.content ? (
                          isUser ? (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
                          ) : (
                            <RichText text={m.content} />
                          )
                        ) : streaming ? (
                          <span className="flex gap-1 py-1">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.2s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.1s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
                          </span>
                        ) : null}
                      </div>
                      <div className={cn("mt-1 px-1 text-[10px] text-muted-foreground", isUser ? "text-right" : "text-left")}>
                        {isUser ? userName || "You" : "Ask AI"} · {fmtTime(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 focus-within:border-primary/50">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your jobs, invoices, activity…"
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white transition-opacity disabled:opacity-40"
              aria-label="Send"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-center text-[10px] text-muted-foreground">
            Ask AI can only read information — it never makes changes.
          </p>
        </div>
      </div>
    </div>
  );
}
