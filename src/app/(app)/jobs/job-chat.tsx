"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  MessagesSquare, Plus, Send, Paperclip, X, Loader2, ChevronLeft, Download, Eye,
} from "lucide-react";
import {
  listJobChats, listChatUsers, createJobChat, getChatMessages, sendChatMessage,
  type ChatSummary, type ChatMessage,
} from "./[id]/chat-actions";

// Per-job chat panel: a list of conversations on this job (only the ones the
// caller may see), a participant picker for starting a new one, and the open
// thread with text + file input. New messages arrive via short polling — the
// same pattern the map and billing previews already use.

const POLL_MS = 4000;

function fmtWhen(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function chatTitle(chat: ChatSummary) {
  // Name the conversation after the people in it. For participants that means
  // "the others"; for an admin peeking in, the full participant list.
  const names = chat.participants.map((p) => p.name);
  return names.join(", ") || "Conversation";
}

function AttachmentView({ m, light }: { m: ChatMessage; light: boolean }) {
  if (!m.fileUrl) return null;
  const type = m.fileType ?? "";
  if (type.startsWith("image/")) {
    return (
      <a href={m.fileUrl} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.fileUrl} alt={m.fileName ?? "image"} className="max-h-48 rounded-lg border object-cover" />
      </a>
    );
  }
  if (type.startsWith("video/")) {
    return <video src={m.fileUrl} controls preload="metadata" className="max-h-48 rounded-lg border" />;
  }
  return (
    <a
      href={m.fileUrl}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium",
        light ? "border-primary-foreground/30 hover:bg-primary-foreground/10" : "bg-background hover:bg-accent"
      )}
    >
      <Paperclip className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[180px] truncate">{m.fileName ?? "Attachment"}</span>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </a>
  );
}

