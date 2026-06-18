"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  MessagesSquare, Plus, Send, Paperclip, X, Loader2, ChevronLeft, Download, Eye,
  Check, CheckCheck, Reply, Pencil, Trash2, SmilePlus, MoreVertical, Info, Copy,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  listJobChats, listChatUsers, createJobChat, syncChat, markChatRead, setTyping,
  sendChatMessage, toggleReaction, editMessage, deleteChatMessage,
  type ChatSummary, type ChatMessage, type ChatParticipantState,
} from "./[id]/chat-actions";

// Per-job chat: a list of conversations + the open thread. The thread polls
// syncChat which returns messages, every participant's read/seen state (drives
// the delivery ✓✓ + read receipts), reactions and typing. Built on polling, the
// same pattern the rest of the app uses.

const POLL_MS = 3500;
const QUICK_EMOJI = ["👍", "❤️", "😂", "🎉", "✅", "🙏"];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtWhen(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? fmtTime(iso) : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + fmtTime(iso);
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}
function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
function initials(name: string | null) {
  return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}
function chatTitle(chat: ChatSummary) {
  return chat.participants.map((p) => p.name).join(", ") || "Conversation";
}

// Delivery/read state of one of MY messages, derived from participant state.
type Delivery = { state: "sent" | "delivered" | "read"; readers: ChatParticipantState[]; total: number };
function deliveryFor(msg: ChatMessage, participants: ChatParticipantState[], me: string): Delivery | null {
  const others = participants.filter((p) => p.id !== me);
  if (others.length === 0) return null;
  const created = new Date(msg.createdAt).getTime();
  const readers = others.filter((p) => p.lastReadAt && new Date(p.lastReadAt).getTime() >= created);
  const seers = others.filter((p) => p.lastSeenAt && new Date(p.lastSeenAt).getTime() >= created);
  if (readers.length === others.length) return { state: "read", readers, total: others.length };
  if (seers.length > 0) return { state: "delivered", readers, total: others.length };
  return { state: "sent", readers, total: others.length };
}

function Ticks({ d }: { d: Delivery }) {
  if (d.state === "sent") return <Check className="h-3.5 w-3.5 opacity-70" />;
  if (d.state === "delivered") return <CheckCheck className="h-3.5 w-3.5 opacity-70" />;
  return <CheckCheck className="h-3.5 w-3.5 text-sky-300" />;
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
    <a href={m.fileUrl} target="_blank" rel="noreferrer"
      className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium",
        light ? "border-primary-foreground/30 hover:bg-primary-foreground/10" : "bg-background hover:bg-accent")}>
      <Paperclip className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[180px] truncate">{m.fileName ?? "Attachment"}</span>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </a>
  );
}

