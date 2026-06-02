"use client";

import * as React from "react";
import { getJobDetail, updateJob, deleteJob } from "./actions";
import {
  setJobStatus,
  addCrew as addCrewAction, removeCrew as removeCrewAction,
  adminCreatePunch, adminUpdatePunch, adminDeletePunchEndTime, adminDeletePunch,
  addJobItem as addJobItemAction, removeJobItem as removeJobItemAction, setJobItemExcluded,
  addJobCost as addJobCostAction, removeJobCost as removeJobCostAction, setJobCostExcluded,
  generateInvoice as generateInvoiceAction, saveJobNotes,
  addJobFile as addJobFileAction, removeJobFile as removeJobFileAction,
} from "./[id]/actions";
import { SlideOver } from "@/components/slide-over";
import { ResizablePanels } from "@/components/resizable-panels";
import { JobDetailSkeleton } from "@/components/skeletons";
import { RowContextMenu, DeleteConfirm, type ContextMenuState } from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fmtMoney, fmtDate, cn } from "@/lib/utils";
import { computeBilling } from "@/lib/billing";
import {
  Plus, Trash2, Pencil, Download, Send, Mail, Camera, FileText, MoreVertical, X,
  CheckCircle, AlertTriangle, Clock, Upload, Paperclip, Play, DollarSign, Undo2,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TipTapImage from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

// ---- Types ----
interface Employee { id: string; name: string; role_title: string | null; pay_rate: number; require_punch_photo: boolean; }
interface Job {
  id: string; title: string; place: string | null; scheduled_date: string | null;
  customer_name: string | null; customer_email: string | null; notes: string | null;
  estimate: number; billing_mode: string; billing_rate: number | null; status: string;
  require_punch_photo: boolean; created_at: string; updated_at: string | null;
}
interface JobItem { id: string; item_id: string | null; name: string; qty: number; cost: number; charge: number; excluded: boolean; }
interface CatalogItem { id: string; name: string; cost: number; charge: number; stock: number; }
interface JobCost { id: string; label: string; cost: number; charge: number; excluded: boolean; }
interface Punch {
  id: string; employee_id: string; kind: string; started_at: string; ended_at: string | null;
  note: string | null; started_photo_url: string | null; ended_photo_url: string | null;
  edited_by: string | null; edited_at: string | null;
}
interface Company { id: string; name: string; invoice_from: string | null; default_rate: number; tax_rate: number; logo_url: string | null; }
interface LineItem { name: string; qty?: number; amount: number; }
interface FullInvoice {
  id: string; number: string; status: string; total: number; created_at: string; subtotal: number; tax: number;
  line_items: LineItem[]; customer_name: string | null; customer_email: string | null;
  notes: string | null; due_date: string | null; file_name: string | null;
}
interface JobNotes { body_html: string; updated_at: string | null; updated_by: string | null; }
interface JobFile {
  id: string; name: string; url: string; content_type: string | null;
  size_bytes: number | null; kind: string; created_at: string;
}

export interface JobSlideOverPerms {
  jobEdit: boolean; jobDelete: boolean;
  punchesView: boolean; punchesManage: boolean;
  mediaView: boolean; mediaManage: boolean;
  invoicesView: boolean; invoicesCreate: boolean; invoicesEdit: boolean; invoicesSend: boolean;
  notesView: boolean; notesEdit: boolean;
}

interface JobSlideOverProps {
  jobId: string | null;
  perms: JobSlideOverPerms;
}

// ---- Helper: duration formatting ----
function fmtDur(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---- Reusable section box (matches the boxed record-detail layout) ----
function SectionBox({
  title, count, actions, children, contentClassName,
}: {
  title: string; count?: number; actions?: React.ReactNode; children: React.ReactNode; contentClassName?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {count != null && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </CardTitle>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className={cn("p-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

// ---- TipTap Notes Editor ----
function NotesEditor({
  jobId, initialHtml, canEdit, updatedAt, updatedBy,
}: {
  jobId: string; initialHtml: string; canEdit: boolean; updatedAt: string | null; updatedBy: string | null;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [lastSaved, setLastSaved] = React.useState<Date | null>(updatedAt ? new Date(updatedAt) : null);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TipTapImage.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Add notes for this job…" }),
    ],
    content: initialHtml || "",
    editable: canEdit,
    onUpdate: ({ editor }) => {
      if (!canEdit) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        await saveJobNotes(jobId, editor.getHTML());
        setSaving(false);
        setLastSaved(new Date());
      }, 1500);
    },
  });

  React.useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  return (
    <div className="space-y-2">
      {canEdit && (
        <div className="flex gap-1 rounded-md border bg-muted/40 p-1 w-fit">
          <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`rounded px-2.5 py-1 text-sm font-bold transition-colors hover:bg-background ${editor?.isActive("bold") ? "bg-background shadow-sm" : "text-muted-foreground"}`}>B</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`rounded px-2.5 py-1 text-sm italic transition-colors hover:bg-background ${editor?.isActive("italic") ? "bg-background shadow-sm" : "text-muted-foreground"}`}>I</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleStrike().run()} className={`rounded px-2.5 py-1 text-sm underline transition-colors hover:bg-background ${editor?.isActive("strike") ? "bg-background shadow-sm" : "text-muted-foreground"}`}>U</button>
        </div>
      )}
      <div className="min-h-[200px] rounded-md border bg-background p-3 prose prose-sm max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[180px]">
        <EditorContent editor={editor} />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {saving && <span>Saving…</span>}
        {!saving && lastSaved && <span>Last saved {lastSaved.toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

// ---- Invoice PDF helper (reused from job-detail) ----
async function downloadPdf(inv: FullInvoice, company: Company | null) {
  const { jsPDF } = await import("jspdf");
  const { fmtMoney: fmt, fmtDate: fd } = await import("@/lib/utils");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210; const margin = 20; const cw = pageW - margin * 2;
  const blue: [number,number,number] = [30,64,175]; const white: [number,number,number] = [255,255,255];
  const dark: [number,number,number] = [17,24,39]; const gray: [number,number,number] = [100,116,139];
  const lightGray: [number,number,number] = [248,250,252]; const border: [number,number,number] = [226,232,240];
  const pageH = 297;

  doc.setFillColor(...blue); doc.rect(0, 0, pageW, 42, "F");
  const companyDisplay = company?.invoice_from || company?.name || "";
  doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(...white);
  doc.text(companyDisplay, margin, 24);
  doc.setFontSize(20); doc.text("INVOICE", pageW - margin, 19, { align: "right" });
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(inv.number, pageW - margin, 27, { align: "right" });

  let y = 52;
  doc.setFontSize(8); doc.setTextColor(...gray);
  doc.text("DATE ISSUED", margin, y); doc.text("DUE DATE", margin + 55, y); doc.text("STATUS", margin + 110, y);
  y += 5;
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...dark);
  doc.text(fd(inv.created_at), margin, y);
  doc.text(inv.due_date ? fd(inv.due_date) : "—", margin + 55, y);
  doc.setTextColor(inv.status === "sent" ? 22 : 100, inv.status === "sent" ? 163 : 116, inv.status === "sent" ? 74 : 139);
  doc.text(inv.status.toUpperCase(), margin + 110, y);
  doc.setFont("helvetica", "normal"); y += 10;

  doc.setDrawColor(...border); doc.line(margin, y, pageW - margin, y); y += 8;
  doc.setFontSize(8); doc.setTextColor(...gray); doc.text("BILL TO", margin, y); y += 5;
  doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...dark);
  doc.text(inv.customer_name ?? "—", margin, y); y += 5;
  if (inv.customer_email) {
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
    doc.text(inv.customer_email, margin, y); y += 4;
  }
  doc.setFont("helvetica", "normal"); y += 8;

  doc.setFillColor(...lightGray); doc.rect(margin, y, cw, 8, "F");
  doc.setDrawColor(...border); doc.rect(margin, y, cw, 8, "D");
  doc.setFontSize(8); doc.setTextColor(...gray);
  doc.text("DESCRIPTION", margin + 3, y + 5);
  doc.text("QTY", margin + 120, y + 5, { align: "right" });
  doc.text("AMOUNT", pageW - margin - 3, y + 5, { align: "right" });
  y += 9;

  (inv.line_items ?? []).forEach((l, idx) => {
    if (idx % 2 === 1) { doc.setFillColor(249, 250, 251); doc.rect(margin, y, cw, 8, "F"); }
    doc.setDrawColor(...border); doc.line(margin, y + 8, pageW - margin, y + 8);
    doc.setFontSize(10); doc.setTextColor(...dark);
    const name = l.name.length > 52 ? l.name.slice(0, 49) + "..." : l.name;
    doc.text(name, margin + 3, y + 5.5);
    if (l.qty != null) { doc.setTextColor(...gray); doc.text(String(l.qty), margin + 120, y + 5.5, { align: "right" }); }
    doc.setTextColor(...dark); doc.text(fmt(l.amount), pageW - margin - 3, y + 5.5, { align: "right" });
    y += 9;
  });
  y += 6;

  doc.setFontSize(10); doc.setTextColor(...gray);
  doc.text("Subtotal", pageW - margin - 45, y); doc.setTextColor(...dark);
  doc.text(fmt(inv.subtotal), pageW - margin, y, { align: "right" }); y += 7;
  doc.setTextColor(...gray); doc.text("Tax", pageW - margin - 45, y); doc.setTextColor(...dark);
  doc.text(fmt(inv.tax), pageW - margin, y, { align: "right" }); y += 5;
  doc.setFillColor(...blue); doc.rect(pageW - margin - 60, y, 60, 11, "F");
  doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...white);
  doc.text("TOTAL", pageW - margin - 57, y + 7.5);
  doc.text(fmt(inv.total), pageW - margin - 3, y + 7.5, { align: "right" });
  doc.setFont("helvetica", "normal"); y += 17;

  if (inv.notes) {
    doc.setFontSize(8); doc.setTextColor(...gray); doc.text("NOTES", margin, y); y += 5;
    doc.setFontSize(9.5); doc.setTextColor(55, 65, 81);
    const noteLines = doc.splitTextToSize(inv.notes, cw);
    doc.text(noteLines, margin, y);
  }

  doc.setFillColor(...lightGray); doc.rect(0, pageH - 14, pageW, 14, "F");
  doc.setFontSize(8); doc.setTextColor(...gray);
  doc.text("Thank you for your business.", pageW / 2, pageH - 5, { align: "center" });

  doc.save(`${inv.file_name || inv.number}.pdf`);
}

// ============================================================================
// Main Component
// ============================================================================
export function JobSlideOver({ jobId, perms }: JobSlideOverProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  // ---- loaded data ----
  const [job, setJob] = React.useState<Job | null>(null);
  const [crew, setCrew] = React.useState<Employee[]>([]);
  const [allEmployees, setAllEmployees] = React.useState<Employee[]>([]);
  const [jobItems, setJobItems] = React.useState<JobItem[]>([]);
  const [catalog, setCatalog] = React.useState<CatalogItem[]>([]);
  const [costs, setCosts] = React.useState<JobCost[]>([]);
  const [punches, setPunches] = React.useState<Punch[]>([]);
  const [company, setCompany] = React.useState<Company | null>(null);
  const [invoices, setInvoices] = React.useState<FullInvoice[]>([]);
  const [jobNotes, setJobNotes] = React.useState<JobNotes | null>(null);
  const [files, setFiles] = React.useState<JobFile[]>([]);

  // Load data when jobId changes
  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    setLoading(true);
    getJobDetail(jobId)
      .then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (res.error || !res.data) {
          toast({ title: "Couldn't load job", description: res.error ?? "Not found", variant: "destructive" });
          return;
        }
        const d = res.data as any;
        setJob(d.job); setCrew(d.crew); setAllEmployees(d.allEmployees);
        setJobItems(d.jobItems); setCatalog(d.catalog); setCosts(d.costs);
        setPunches(d.punches); setCompany(d.company); setInvoices(d.invoices);
        setJobNotes(d.notes);
        setFiles(d.files ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        toast({ title: "Couldn't load job", description: "Please try again.", variant: "destructive" });
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // ---- Overview edit state ----
  const [editing, setEditing] = React.useState(false);
  const [editForm, setEditForm] = React.useState<Partial<Job>>({});
  const [saving, setSaving] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  function startEdit() {
    if (!job) return;
    setEditForm({ ...job });
    setEditing(true);
  }

  async function saveEdit() {
    if (!job || !editForm.title) return;
    setSaving(true);
    const res = await updateJob(job.id, {
      title: editForm.title!, place: editForm.place ?? null,
      scheduled_date: editForm.scheduled_date ?? null,
      customer_name: editForm.customer_name ?? null,
      customer_email: editForm.customer_email ?? null,
      estimate: Number(editForm.estimate ?? 0),
      billing_mode: editForm.billing_mode ?? "itemized",
      billing_rate: editForm.billing_rate ?? null,
      status: editForm.status,
    });
    setSaving(false);
    if (res.error) return toast({ title: "Save failed", description: res.error, variant: "destructive" });
    const updated = res.data as Job;
    setJob(updated);
    setEditing(false);
    router.refresh();
    toast({ title: "Job saved", variant: "success" });
  }

  async function handleMarkComplete() {
    if (!job) return;
    await setJobStatus(job.id, "complete");
    setJob((j) => j ? { ...j, status: "complete" } : j);
    router.refresh();
    toast({ title: "Job marked complete", variant: "success" });
  }

  async function handleDelete() {
    if (!job) return;
    const res = await deleteJob(job.id);
    if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    toast({ title: "Job deleted" });
    router.push("/jobs");
  }

  // ---- Crew management ----
  const availableToAdd = allEmployees.filter((e) => !crew.some((c) => c.id === e.id));

  async function addCrew(employeeId: string) {
    if (!job) return;
    const emp = allEmployees.find((e) => e.id === employeeId);
    if (!emp) return;
    const res = await addCrewAction(job.id, employeeId);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setCrew((c) => [...c, emp]);
  }
  async function removeCrew(employeeId: string) {
    if (!job) return;
    const res = await removeCrewAction(job.id, employeeId);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setCrew((c) => c.filter((e) => e.id !== employeeId));
  }

  // ---- Punch management ----
  const [punchSlideOpen, setPunchSlideOpen] = React.useState(false);
  const [editingPunch, setEditingPunch] = React.useState<Punch | null>(null);
  const [punchForm, setPunchForm] = React.useState({
    employeeId: "", kind: "site", startedAt: "", endedAt: "",
    note: "", startedPhotoUrl: "", endedPhotoUrl: "",
  });
  const [punchBusy, setPunchBusy] = React.useState(false);
  const [punchCtx, setPunchCtx] = React.useState<ContextMenuState | null>(null);
  const [deletePunchTarget, setDeletePunchTarget] = React.useState<Punch | null>(null);
  const [deletePunchMode, setDeletePunchMode] = React.useState<"end" | "all">("end");
  const [deletePunchConfirmOpen, setDeletePunchConfirmOpen] = React.useState(false);
  const [startPhotoFile, setStartPhotoFile] = React.useState<File | null>(null);
  const [endPhotoFile, setEndPhotoFile] = React.useState<File | null>(null);

  function openAddPunch() {
    setEditingPunch(null);
    const now = new Date();
    const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setPunchForm({ employeeId: crew[0]?.id ?? "", kind: "site", startedAt: localISO, endedAt: "", note: "", startedPhotoUrl: "", endedPhotoUrl: "" });
    setStartPhotoFile(null); setEndPhotoFile(null);
    setPunchSlideOpen(true);
  }
  function openEditPunch(p: Punch) {
    setEditingPunch(p);
    const toLocal = (iso: string) => new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setPunchForm({
      employeeId: p.employee_id, kind: p.kind,
      startedAt: toLocal(p.started_at),
      endedAt: p.ended_at ? toLocal(p.ended_at) : "",
      note: p.note ?? "", startedPhotoUrl: p.started_photo_url ?? "", endedPhotoUrl: p.ended_photo_url ?? "",
    });
    setStartPhotoFile(null); setEndPhotoFile(null);
    setPunchSlideOpen(true);
  }

  async function uploadFile(file: File, prefix: string): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("prefix", prefix);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    // Throw so the caller aborts instead of silently saving a punch without its photo.
    if (!res.ok) throw new Error(json.error || "Photo upload failed");
    return json.url as string;
  }

  async function savePunch() {
    if (!job || !punchForm.employeeId || !punchForm.startedAt) return;
    setPunchBusy(true);
    try {
      let startUrl = punchForm.startedPhotoUrl || null;
      let endUrl = punchForm.endedPhotoUrl || null;
      if (startPhotoFile) startUrl = await uploadFile(startPhotoFile, `punch-photos/${job.id}`);
      if (endPhotoFile) endUrl = await uploadFile(endPhotoFile, `punch-photos/${job.id}`);

      const startedAt = new Date(punchForm.startedAt).toISOString();
      const endedAt = punchForm.endedAt ? new Date(punchForm.endedAt).toISOString() : null;
      const note = punchForm.note || null;

      if (editingPunch) {
        const res = await adminUpdatePunch(editingPunch.id, {
          employeeId: punchForm.employeeId, kind: punchForm.kind,
          startedAt, endedAt, note, startedPhotoUrl: startUrl, endedPhotoUrl: endUrl,
        });
        if (res.error) throw new Error(res.error);
        setPunches((pp) => pp.map((p) => p.id === editingPunch.id ? {
          ...p, employee_id: punchForm.employeeId, kind: punchForm.kind,
          started_at: startedAt, ended_at: endedAt, note,
          started_photo_url: startUrl, ended_photo_url: endUrl,
          edited_at: new Date().toISOString(),
        } : p));
        toast({ title: "Punch updated" });
      } else {
        const res = await adminCreatePunch({
          jobId: job.id, employeeId: punchForm.employeeId, kind: punchForm.kind,
          startedAt, endedAt, note, startedPhotoUrl: startUrl, endedPhotoUrl: endUrl,
        });
        if (res.error) throw new Error(res.error);
        setPunches((pp) => [res.data as Punch, ...pp]);
        toast({ title: "Punch log added" });
      }
      setPunchSlideOpen(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setPunchBusy(false);
    }
  }

  function promptDeletePunch(p: Punch) {
    setDeletePunchTarget(p);
    setDeletePunchMode(p.ended_at ? "end" : "all");
    setDeletePunchConfirmOpen(true);
  }

  async function confirmDeletePunch() {
    if (!deletePunchTarget) return;
    if (deletePunchMode === "end") {
      const res = await adminDeletePunchEndTime(deletePunchTarget.id);
      if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
      setPunches((pp) => pp.map((p) => p.id === deletePunchTarget.id ? { ...p, ended_at: null, ended_photo_url: null } : p));
      toast({ title: "End time removed — punch is now open" });
    } else {
      const res = await adminDeletePunch(deletePunchTarget.id);
      if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
      setPunches((pp) => pp.filter((p) => p.id !== deletePunchTarget.id));
      toast({ title: "Punch deleted" });
    }
  }

  function punchRowMenu(e: React.MouseEvent, p: Punch) {
    e.preventDefault();
    const actions: ContextMenuState["actions"] = [
      { label: "Edit", icon: "edit", onClick: () => openEditPunch(p) },
      { label: p.ended_at ? "Remove end time" : "Delete punch", icon: "delete", onClick: () => promptDeletePunch(p), destructive: true },
    ];
    setPunchCtx({ x: e.clientX, y: e.clientY, actions });
  }

  // ---- Media lightbox ----
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const [lightboxMeta, setLightboxMeta] = React.useState<{ employee: string; phase: string; ts: string } | null>(null);
  const [lightboxVideo, setLightboxVideo] = React.useState(false);

  // ---- job files (images / videos / documents) ----
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = React.useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !job) return;
    if (f.size > 50 * 1024 * 1024) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return toast({ title: "File too large", description: "Maximum size is 50 MB.", variant: "destructive" });
    }
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("prefix", `job-files/${job.id}`);
      fd.append("kind", "job-file");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      const kind = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "file";
      const added = await addJobFileAction({
        jobId: job.id, name: f.name, url: json.url, contentType: f.type || null, sizeBytes: f.size, kind,
      });
      if (added.error) throw new Error(added.error);
      setFiles((arr) => [added.data as JobFile, ...arr]);
      toast({ title: "File added", description: f.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeFile(file: JobFile) {
    const res = await removeJobFileAction(file.id);
    if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    setFiles((arr) => arr.filter((x) => x.id !== file.id));
  }

  const allMedia = React.useMemo(() => {
    const items: { url: string; employee: string; phase: "start" | "end"; ts: string; punchId: string }[] = [];
    for (const p of punches) {
      const emp = allEmployees.find((e) => e.id === p.employee_id);
      const name = emp?.name ?? "Unknown";
      if (p.started_photo_url) items.push({ url: p.started_photo_url, employee: name, phase: "start", ts: p.started_at, punchId: p.id });
      if (p.ended_photo_url) items.push({ url: p.ended_photo_url, employee: name, phase: "end", ts: p.ended_at ?? p.started_at, punchId: p.id });
    }
    return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [punches, allEmployees]);

  // ---- Items & Costs ----
  const [itemDialog, setItemDialog] = React.useState(false);
  const [pickItem, setPickItem] = React.useState("");
  const [pickQty, setPickQty] = React.useState(1);
  const [costDialog, setCostDialog] = React.useState(false);
  const [costForm, setCostForm] = React.useState({ label: "", cost: 0, charge: 0 });
  const [deleteItemTarget, setDeleteItemTarget] = React.useState<JobItem | null>(null);
  const [deleteCostTarget, setDeleteCostTarget] = React.useState<JobCost | null>(null);

  async function addItem() {
    if (!job) return;
    const cat = catalog.find((c) => c.id === pickItem);
    if (!cat) return;
    const res = await addJobItemAction({ jobId: job.id, itemId: cat.id, name: cat.name, qty: pickQty, cost: cat.cost, charge: cat.charge, currentStock: cat.stock });
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setJobItems((it) => [...it, res.data as JobItem]);
    setItemDialog(false); setPickItem(""); setPickQty(1);
    toast({ title: "Item added" });
  }
  async function removeItem(it: JobItem) {
    const res = await removeJobItemAction(it.id);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setJobItems((arr) => arr.filter((x) => x.id !== it.id));
  }
  async function toggleItemExcluded(it: JobItem) {
    const next = !it.excluded;
    await setJobItemExcluded(it.id, next);
    setJobItems((arr) => arr.map((x) => x.id === it.id ? { ...x, excluded: next } : x));
  }
  async function addCost() {
    if (!job || !costForm.label.trim()) return;
    const res = await addJobCostAction({ jobId: job.id, label: costForm.label.trim(), cost: costForm.cost, charge: costForm.charge });
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    setCosts((c) => [...c, res.data as JobCost]);
    setCostDialog(false); setCostForm({ label: "", cost: 0, charge: 0 });
  }
  async function removeCost(c: JobCost) {
    await removeJobCostAction(c.id);
    setCosts((arr) => arr.filter((x) => x.id !== c.id));
  }
  async function toggleCostExcluded(c: JobCost) {
    const next = !c.excluded;
    await setJobCostExcluded(c.id, next);
    setCosts((arr) => arr.map((x) => x.id === c.id ? { ...x, excluded: next } : x));
  }

  // ---- Billing / Invoices ----
  const [excludeStoreTime, setExcludeStoreTime] = React.useState(true);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const rate = job?.billing_rate ?? company?.default_rate ?? 0;
  const taxRate = company?.tax_rate ?? 0;
  // Live preview uses the same billing engine the server uses to generate the
  // invoice, so the previewed total and the issued total always match.
  const billing = React.useMemo(() => {
    if (!job) return { lines: [] as LineItem[], subtotal: 0, tax: 0, total: 0 };
    const employeeName: Record<string, string> = {};
    for (const e of allEmployees) employeeName[e.id] = e.name;
    return computeBilling({
      billingMode: job.billing_mode,
      rate: Number(rate),
      taxRate: Number(taxRate),
      excludeStoreTime,
      items: jobItems.map((it) => ({ name: it.name, qty: it.qty, charge: it.charge, excluded: it.excluded })),
      costs: costs.map((c) => ({ label: c.label, charge: c.charge, excluded: c.excluded })),
      punches: punches.map((p) => ({ employee_id: p.employee_id, kind: p.kind, started_at: p.started_at, ended_at: p.ended_at })),
      employeeName,
      nowMs: now,
    });
  }, [job, jobItems, costs, punches, allEmployees, excludeStoreTime, rate, taxRate, now]);

  const [generating, setGenerating] = React.useState(false);
  async function generateInvoice() {
    if (!job) return;
    setGenerating(true);
    // The server recomputes the authoritative line items/totals; we just tell it
    // the one preference that isn't stored on the job.
    const res = await generateInvoiceAction({ jobId: job.id, excludeStoreTime });
    setGenerating(false);
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    const d = res.data as any;
    setInvoices((inv) => [{
      id: d.id, number: d.number, status: d.status, total: Number(d.total), created_at: d.created_at,
      subtotal: Number(d.subtotal), tax: Number(d.tax), line_items: d.line_items ?? [],
      customer_name: job.customer_name, customer_email: job.customer_email,
      notes: null, due_date: null, file_name: null,
    }, ...inv]);
    toast({ title: "Invoice generated", description: d.number, variant: "success" });
  }

  // Invoice view/edit
  const [viewingInv, setViewingInv] = React.useState<FullInvoice | null>(null);
  const [editingInv, setEditingInv] = React.useState(false);
  const [invDraft, setInvDraft] = React.useState<FullInvoice | null>(null);
  const [savingInv, setSavingInv] = React.useState(false);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [sendTarget, setSendTarget] = React.useState<FullInvoice | null>(null);
  const [useOverride, setUseOverride] = React.useState(false);
  const [overrideEmail, setOverrideEmail] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const DEFAULT_INCLUDE = { logo: true, jobDetails: true, paymentInstructions: true, dueDate: true, prices: true };
  const [includeOptions, setIncludeOptions] = React.useState({ ...DEFAULT_INCLUDE });

  function recalcInvDraft(items: LineItem[]) {
    if (!invDraft) return;
    const sub = items.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const tRate = invDraft.subtotal > 0 ? invDraft.tax / invDraft.subtotal : 0;
    setInvDraft({ ...invDraft, line_items: items, subtotal: sub, tax: sub * tRate, total: sub + sub * tRate });
  }

  async function saveInvEdit() {
    if (!invDraft) return;
    setSavingInv(true);
    const { updateInvoice } = await import("@/app/(app)/invoices/actions");
    const res = await updateInvoice(invDraft.id, {
      customer_name: invDraft.customer_name, customer_email: invDraft.customer_email,
      line_items: invDraft.line_items, notes: invDraft.notes, due_date: invDraft.due_date,
      subtotal: invDraft.subtotal, tax: invDraft.tax, total: invDraft.total,
    });
    setSavingInv(false);
    if (res.error) return toast({ title: "Save failed", description: res.error, variant: "destructive" });
    // Use the server-recomputed amounts so totals match the DB exactly.
    const updated = { ...viewingInv!, ...invDraft, ...((res as any).data ?? {}) };
    setInvoices((all) => all.map((i) => i.id === updated.id ? updated : i));
    setViewingInv(updated); setEditingInv(false); setInvDraft(null);
    toast({ title: "Invoice updated" });
  }

  async function doSend() {
    if (!sendTarget) return;
    const email = useOverride ? overrideEmail : sendTarget.customer_email;
    if (!email) return toast({ title: "No email address", variant: "destructive" });
    setIsSending(true);
    const res = await fetch("/api/invoices/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: sendTarget.id, overrideEmail: useOverride ? overrideEmail : undefined, includeOptions }),
    });
    const json = await res.json();
    setIsSending(false);
    if (!res.ok) return toast({ title: "Send failed", description: json.error, variant: "destructive" });
    if (!useOverride) setInvoices((all) => all.map((i) => i.id === sendTarget.id ? { ...i, status: "sent" } : i));
    setSendDialogOpen(false);
    toast({ title: "Invoice sent" });
  }

  async function deleteInvoice(inv: FullInvoice) {
    const { deleteInvoice: del } = await import("@/app/(app)/invoices/actions");
    const res = await del(inv.id);
    if (res && (res as any).error) return toast({ title: "Delete failed", description: (res as any).error, variant: "destructive" });
    setInvoices((all) => all.filter((i) => i.id !== inv.id));
    toast({ title: "Invoice deleted" });
  }

  async function toggleInvoicePaid(inv: FullInvoice) {
    const mod = await import("@/app/(app)/invoices/actions");
    const res = inv.status === "paid" ? await mod.markInvoiceUnpaid(inv.id) : await mod.markInvoicePaid(inv.id);
    if (res && (res as any).error) return toast({ title: "Failed", description: (res as any).error, variant: "destructive" });
    const next = inv.status === "paid" ? "sent" : "paid";
    setInvoices((all) => all.map((i) => (i.id === inv.id ? { ...i, status: next } : i)));
    toast({ title: next === "paid" ? "Invoice marked paid" : "Invoice marked unpaid", variant: "success" });
  }

  const statusVariant: Record<string, "secondary" | "default" | "success"> = {
    scheduled: "secondary", active: "default", complete: "success",
  };
  const invStatusVariant: Record<string, "secondary" | "success" | "default"> = {
    draft: "secondary", sent: "default", paid: "success",
  };

  return (
    <>
      {loading && <JobDetailSkeleton />}

      {!loading && job && (
        <div className="flex flex-col gap-4 lg:h-full">
          {/* ========== HEADER ========== */}
          <div>
            <NextLink href="/jobs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              ← Back to jobs
            </NextLink>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
              <Badge variant={statusVariant[job.status] ?? "secondary"} className="capitalize">{job.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {job.place ?? "No location"} · {fmtDate(job.scheduled_date)}{job.customer_name ? ` · ${job.customer_name}` : ""}
            </p>
          </div>

          {/* ========== OVERVIEW ========== */}
          <Card className="shrink-0 overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 py-3">
              <CardTitle className="text-sm font-semibold">Overview</CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {perms.jobEdit && !editing && (
                  <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4 mr-1.5" />Edit</Button>
                )}
                {perms.jobEdit && job.status !== "complete" && !editing && (
                  <Button variant="outline" size="sm" onClick={handleMarkComplete}>
                    <CheckCircle className="h-4 w-4 mr-1.5" />Mark complete
                  </Button>
                )}
                {perms.jobDelete && !editing && (
                  <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
                    <Trash2 className="h-4 w-4 mr-1.5" />Delete
                  </Button>
                )}
                {editing && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button size="sm" onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {editing ? (
                  <>
                    <div className="space-y-2"><Label>Title</Label><Input value={editForm.title ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>Place / address</Label><Input value={editForm.place ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, place: e.target.value || null }))} /></div>
                    <div className="space-y-2"><Label>Customer name</Label><Input value={editForm.customer_name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, customer_name: e.target.value || null }))} /></div>
                    <div className="space-y-2"><Label>Customer email</Label><Input type="email" value={editForm.customer_email ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, customer_email: e.target.value || null }))} /></div>
                    <div className="space-y-2"><Label>Scheduled date</Label><Input type="date" value={editForm.scheduled_date ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, scheduled_date: e.target.value || null }))} /></div>
                    <div className="space-y-2"><Label>Estimate ($)</Label><Input type="number" value={editForm.estimate ?? 0} onChange={(e) => setEditForm((f) => ({ ...f, estimate: +e.target.value }))} /></div>
                    <div className="space-y-2">
                      <Label>Billing mode</Label>
                      <Select value={editForm.billing_mode ?? "itemized"} onValueChange={(v) => setEditForm((f) => ({ ...f, billing_mode: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="itemized">Itemized</SelectItem>
                          <SelectItem value="hourly">Per hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Billing rate ($/hr)</Label><Input type="number" value={editForm.billing_rate ?? ""} placeholder="Company default" onChange={(e) => setEditForm((f) => ({ ...f, billing_rate: e.target.value ? +e.target.value : null }))} /></div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={editForm.status ?? "scheduled"} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="complete">Complete</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Title</p><p className="font-medium mt-1">{job.title}</p></div>
                    <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Location</p><p className="mt-1">{job.place ?? "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Customer</p><p className="mt-1">{job.customer_name ?? "—"}{job.customer_email && <span className="block text-sm text-muted-foreground">{job.customer_email}</span>}</p></div>
                    <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Scheduled</p><p className="mt-1">{fmtDate(job.scheduled_date)}</p></div>
                    <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Estimate</p><p className="mt-1">{fmtMoney(job.estimate)}</p></div>
                    <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Billing</p><p className="mt-1 capitalize">{job.billing_mode}{job.billing_rate ? ` · ${fmtMoney(job.billing_rate)}/hr` : ""}</p></div>
                    <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p><Badge variant={statusVariant[job.status] ?? "secondary"} className="capitalize mt-1">{job.status}</Badge></div>
                    <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Created</p><p className="mt-1 text-sm">{fmtDate(job.created_at)}</p></div>
                  </>
                )}
              </div>

              <Separator />

              {/* Crew inline list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Crew</p>
                  {perms.jobEdit && editing && availableToAdd.length > 0 && (
                    <Select onValueChange={addCrew}>
                      <SelectTrigger className="w-48 h-8"><SelectValue placeholder="Add crew member" /></SelectTrigger>
                      <SelectContent>
                        {availableToAdd.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {crew.length === 0 && <p className="text-sm text-muted-foreground">No crew assigned.</p>}
                <div className="space-y-1">
                  {crew.map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div>
                        <span className="text-sm font-medium">{e.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{e.role_title ?? "Crew"}</span>
                      </div>
                      {perms.jobEdit && editing && (
                        <Button size="sm" variant="ghost" onClick={() => removeCrew(e.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ========== SIDE-BY-SIDE SECTIONS ========== */}
          <div className="lg:min-h-0 lg:flex-1">
            <ResizablePanels
              storageKey="job-detail-panels"
              className="lg:h-full"
              panelClassName="lg:h-full lg:overflow-y-auto lg:pr-1"
            >
              {/* ========== CLOCKING ========== */}
              {perms.punchesView && (
                <div className="space-y-4">
                  <SectionBox
                    title="Clocking"
                    count={punches.length}
                    contentClassName="p-0"
                    actions={perms.punchesManage ? (
                      <Button size="sm" onClick={openAddPunch}><Plus className="h-4 w-4 mr-1.5" />Add log</Button>
                    ) : undefined}
                  >
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Start</TableHead>
                            <TableHead>End</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Photos</TableHead>
                            <TableHead>Note</TableHead>
                            <TableHead className="w-8"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {punches.map((p) => {
                            const emp = allEmployees.find((e) => e.id === p.employee_id);
                            const durMs = p.ended_at
                              ? new Date(p.ended_at).getTime() - new Date(p.started_at).getTime()
                              : now - new Date(p.started_at).getTime();
                            return (
                              <TableRow
                                key={p.id}
                                className="cursor-pointer"
                                onClick={() => perms.punchesManage && openEditPunch(p)}
                                onContextMenu={(e) => perms.punchesManage && punchRowMenu(e, p)}
                              >
                                <TableCell className="font-medium">
                                  {emp?.name ?? "—"}
                                  {p.edited_at && <span className="ml-1.5 text-[10px] text-amber-500">edited</span>}
                                </TableCell>
                                <TableCell className="text-xs">{new Date(p.started_at).toLocaleString()}</TableCell>
                                <TableCell className="text-xs">
                                  {p.ended_at ? new Date(p.ended_at).toLocaleString() : <span className="text-emerald-600 italic">— open —</span>}
                                </TableCell>
                                <TableCell className="text-xs">{fmtDur(durMs)}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Badge variant={p.started_photo_url ? "default" : "secondary"} className="text-[10px] px-1 py-0">S</Badge>
                                    <Badge variant={p.ended_photo_url ? "default" : "secondary"} className="text-[10px] px-1 py-0">E</Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">{p.note ?? "—"}</TableCell>
                                <TableCell>
                                  {perms.punchesManage && (
                                    <button
                                      type="button"
                                      className="p-1 rounded hover:bg-accent"
                                      onClick={(e) => { e.stopPropagation(); punchRowMenu(e, p); }}
                                    >
                                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                    </button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {punches.length === 0 && (
                            <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No punch logs yet.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </SectionBox>
                </div>
              )}

              {/* ========== ITEMS & COSTS ========== */}
              {perms.jobEdit && (
                <div className="space-y-4">
                  <SectionBox
                    title="Items used"
                    count={jobItems.length}
                    contentClassName="p-0"
                    actions={<Button size="sm" onClick={() => setItemDialog(true)}><Plus className="h-4 w-4 mr-1" />Add item</Button>}
                  >
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Charge ea.</TableHead>
                            <TableHead>Line total</TableHead><TableHead>On invoice</TableHead><TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {jobItems.map((it) => (
                            <TableRow key={it.id}>
                              <TableCell className="font-medium">{it.name}</TableCell>
                              <TableCell>{it.qty}</TableCell>
                              <TableCell>{fmtMoney(it.charge)}</TableCell>
                              <TableCell>{fmtMoney(it.charge * it.qty)}</TableCell>
                              <TableCell><Checkbox checked={!it.excluded} onCheckedChange={() => toggleItemExcluded(it)} /></TableCell>
                              <TableCell className="text-right">
                                {perms.jobEdit && <Button size="sm" variant="ghost" onClick={() => setDeleteItemTarget(it)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                              </TableCell>
                            </TableRow>
                          ))}
                          {jobItems.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No items added.</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </div>
                  </SectionBox>

                  <SectionBox
                    title="One-time costs"
                    count={costs.length}
                    contentClassName="p-0"
                    actions={<Button size="sm" onClick={() => setCostDialog(true)}><Plus className="h-4 w-4 mr-1" />Add cost</Button>}
                  >
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Label</TableHead><TableHead>Charge</TableHead>
                            <TableHead>On invoice</TableHead><TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {costs.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium">{c.label}</TableCell>
                              <TableCell>{fmtMoney(c.charge)}</TableCell>
                              <TableCell><Checkbox checked={!c.excluded} onCheckedChange={() => toggleCostExcluded(c)} /></TableCell>
                              <TableCell className="text-right">
                                {perms.jobEdit && <Button size="sm" variant="ghost" onClick={() => setDeleteCostTarget(c)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                              </TableCell>
                            </TableRow>
                          ))}
                          {costs.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No one-time costs.</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </div>
                  </SectionBox>
                </div>
              )}

              {/* ========== INVOICES ========== */}
              {perms.invoicesView && (
                <div className="space-y-4">
                  <SectionBox
                    title="Invoices"
                    count={invoices.length}
                    actions={perms.invoicesCreate ? (
                      <Button size="sm" onClick={generateInvoice} disabled={generating || billing.lines.length === 0}>
                        <FileText className="h-4 w-4 mr-1.5" />{generating ? "Generating…" : "Generate"}
                      </Button>
                    ) : undefined}
                  >
                    {job.billing_mode === "hourly" && (
                      <div className="mb-3 flex items-center gap-2 text-sm">
                        <Switch checked={excludeStoreTime} onCheckedChange={setExcludeStoreTime} id="exc-store" />
                        <Label htmlFor="exc-store">Exclude store-run time</Label>
                      </div>
                    )}

                    {/* Billing summary */}
                    <div className="rounded-md border">
                      <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                        Current billing — {job.billing_mode === "itemized" ? "Itemized" : "Per hour"}
                      </p>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableBody>
                            {billing.lines.map((l, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-sm">{l.name}{l.qty ? ` × ${l.qty}` : ""}</TableCell>
                                <TableCell className="text-right text-sm">{fmtMoney(l.amount)}</TableCell>
                              </TableRow>
                            ))}
                            {billing.lines.length === 0 && <TableRow><TableCell colSpan={2} className="py-4 text-center text-sm text-muted-foreground">Nothing to bill yet.</TableCell></TableRow>}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="space-y-1 border-t p-3 text-sm">
                        <div className="ml-auto w-48 space-y-1">
                          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmtMoney(billing.subtotal)}</span></div>
                          <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{fmtMoney(billing.tax)}</span></div>
                          <div className="flex justify-between font-semibold"><span>Total</span><span>{fmtMoney(billing.total)}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* Invoice list */}
                    {invoices.length > 0 && (
                      <div className="mt-4 overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Number</TableHead><TableHead>Status</TableHead>
                              <TableHead>Total</TableHead><TableHead>Created</TableHead><TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoices.map((inv) => (
                              <TableRow key={inv.id} className="cursor-pointer" onClick={() => { setViewingInv(inv); setEditingInv(false); setInvDraft(null); }}>
                                <TableCell className="font-medium">{inv.number}</TableCell>
                                <TableCell><Badge variant={invStatusVariant[inv.status] ?? "secondary"} className="capitalize">{inv.status}</Badge></TableCell>
                                <TableCell>{fmtMoney(inv.total)}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{fmtDate(inv.created_at)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Button size="sm" variant="ghost" onClick={() => downloadPdf(inv, company)} title="Download PDF"><Download className="h-3.5 w-3.5" /></Button>
                                    {perms.invoicesSend && <Button size="sm" variant="ghost" onClick={() => { setSendTarget(inv); setUseOverride(false); setOverrideEmail(""); setIncludeOptions({ ...DEFAULT_INCLUDE }); setSendDialogOpen(true); }} title="Send"><Send className="h-3.5 w-3.5" /></Button>}
                                    {perms.invoicesEdit && inv.status === "sent" && <Button size="sm" variant="ghost" onClick={() => toggleInvoicePaid(inv)} title="Mark paid"><DollarSign className="h-3.5 w-3.5 text-emerald-600" /></Button>}
                                    {perms.invoicesEdit && inv.status === "paid" && <Button size="sm" variant="ghost" onClick={() => toggleInvoicePaid(inv)} title="Mark unpaid"><Undo2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>}
                                    {inv.status === "draft" && <Button size="sm" variant="ghost" onClick={() => deleteInvoice(inv)} title="Delete"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </SectionBox>
                </div>
              )}

              {/* ========== NOTES + FILES & MEDIA ========== */}
              {(perms.notesView || perms.mediaView) && (
                <div className="space-y-4">
                  {perms.notesView && (
                    <SectionBox
                      title="Notes"
                      actions={jobNotes?.updated_at ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />Edited {new Date(jobNotes.updated_at).toLocaleDateString()}
                        </span>
                      ) : undefined}
                    >
                      <NotesEditor
                        jobId={job.id}
                        initialHtml={jobNotes?.body_html ?? ""}
                        canEdit={perms.notesEdit}
                        updatedAt={jobNotes?.updated_at ?? null}
                        updatedBy={jobNotes?.updated_by ?? null}
                      />
                    </SectionBox>
                  )}
                  {perms.mediaView && (
                    <SectionBox
                      title="Files & Media"
                      count={files.length + allMedia.length}
                      actions={perms.mediaManage ? (
                        <>
                          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={handleFileUpload} />
                          <Button size="sm" disabled={uploadingFile} onClick={() => fileInputRef.current?.click()}>
                            <Upload className="h-4 w-4 mr-1.5" />{uploadingFile ? "Uploading…" : "Add file"}
                          </Button>
                        </>
                      ) : undefined}
                    >
                      {files.length === 0 && allMedia.length === 0 && (
                        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
                          <Paperclip className="h-8 w-8" />
                          <p>No files yet.{perms.mediaManage ? " Use “Add file” to upload." : ""}</p>
                        </div>
                      )}

                      {files.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {files.map((f) => (
                            <div key={f.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                              {f.kind === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={f.url}
                                  alt={f.name}
                                  className="h-full w-full cursor-pointer object-cover transition-transform group-hover:scale-105"
                                  onClick={() => { setLightboxMeta(null); setLightboxVideo(false); setLightboxUrl(f.url); }}
                                />
                              ) : f.kind === "video" ? (
                                <div
                                  className="relative h-full w-full cursor-pointer"
                                  onClick={() => { setLightboxMeta(null); setLightboxVideo(true); setLightboxUrl(f.url); }}
                                >
                                  <video src={f.url} className="h-full w-full object-cover" muted preload="metadata" />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <Play className="h-8 w-8 text-white" />
                                  </div>
                                </div>
                              ) : (
                                <a href={f.url} target="_blank" rel="noreferrer" className="flex h-full w-full flex-col items-center justify-center gap-2 p-2 text-center">
                                  <Paperclip className="h-7 w-7 text-muted-foreground" />
                                  <Download className="h-4 w-4 text-muted-foreground" />
                                </a>
                              )}
                              <div className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/70 p-1.5 text-[10px] text-white">
                                {f.name}
                              </div>
                              {perms.mediaManage && (
                                <button
                                  type="button"
                                  onClick={() => removeFile(f)}
                                  className="absolute right-1 top-1 rounded bg-black/50 p-1 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                                  title="Delete file"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {allMedia.length > 0 && (
                        <>
                          <p className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            <Camera className="h-3.5 w-3.5" />Punch photos
                          </p>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {allMedia.map((m, i) => (
                              <div
                                key={i}
                                className="group relative aspect-square cursor-pointer overflow-hidden rounded-md border bg-muted"
                                onClick={() => { setLightboxVideo(false); setLightboxUrl(m.url); setLightboxMeta({ employee: m.employee, phase: m.phase, ts: m.ts }); }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={m.url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 p-2 text-[10px] text-white">
                                  <div className="truncate font-medium">{m.employee}</div>
                                  <div className="capitalize opacity-80">{m.phase} photo · {new Date(m.ts).toLocaleDateString()}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </SectionBox>
                  )}
                </div>
              )}
            </ResizablePanels>
          </div>
        </div>
      )}

      {/* ========== PUNCH LOG SLIDE-OVER (nested) ========== */}
      <SlideOver
        open={punchSlideOpen}
        onClose={() => setPunchSlideOpen(false)}
        layer="nested"
        width="md"
        title={editingPunch ? "Edit punch log" : "Add punch log"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPunchSlideOpen(false)}>Cancel</Button>
            <Button onClick={savePunch} disabled={punchBusy || !punchForm.employeeId || !punchForm.startedAt}>
              {punchBusy ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={punchForm.employeeId} onValueChange={(v) => setPunchForm((f) => ({ ...f, employeeId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {allEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}{crew.some((c) => c.id === e.id) ? "" : " (not on crew)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={punchForm.kind} onValueChange={(v) => setPunchForm((f) => ({ ...f, kind: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="site">Site</SelectItem>
                <SelectItem value="store">Store run</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Start time <span className="text-destructive">*</span></Label>
            <Input type="datetime-local" value={punchForm.startedAt} onChange={(e) => setPunchForm((f) => ({ ...f, startedAt: e.target.value }))} className="min-h-[44px]" />
          </div>
          <div className="space-y-2">
            <Label>End time <span className="text-muted-foreground text-xs">(leave blank = open)</span></Label>
            <Input type="datetime-local" value={punchForm.endedAt} onChange={(e) => setPunchForm((f) => ({ ...f, endedAt: e.target.value }))} className="min-h-[44px]" />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea value={punchForm.note} onChange={(e) => setPunchForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional note…" rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Start photo</Label>
            {punchForm.startedPhotoUrl && !startPhotoFile && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={punchForm.startedPhotoUrl} alt="start" className="h-16 w-16 rounded object-cover border" />
                <Button size="sm" variant="ghost" onClick={() => setPunchForm((f) => ({ ...f, startedPhotoUrl: "" }))}>Remove</Button>
              </div>
            )}
            <Input type="file" accept="image/*" capture="environment" onChange={(e) => setStartPhotoFile(e.target.files?.[0] ?? null)} className="min-h-[44px]" />
          </div>
          <div className="space-y-2">
            <Label>End photo</Label>
            {punchForm.endedPhotoUrl && !endPhotoFile && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={punchForm.endedPhotoUrl} alt="end" className="h-16 w-16 rounded object-cover border" />
                <Button size="sm" variant="ghost" onClick={() => setPunchForm((f) => ({ ...f, endedPhotoUrl: "" }))}>Remove</Button>
              </div>
            )}
            <Input type="file" accept="image/*" capture="environment" onChange={(e) => setEndPhotoFile(e.target.files?.[0] ?? null)} className="min-h-[44px]" />
          </div>

          {editingPunch && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-2 dark:bg-amber-900/20 dark:border-amber-800">
              <p className="text-xs font-medium flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />Deletion rules
              </p>
              {editingPunch.ended_at ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This punch is closed. You must remove the end time before deleting the whole log.
                </p>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This punch is open. You can delete the entire log from the context menu.
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400"
                onClick={() => { setPunchSlideOpen(false); promptDeletePunch(editingPunch); }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {editingPunch.ended_at ? "Remove end time" : "Delete punch log"}
              </Button>
            </div>
          )}
        </div>
      </SlideOver>

      {/* ========== INVOICE VIEW/EDIT SLIDE-OVER (nested) ========== */}
      <SlideOver
        open={!!viewingInv}
        onClose={() => { setViewingInv(null); setEditingInv(false); setInvDraft(null); }}
        layer="nested"
        width="lg"
        title={viewingInv ? <span className="flex items-center gap-2">{viewingInv.number}<Badge variant={invStatusVariant[viewingInv.status] ?? "secondary"} className="capitalize text-xs">{viewingInv.status}</Badge></span> : undefined}
        footer={
          editingInv ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditingInv(false); setInvDraft(null); }}>Cancel</Button>
              <Button onClick={saveInvEdit} disabled={savingInv}>{savingInv ? "Saving…" : "Save changes"}</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {perms.invoicesEdit && viewingInv && (
                <Button variant="outline" size="sm" onClick={() => { setInvDraft({ ...viewingInv!, line_items: viewingInv!.line_items?.map(l => ({ ...l })) ?? [] }); setEditingInv(true); }}>
                  <Pencil className="h-4 w-4 mr-1.5" />Edit
                </Button>
              )}
              {viewingInv && <Button variant="outline" size="sm" onClick={() => downloadPdf(viewingInv, company)}><Download className="h-4 w-4 mr-1.5" />Download PDF</Button>}
              {perms.invoicesSend && viewingInv && (
                <Button size="sm" onClick={() => { const i = viewingInv!; setViewingInv(null); setSendTarget(i); setUseOverride(false); setOverrideEmail(""); setIncludeOptions({ ...DEFAULT_INCLUDE }); setSendDialogOpen(true); }}>
                  <Send className="h-4 w-4 mr-1.5" />Send
                </Button>
              )}
            </div>
          )
        }
      >
        {(() => {
          const inv = editingInv && invDraft ? invDraft : viewingInv;
          if (!inv) return null;
          return (
            <div className="space-y-6">
              <div className="flex items-start justify-between rounded-lg border bg-muted/30 p-4">
                <div>
                  {company?.logo_url && <img src={company.logo_url} alt="logo" className="max-h-10 max-w-[160px] object-contain mb-2" />}
                  <p className="font-semibold text-sm">{company?.invoice_from || company?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Invoice</p>
                  <p className="font-bold text-xl">{inv.number}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Issued {fmtDate(inv.created_at)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Bill To</p>
                  {editingInv ? (
                    <div className="space-y-2 pt-1">
                      <Input value={invDraft?.customer_name ?? ""} onChange={(e) => setInvDraft(d => d ? { ...d, customer_name: e.target.value } : d)} placeholder="Customer name" className="min-h-[44px]" />
                      <Input type="email" value={invDraft?.customer_email ?? ""} onChange={(e) => setInvDraft(d => d ? { ...d, customer_email: e.target.value } : d)} placeholder="Email" className="min-h-[44px]" />
                    </div>
                  ) : (
                    <div className="pt-1">
                      <p className="font-semibold">{inv.customer_name || "—"}</p>
                      {inv.customer_email && <p className="text-sm text-muted-foreground">{inv.customer_email}</p>}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Due Date</p>
                  {editingInv ? (
                    <Input type="date" value={invDraft?.due_date ?? ""} onChange={(e) => setInvDraft(d => d ? { ...d, due_date: e.target.value || null } : d)} className="mt-1 min-h-[44px]" />
                  ) : (
                    <p className="text-sm pt-1">{inv.due_date ? fmtDate(inv.due_date) : "Not set"}</p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Line Items</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right w-16">Qty</TableHead>
                        <TableHead className="text-right w-28">Amount</TableHead>
                        {editingInv && <TableHead className="w-10" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(editingInv ? invDraft?.line_items : inv.line_items ?? [])?.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            {editingInv ? (
                              <Input value={l.name} onChange={(e) => { const items = [...(invDraft?.line_items ?? [])]; items[i] = { ...items[i], name: e.target.value }; recalcInvDraft(items); }} className="h-9" placeholder="Description" />
                            ) : l.name}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingInv ? (
                              <Input type="number" value={l.qty ?? ""} onChange={(e) => { const items = [...(invDraft?.line_items ?? [])]; items[i] = { ...items[i], qty: e.target.value ? Number(e.target.value) : undefined }; recalcInvDraft(items); }} className="h-9 w-16 text-right" />
                            ) : (l.qty ?? "—")}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingInv ? (
                              <Input type="number" step="0.01" value={l.amount} onChange={(e) => { const items = [...(invDraft?.line_items ?? [])]; items[i] = { ...items[i], amount: Number(e.target.value) }; recalcInvDraft(items); }} className="h-9 w-24 text-right" />
                            ) : fmtMoney(l.amount)}
                          </TableCell>
                          {editingInv && (
                            <TableCell>
                              <Button size="sm" variant="ghost" onClick={() => recalcInvDraft((invDraft?.line_items ?? []).filter((_, idx) => idx !== i))}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {editingInv && (
                  <Button size="sm" variant="outline" onClick={() => recalcInvDraft([...(invDraft?.line_items ?? []), { name: "", amount: 0 }])}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add line
                  </Button>
                )}
              </div>

              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmtMoney(inv.subtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{fmtMoney(inv.tax)}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-base"><span>Total</span><span>{fmtMoney(inv.total)}</span></div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</p>
                {editingInv ? (
                  <Textarea value={invDraft?.notes ?? ""} onChange={(e) => setInvDraft(d => d ? { ...d, notes: e.target.value } : d)} placeholder="Payment instructions…" rows={3} />
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{inv.notes || "No notes"}</p>
                )}
              </div>
            </div>
          );
        })()}
      </SlideOver>

      {/* ========== INVOICE SEND SLIDE-OVER ========== */}
      <SlideOver
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
        layer="nested"
        width="sm"
        title={`Send ${sendTarget?.number ?? "Invoice"}`}
        description="Choose recipient and what to include."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button onClick={doSend} disabled={isSending}><Mail className="h-4 w-4 mr-1.5" />{isSending ? "Sending…" : "Send Invoice"}</Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium">Send to</p>
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50">
              <input type="radio" name="invSendTarget" checked={!useOverride} onChange={() => setUseOverride(false)} className="mt-0.5 accent-primary" />
              <div><p className="text-sm font-medium">Customer on file</p><p className="text-xs text-muted-foreground">{sendTarget?.customer_email ?? "No email on file"}</p></div>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50">
              <input type="radio" name="invSendTarget" checked={useOverride} onChange={() => setUseOverride(true)} className="mt-0.5 accent-primary" />
              <div><p className="text-sm font-medium">Different address</p><p className="text-xs text-muted-foreground">Won&apos;t update the invoice</p></div>
            </label>
            {useOverride && <Input type="email" placeholder="Enter email" value={overrideEmail} onChange={(e) => setOverrideEmail(e.target.value)} autoFocus className="min-h-[44px]" />}
          </div>
          <Separator />
          <div className="space-y-3">
            <p className="text-sm font-medium">What to include</p>
            {([
              { key: "logo" as const, label: "Company logo & branding" },
              { key: "jobDetails" as const, label: "Job details" },
              { key: "dueDate" as const, label: "Due date" },
              { key: "prices" as const, label: "Prices & totals" },
              { key: "paymentInstructions" as const, label: "Notes / payment instructions" },
            ]).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50">
                <Checkbox checked={includeOptions[key]} onCheckedChange={(v) => setIncludeOptions(o => ({ ...o, [key]: !!v }))} />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </SlideOver>

      {/* ========== CONTEXT MENUS / CONFIRMS ========== */}
      <RowContextMenu state={punchCtx} onClose={() => setPunchCtx(null)} />

      <DeleteConfirm
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        itemLabel={`job "${job?.title}"`}
        requireTyped={job?.title}
      />

      <DeleteConfirm
        open={deletePunchConfirmOpen}
        onClose={() => setDeletePunchConfirmOpen(false)}
        onConfirm={confirmDeletePunch}
        itemLabel={
          deletePunchMode === "end"
            ? "the end time of this punch (will reopen it)"
            : "this entire punch log"
        }
      />

      {/* ========== MEDIA LIGHTBOX ========== */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80" onClick={() => { setLightboxUrl(null); setLightboxVideo(false); }}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => { setLightboxUrl(null); setLightboxVideo(false); }}>
            <X className="h-6 w-6" />
          </button>
          <div className="flex flex-col items-center gap-4 p-4 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            {lightboxVideo ? (
              <video src={lightboxUrl} controls autoPlay className="max-h-[70vh] w-auto rounded-lg shadow-2xl" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lightboxUrl} alt="" className="max-h-[70vh] w-auto rounded-lg shadow-2xl object-contain" />
            )}
            {lightboxMeta && (
              <div className="text-white text-sm text-center">
                <p className="font-medium">{lightboxMeta.employee}</p>
                <p className="text-white/70 capitalize">{lightboxMeta.phase} photo · {new Date(lightboxMeta.ts).toLocaleString()}</p>
              </div>
            )}
            <a href={lightboxUrl} download target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="text-white border-white/40 hover:bg-white/10">
                <Download className="h-4 w-4 mr-1.5" />Download
              </Button>
            </a>
          </div>
        </div>
      )}

      {/* ========== ITEM / COST SLIDE-OVERS ========== */}
      <SlideOver
        open={itemDialog}
        onClose={() => setItemDialog(false)}
        title="Add item to job"
        layer="nested"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setItemDialog(false)}>Cancel</Button>
            <Button onClick={addItem} disabled={!pickItem}>Add</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Item</Label>
            <Select value={pickItem} onValueChange={setPickItem}>
              <SelectTrigger><SelectValue placeholder="Choose from catalog" /></SelectTrigger>
              <SelectContent>
                {catalog.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className={c.stock === 0 ? "text-destructive" : ""}>{c.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.stock === 0 ? "⚠ out of stock" : `${c.stock} in stock`}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pickItem && catalog.find((c) => c.id === pickItem)?.stock === 0 && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> This item is out of stock. Adding it will set stock below zero.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input type="number" min={1} value={pickQty} onChange={(e) => setPickQty(Math.max(1, +e.target.value))} className="min-h-[44px]" />
          </div>
        </div>
      </SlideOver>

      <SlideOver
        open={costDialog}
        onClose={() => setCostDialog(false)}
        title="Add one-time cost"
        layer="nested"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCostDialog(false)}>Cancel</Button>
            <Button onClick={addCost}>Add cost</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2"><Label>Label</Label><Input value={costForm.label} onChange={(e) => setCostForm({ ...costForm, label: e.target.value })} placeholder="e.g. Dumpster rental" className="min-h-[44px]" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Cost (paid)</Label><Input type="number" value={costForm.cost} onChange={(e) => setCostForm({ ...costForm, cost: +e.target.value })} className="min-h-[44px]" /></div>
            <div className="space-y-2"><Label>Charge (customer)</Label><Input type="number" value={costForm.charge} onChange={(e) => setCostForm({ ...costForm, charge: +e.target.value })} className="min-h-[44px]" /></div>
          </div>
        </div>
      </SlideOver>

      {/* Item delete confirmation */}
      <DeleteConfirm
        open={!!deleteItemTarget}
        onClose={() => setDeleteItemTarget(null)}
        onConfirm={async () => { if (deleteItemTarget) await removeItem(deleteItemTarget); setDeleteItemTarget(null); }}
        itemLabel={`item "${deleteItemTarget?.name}"`}
      />

      {/* Cost delete confirmation */}
      <DeleteConfirm
        open={!!deleteCostTarget}
        onClose={() => setDeleteCostTarget(null)}
        onConfirm={async () => { if (deleteCostTarget) await removeCost(deleteCostTarget); setDeleteCostTarget(null); }}
        itemLabel={`cost "${deleteCostTarget?.label}"`}
      />
    </>
  );
}