export function JobChat({
  jobId, onFileShared,
}: {
  jobId: string;
  // Lets the parent prepend a chat attachment to its media grid immediately.
  onFileShared?: (file: any) => void;
}) {
  const { toast } = useToast();

  const [chats, setChats] = React.useState<ChatSummary[]>([]);
  const [loadingChats, setLoadingChats] = React.useState(true);
  const [unavailable, setUnavailable] = React.useState(false);

  // view: the chat list, the "new chat" picker, or an open thread.
  const [view, setView] = React.useState<"list" | "new">("list");
  const [openChat, setOpenChat] = React.useState<ChatSummary | null>(null);

  const refreshChats = React.useCallback(async () => {
    const res = await listJobChats(jobId);
    if ("error" in res && res.error) return;
    if ((res as any).unavailable) setUnavailable(true);
    setChats((res as any).data ?? []);
  }, [jobId]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingChats(true);
      await refreshChats();
      if (!cancelled) setLoadingChats(false);
    })();
    return () => { cancelled = true; };
  }, [refreshChats]);

  // Keep the list fresh while it's visible (new chats / new last-messages).
  React.useEffect(() => {
    if (openChat || view !== "list") return;
    const t = setInterval(refreshChats, POLL_MS * 3);
    return () => clearInterval(t);
  }, [openChat, view, refreshChats]);

  // ---- new chat picker ----
  const [people, setPeople] = React.useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [creating, setCreating] = React.useState(false);

  async function openNewChat() {
    setView("new");
    setSelected(new Set());
    const res = await listChatUsers();
    if ("error" in res && res.error) return toast({ title: "Couldn't load people", description: res.error, variant: "destructive" });
    setPeople((res as any).data ?? []);
  }

  async function startChat() {
    setCreating(true);
    try {
      const res = await createJobChat(jobId, Array.from(selected));
      if (res.error || !res.data) throw new Error(res.error ?? "Failed");
      if (res.data.existing) {
        toast({ title: "You already have this chat", description: "Opening the existing conversation." });
      }
      await refreshChats();
      const list = await listJobChats(jobId);
      const found = ((list as any).data as ChatSummary[] | undefined)?.find((c) => c.id === res.data!.id);
      setView("list");
      if (found) setOpenChat(found);
    } catch (e: any) {
      toast({ title: "Couldn't start chat", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  // ---- open thread ----
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [sending, setSending] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const lastCountRef = React.useRef(0);

  const loadMessages = React.useCallback(async (chatId: string) => {
    const res = await getChatMessages(chatId);
    if ("error" in res && res.error) return;
    setMessages((res as any).data ?? []);
  }, []);

  React.useEffect(() => {
    if (!openChat) return;
    let cancelled = false;
    (async () => {
      setLoadingMessages(true);
      await loadMessages(openChat.id);
      if (!cancelled) setLoadingMessages(false);
    })();
    const t = setInterval(() => loadMessages(openChat.id), POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [openChat, loadMessages]);

  // Stick to the bottom when messages arrive.
  React.useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  async function handleSend() {
    if (!openChat || sending) return;
    const body = draft.trim();
    const f = pendingFile;
    if (!body && !f) return;
    setSending(true);
    try {
      let file: { url: string; name: string; contentType: string | null; sizeBytes: number | null } | null = null;
      if (f) {
        if (f.size > 50 * 1024 * 1024) throw new Error("File is too large (max 50 MB).");
        const fd = new FormData();
        fd.append("file", f);
        fd.append("prefix", `job-files/${jobId}`);
        fd.append("kind", "job-file");
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        const json = await up.json();
        if (!up.ok) throw new Error(json.error || "Upload failed");
        file = { url: json.url, name: f.name, contentType: f.type || null, sizeBytes: f.size };
      }
      const res = await sendChatMessage(openChat.id, { body, file });
      if (res.error || !res.data) throw new Error(res.error ?? "Failed to send");
      setMessages((ms) => [...ms, res.data!.message]);
      if (res.data.sharedFile && onFileShared) onFileShared(res.data.sharedFile);
      setDraft("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      toast({ title: "Couldn't send", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  // ---------------------------------------------------------------- render
  if (unavailable) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
        <MessagesSquare className="h-8 w-8" />
        <p>Chat isn&apos;t set up yet — apply database migration 0015_job_chats.sql.</p>
      </div>
    );
  }

  // ---- open thread ----
  if (openChat) {
    return (
      <div className="flex h-[min(65vh,560px)] flex-col">
        {/* Thread header */}
        <div className="flex items-center gap-2 border-b pb-2">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => { setOpenChat(null); refreshChats(); }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{chatTitle(openChat)}</p>
            <p className="text-xs text-muted-foreground">
              {openChat.participants.length} participants
              {!openChat.isParticipant && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <Eye className="h-3 w-3" /> viewing as admin
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto py-3 pr-1">
          {loadingMessages && (
            <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          )}
          {!loadingMessages && messages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No messages yet — say hi!</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[82%] space-y-1.5 rounded-2xl px-3 py-2",
                  m.mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"
                )}
              >
                {!m.mine && <p className="text-[11px] font-semibold text-primary">{m.senderName ?? "Unknown"}</p>}
                <AttachmentView m={m} light={m.mine} />
                {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
                <p className={cn("text-right text-[10px]", m.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {fmtWhen(m.createdAt)}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="space-y-2 border-t pt-2">
          {pendingFile && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{pendingFile.name}</span>
              <button type="button" onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="rounded p-0.5 hover:bg-accent">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()} aria-label="Attach file">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder="Type a message…"
              rows={1}
              className="max-h-32 min-h-[40px] flex-1 resize-none"
            />
            <Button type="button" size="icon" className="shrink-0" disabled={sending || (!draft.trim() && !pendingFile)} onClick={handleSend} aria-label="Send">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- new chat picker ----
  if (view === "new") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setView("list")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-semibold">New chat — pick people</p>
        </div>
        {people.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No one else to chat with yet.</p>
        )}
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {people.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent/50">
              <Checkbox
                checked={selected.has(p.id)}
                onCheckedChange={(v) => {
                  setSelected((s) => {
                    const next = new Set(s);
                    if (v) next.add(p.id); else next.delete(p.id);
                    return next;
                  });
                }}
              />
              <span className="truncate">{p.name}</span>
            </label>
          ))}
        </div>
        <Button className="w-full" disabled={creating || selected.size === 0} onClick={startChat}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessagesSquare className="mr-2 h-4 w-4" />}
          Open chat
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          If a chat with these exact people already exists on this job, it opens instead of creating a duplicate.
        </p>
      </div>
    );
  }

  // ---- chat list ----
  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" className="w-full" onClick={openNewChat}>
        <Plus className="mr-1.5 h-4 w-4" />New chat
      </Button>
      {loadingChats && (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      )}
      {!loadingChats && chats.length === 0 && (
        <div className="flex h-36 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
          <MessagesSquare className="h-8 w-8" />
          <p>No chats on this job yet.</p>
        </div>
      )}
      {chats.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setOpenChat(c)}
          className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-violet-500/15">
            <MessagesSquare className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{chatTitle(c)}</p>
              {c.lastMessage && <span className="shrink-0 text-[10px] text-muted-foreground">{fmtWhen(c.lastMessage.createdAt)}</span>}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {c.lastMessage
                ? `${c.lastMessage.sender ? c.lastMessage.sender + ": " : ""}${c.lastMessage.body || c.lastMessage.fileName || "Attachment"}`
                : "No messages yet"}
              {!c.isParticipant && <span className="ml-1.5 text-amber-600 dark:text-amber-400">· admin view</span>}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