export function JobChat({ jobId, onFileShared }: { jobId: string; onFileShared?: (file: any) => void; }) {
  const { toast } = useToast();

  const [chats, setChats] = React.useState<ChatSummary[]>([]);
  const [loadingChats, setLoadingChats] = React.useState(true);
  const [unavailable, setUnavailable] = React.useState(false);
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
    (async () => { setLoadingChats(true); await refreshChats(); if (!cancelled) setLoadingChats(false); })();
    return () => { cancelled = true; };
  }, [refreshChats]);

  React.useEffect(() => {
    if (openChat || view !== "list") return;
    const t = setInterval(refreshChats, POLL_MS * 2);
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
      if (res.data.existing) toast({ title: "You already have this chat", description: "Opening the existing conversation." });
      await refreshChats();
      const list = await listJobChats(jobId);
      const found = ((list as any).data as ChatSummary[] | undefined)?.find((c) => c.id === res.data!.id);
      setView("list");
      if (found) setOpenChat(found);
    } catch (e: any) {
      toast({ title: "Couldn't start chat", description: e.message, variant: "destructive" });
    } finally { setCreating(false); }
  }

  // ---- open thread state ----
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [participants, setParticipants] = React.useState<ChatParticipantState[]>([]);
  const [typing, setTypingUsers] = React.useState<{ id: string; name: string }[]>([]);
  const [me, setMe] = React.useState("");
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [sending, setSending] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null);
  const [editing, setEditing] = React.useState<ChatMessage | null>(null);
  const [infoFor, setInfoFor] = React.useState<ChatMessage | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const lastCountRef = React.useRef(0);
  const lastTypingSentRef = React.useRef(0);

  const sync = React.useCallback(async (chatId: string, markRead: boolean) => {
    const res = await syncChat(chatId);
    if ("error" in res && res.error) return;
    const data = (res as any).data as { messages: ChatMessage[]; participants: ChatParticipantState[]; typing: any[]; me: string };
    if (!data) return;
    setMessages(data.messages);
    setParticipants(data.participants);
    setTypingUsers(data.typing ?? []);
    setMe(data.me);
    if (markRead) { markChatRead(chatId).catch(() => {}); }
  }, []);

  React.useEffect(() => {
    if (!openChat) return;
    let cancelled = false;
    (async () => {
      setLoadingMessages(true);
      await sync(openChat.id, true);
      if (!cancelled) setLoadingMessages(false);
    })();
    const t = setInterval(() => sync(openChat.id, true), POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [openChat, sync]);

  React.useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  function onDraftChange(v: string) {
    setDraft(v);
    if (openChat) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 2500) { lastTypingSentRef.current = now; setTyping(openChat.id).catch(() => {}); }
    }
  }

  async function handleSend() {
    if (!openChat || sending) return;
    const body = draft.trim();

    // Editing path
    if (editing) {
      if (!body) return;
      setSending(true);
      try {
        const res = await editMessage(editing.id, body);
        if (res.error) throw new Error(res.error);
        setMessages((ms) => ms.map((m) => (m.id === editing.id ? { ...m, body, editedAt: new Date().toISOString() } : m)));
        setEditing(null); setDraft("");
      } catch (e: any) {
        toast({ title: "Couldn't edit", description: e.message, variant: "destructive" });
      } finally { setSending(false); }
      return;
    }

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
      const res = await sendChatMessage(openChat.id, { body, file, replyToId: replyTo?.id ?? null });
      if (res.error || !res.data) throw new Error(res.error ?? "Failed to send");
      setMessages((ms) => [...ms, res.data!.message]);
      if (res.data.sharedFile && onFileShared) onFileShared(res.data.sharedFile);
      setDraft(""); setPendingFile(null); setReplyTo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      toast({ title: "Couldn't send", description: e.message, variant: "destructive" });
    } finally { setSending(false); }
  }

  async function react(m: ChatMessage, emoji: string) {
    // Optimistic toggle.
    setMessages((ms) => ms.map((x) => {
      if (x.id !== m.id) return x;
      const existing = x.reactions.find((r) => r.emoji === emoji);
      let reactions;
      if (existing?.mine) {
        reactions = x.reactions
          .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r))
          .filter((r) => r.count > 0);
      } else if (existing) {
        reactions = x.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r));
      } else {
        reactions = [...x.reactions, { emoji, count: 1, mine: true, names: ["You"] }];
      }
      return { ...x, reactions };
    }));
    const res = await toggleReaction(m.id, emoji);
    if ((res as any).error) {
      toast({ title: "Reaction failed", description: (res as any).error, variant: "destructive" });
      if (openChat) sync(openChat.id, false);
    }
  }

  function startEdit(m: ChatMessage) { setEditing(m); setReplyTo(null); setDraft(m.body); setTimeout(() => composerRef.current?.focus(), 0); }
  function startReply(m: ChatMessage) { setReplyTo(m); setEditing(null); setTimeout(() => composerRef.current?.focus(), 0); }

  async function removeMessage(m: ChatMessage) {
    setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, deleted: true, body: "", fileUrl: null, reactions: [] } : x)));
    const res = await deleteChatMessage(m.id);
    if ((res as any).error) {
      toast({ title: "Couldn't delete", description: (res as any).error, variant: "destructive" });
      if (openChat) sync(openChat.id, false);
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

  if (openChat) {
    const lastMineId = [...messages].reverse().find((m) => m.mine && !m.deleted)?.id;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background md:static md:z-auto md:h-[min(65vh,560px)] md:rounded-xl md:border">
        {/* Thread header */}
        <div className="flex items-center gap-2 border-b bg-background/95 px-2 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur-md md:rounded-t-xl md:px-3 md:pt-2">
          <button type="button" onClick={() => { setOpenChat(null); setReplyTo(null); setEditing(null); refreshChats(); }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-accent" aria-label="Back to chats">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight md:text-sm">{chatTitle(openChat)}</p>
            <p className="text-xs text-muted-foreground">
              {typing.length > 0 ? (
                <span className="text-primary">{typing.map((t) => t.name.split(" ")[0]).join(", ")} {typing.length === 1 ? "is" : "are"} typing…</span>
              ) : (
                <>
                  {openChat.participants.length} participants
                  {!openChat.isParticipant && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Eye className="h-3 w-3" /> viewing as admin</span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3 md:px-3">
          {loadingMessages && <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>}
          {!loadingMessages && messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No messages yet — say hi!</p>}

          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const showDate = i === 0 || !prev || !sameDay(prev.createdAt, m.createdAt);
            const groupStart = showDate || !prev || prev.senderId !== m.senderId || prev.deleted !== m.deleted;
            const d = m.mine && !m.deleted ? deliveryFor(m, participants, me) : null;
            return (
              <React.Fragment key={m.id}>
                {showDate && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground">{dayLabel(m.createdAt)}</span>
                  </div>
                )}
                <div className={cn("group/msg flex items-end gap-2", m.mine ? "justify-end" : "justify-start")}>
                  {/* Avatar gutter for others */}
                  {!m.mine && (
                    <div className="w-7 shrink-0 self-end">
                      {groupStart && (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20 text-[10px] font-semibold text-primary">
                          {initials(m.senderName)}
                        </div>
                      )}
                    </div>
                  )}

                  <div className={cn("flex max-w-[82%] flex-col", m.mine ? "items-end" : "items-start")}>
                    {/* Message + hover menu */}
                    <div className={cn("flex items-end gap-1", m.mine ? "flex-row-reverse" : "flex-row")}>
                      <div className={cn(
                        "relative space-y-1 rounded-2xl px-3.5 py-2",
                        m.deleted ? "border bg-muted/40 italic text-muted-foreground"
                          : m.mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"
                      )}>
                        {groupStart && !m.mine && !m.deleted && (
                          <p className="text-[11px] font-semibold text-primary">{m.senderName ?? "Unknown"}</p>
                        )}
                        {/* Reply quote */}
                        {m.replyTo && !m.deleted && (
                          <div className={cn("mb-1 rounded-md border-l-2 px-2 py-1 text-[11px]",
                            m.mine ? "border-primary-foreground/50 bg-primary-foreground/10" : "border-primary/50 bg-background/60")}>
                            <p className="font-semibold opacity-90">{m.replyTo.sender ?? "Unknown"}</p>
                            <p className="truncate opacity-80">{m.replyTo.deleted ? "Deleted message" : (m.replyTo.body || m.replyTo.fileName || "Attachment")}</p>
                          </div>
                        )}
                        {m.deleted ? (
                          <p className="flex items-center gap-1.5 text-[13px]"><Trash2 className="h-3.5 w-3.5" /> This message was deleted</p>
                        ) : (
                          <>
                            <AttachmentView m={m} light={m.mine} />
                            {m.body && <p className="whitespace-pre-wrap break-words text-[15px] leading-snug md:text-sm">{m.body}</p>}
                          </>
                        )}
                        <div className={cn("flex items-center justify-end gap-1 text-[10px]", m.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {m.editedAt && !m.deleted && <span className="italic">edited</span>}
                          <span>{fmtTime(m.createdAt)}</span>
                          {d && <Ticks d={d} />}
                        </div>
                      </div>

                      {/* Per-message menu */}
                      {!m.deleted && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-60 transition-opacity hover:bg-accent focus:opacity-100 md:opacity-0 md:group-hover/msg:opacity-100" aria-label="Message actions">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={m.mine ? "end" : "start"} className="w-44">
                            <div className="flex justify-around px-1 py-1">
                              {QUICK_EMOJI.map((e) => (
                                <button key={e} type="button" onClick={() => react(m, e)} className="rounded-md px-1 text-lg transition-transform hover:scale-125" aria-label={`React ${e}`}>{e}</button>
                              ))}
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => startReply(m)}><Reply className="h-4 w-4" /> Reply</DropdownMenuItem>
                            {m.body && (
                              <DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(m.body); toast({ title: "Copied" }); }}><Copy className="h-4 w-4" /> Copy text</DropdownMenuItem>
                            )}
                            {m.mine && (
                              <DropdownMenuItem onClick={() => setInfoFor(m)}><Info className="h-4 w-4" /> Info</DropdownMenuItem>
                            )}
                            {m.mine && m.body && (
                              <DropdownMenuItem onClick={() => startEdit(m)}><Pencil className="h-4 w-4" /> Edit</DropdownMenuItem>
                            )}
                            {m.mine && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => removeMessage(m)} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    {/* Reaction chips */}
                    {m.reactions.length > 0 && (
                      <div className={cn("mt-0.5 flex flex-wrap gap-1", m.mine ? "justify-end" : "justify-start")}>
                        {m.reactions.map((r) => (
                          <button key={r.emoji} type="button" onClick={() => react(m, r.emoji)}
                            title={r.names.join(", ")}
                            className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors",
                              r.mine ? "border-primary/40 bg-primary/10 text-foreground" : "bg-background hover:bg-accent")}>
                            <span>{r.emoji}</span><span className="font-medium">{r.count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Read/delivered receipt under my last message */}
                    {m.id === lastMineId && d && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {d.state === "read"
                          ? (d.total > 1 ? `Read by all (${d.total})` : `Read${d.readers[0]?.lastReadAt ? " · " + fmtTime(d.readers[0].lastReadAt) : ""}`)
                          : d.state === "delivered"
                          ? (d.readers.length > 0 ? `Read by ${d.readers.length}/${d.total}` : "Delivered")
                          : "Sent"}
                      </p>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="space-y-2 border-t bg-background px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2.5 md:rounded-b-xl md:pb-3">
          {(replyTo || editing) && (
            <div className="flex items-center gap-2 rounded-xl border-l-2 border-primary bg-muted/40 px-3 py-1.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-primary">{editing ? "Editing message" : `Replying to ${replyTo?.senderName ?? ""}`}</p>
                <p className="truncate text-muted-foreground">{(editing ?? replyTo)?.body || (editing ?? replyTo)?.fileName || "Attachment"}</p>
              </div>
              <button type="button" onClick={() => { setReplyTo(null); setEditing(null); if (editing) setDraft(""); }} className="rounded-full p-1 hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {pendingFile && !editing && (
            <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{pendingFile.name}</span>
              <button type="button" onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="rounded-full p-1 hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <div className="flex items-end gap-2">
            {!editing && (
              <label aria-label="Attach file" className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors active:bg-accent md:h-11 md:w-11">
                <Paperclip className="h-5 w-5" />
                <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
            <Textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } if (e.key === "Escape") { setReplyTo(null); setEditing(null); } }}
              placeholder={editing ? "Edit your message…" : "Type a message…"}
              rows={1}
              className="max-h-32 min-h-[48px] flex-1 resize-none rounded-3xl bg-muted px-4 py-3 text-[15px] md:min-h-[44px]"
            />
            <button type="button" disabled={sending || (!draft.trim() && !pendingFile)} onClick={handleSend} aria-label="Send"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95 disabled:opacity-40 md:h-11 md:w-11">
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : editing ? <Check className="h-5 w-5" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Message info (delivery + read verification) */}
        <MessageInfoDialog message={infoFor} participants={participants} me={me} onClose={() => setInfoFor(null)} />
      </div>
    );
  }

  // ---- new chat picker ----
  if (view === "new") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setView("list")}><ChevronLeft className="h-4 w-4" /></Button>
          <p className="text-sm font-semibold">New chat — pick people</p>
        </div>
        {people.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No one else to chat with yet.</p>}
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {people.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent/50">
              <Checkbox checked={selected.has(p.id)} onCheckedChange={(v) => setSelected((s) => { const next = new Set(s); if (v) next.add(p.id); else next.delete(p.id); return next; })} />
              <span className="truncate">{p.name}</span>
            </label>
          ))}
        </div>
        <Button className="h-11 w-full" disabled={creating || selected.size === 0} onClick={startChat}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessagesSquare className="mr-2 h-4 w-4" />} Open chat
        </Button>
        <p className="text-center text-xs text-muted-foreground">If a chat with these exact people already exists on this job, it opens instead of creating a duplicate.</p>
      </div>
    );
  }

  // ---- chat list ----
  return (
    <div className="md:space-y-2">
      <Button variant="outline" size="sm" className="hidden w-full md:flex" onClick={openNewChat}><Plus className="mr-1.5 h-4 w-4" />New chat</Button>
      {loadingChats && <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>}
      {!loadingChats && chats.length === 0 && (
        <div className="flex h-36 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
          <MessagesSquare className="h-8 w-8" /><p>No chats on this job yet.</p>
        </div>
      )}
      <div className="-mx-4 md:mx-0 md:space-y-2">
        {chats.map((c) => (
          <button key={c.id} type="button" onClick={() => setOpenChat(c)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-accent md:rounded-lg md:border md:px-3 md:py-2.5 md:hover:bg-accent/50">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-violet-500/15 md:h-9 md:w-9">
              <MessagesSquare className="h-5 w-5 text-primary md:h-4 md:w-4" />
              {c.unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{c.unread > 9 ? "9+" : c.unread}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn("truncate text-[15px] md:text-sm", c.unread > 0 ? "font-bold" : "font-semibold md:font-medium")}>{chatTitle(c)}</p>
                {c.lastMessage && <span className="shrink-0 text-xs text-muted-foreground md:text-[10px]">{fmtWhen(c.lastMessage.createdAt)}</span>}
              </div>
              <p className={cn("truncate text-sm md:text-xs", c.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                {c.lastMessage
                  ? c.lastMessage.deleted
                    ? "Message deleted"
                    : `${c.lastMessage.sender ? c.lastMessage.sender + ": " : ""}${c.lastMessage.body || c.lastMessage.fileName || "Attachment"}`
                  : "No messages yet"}
                {!c.isParticipant && <span className="ml-1.5 text-amber-600 dark:text-amber-400">· admin view</span>}
              </p>
            </div>
          </button>
        ))}
      </div>

      <button type="button" onClick={openNewChat}
        className="fixed bottom-24 right-4 z-30 flex h-14 items-center gap-2 rounded-2xl bg-primary px-5 text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 md:hidden">
        <Plus className="h-5 w-5" /><span className="text-sm font-semibold">New chat</span>
      </button>
    </div>
  );
}

// Delivery + read verification for one of my messages.
function MessageInfoDialog({ message, participants, me, onClose }: {
  message: ChatMessage | null; participants: ChatParticipantState[]; me: string; onClose: () => void;
}) {
  if (!message) return null;
  const created = new Date(message.createdAt).getTime();
  const others = participants.filter((p) => p.id !== me);
  const rows = others.map((p) => {
    const read = p.lastReadAt && new Date(p.lastReadAt).getTime() >= created;
    const delivered = p.lastSeenAt && new Date(p.lastSeenAt).getTime() >= created;
    return {
      name: p.name,
      state: read ? "Read" : delivered ? "Delivered" : "Sent",
      when: read ? p.lastReadAt : delivered ? p.lastSeenAt : null,
    };
  });
  return (
    <Dialog open={!!message} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="z-[60] sm:max-w-sm">
        <DialogHeader><DialogTitle>Message info</DialogTitle></DialogHeader>
        <div className="rounded-lg bg-muted/40 p-3 text-sm">{message.body || message.fileName || "Attachment"}</div>
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No other participants.</p>}
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{r.name}</span>
              <span className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                {r.state === "Read" ? <CheckCheck className="h-4 w-4 text-sky-500" /> : r.state === "Delivered" ? <CheckCheck className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {r.state}{r.when ? ` · ${fmtTime(r.when)}` : ""}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
