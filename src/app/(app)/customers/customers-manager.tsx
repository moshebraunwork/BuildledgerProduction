"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Contact, Mail, MapPin, Hammer, FileText } from "lucide-react";
import { fmtMoney, fmtDate, cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SlideOver } from "@/components/slide-over";
import { getCustomerDetail, type CustomerDetail } from "./actions";

export interface Customer {
  name: string;
  email: string | null;
  jobs: number;
  openJobs: number;
  ltv: number;
  lastJob: string | null;
  tag: "VIP" | "ACTIVE" | "NEW" | "PAST";
  initials: string;
  color: string;
}

const tagTone: Record<Customer["tag"], string> = {
  VIP: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  ACTIVE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  NEW: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  PAST: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function relDate(iso: string | null) {
  if (!iso) return "—";
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "1d";
  if (diff < 30) return `${diff}d`;
  if (diff < 365) return `${Math.round(diff / 30)}mo`;
  return `${Math.round(diff / 365)}y`;
}

// Compact LTV like the prototype: $24.8k, $740, etc.
function shortMoney(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return fmtMoney(n);
}

export function CustomersManager({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<Customer | null>(null);
  const [detail, setDetail] = React.useState<CustomerDetail | null>(null);
  const [loading, setLoading] = React.useState(false);

  const ql = q.trim().toLowerCase();
  const filtered = customers.filter((c) => !ql || `${c.name} ${c.email ?? ""}`.toLowerCase().includes(ql));
  const active = customers.filter((c) => c.tag === "ACTIVE" || c.tag === "VIP").length;

  async function openCustomer(c: Customer) {
    setSelected(c);
    setDetail(null);
    setLoading(true);
    const res = await getCustomerDetail(c.name);
    setDetail(res.data ?? null);
    setLoading(false);
  }

  return (
    <>
      <div className="hidden md:block">
        <PageHeader
          title="Customers"
          description={`${customers.length} ${customers.length === 1 ? "account" : "accounts"} · ${active} active`}
        />
      </div>
      <div className="mb-4 md:hidden">
        <h1 className="mb-3 text-2xl font-bold tracking-tight">Customers</h1>
      </div>

      <div className="relative mb-4 w-full md:w-72">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Contact}
          title={q ? "No matching customers" : "No customers yet"}
          description={q ? "Try a different search." : "Customers appear here automatically once jobs have a customer name."}
        />
      ) : (
        <div className="ws-fade grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => openCustomer(c)}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md md:hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-semibold text-white" style={{ background: c.color }}>{c.initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  {c.email && <p className="truncate font-mono text-[11px] text-muted-foreground">{c.email}</p>}
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold", tagTone[c.tag])}>{c.tag}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t pt-3">
                <Stat label="Jobs" value={String(c.jobs)} />
                <Stat label="LTV" value={shortMoney(c.ltv)} />
                <Stat label="Last" value={relDate(c.lastJob)} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Customer detail — contact, jobs, invoices */}
      <SlideOver
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? "Customer"}
        width="lg"
        footer={
          selected ? (
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => router.push(`/jobs?q=${encodeURIComponent(selected.name)}`)}>
                <Hammer className="h-4 w-4" /> Open in Jobs
              </Button>
              <Button onClick={() => setSelected(null)}>Done</Button>
            </div>
          ) : undefined
        }
      >
        {!selected ? null : loading && !detail ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : detail ? (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <SummaryStat label="Jobs" value={String(selected.jobs)} />
              <SummaryStat label="LTV" value={shortMoney(selected.ltv)} />
              <SummaryStat label="Open" value={String(selected.openJobs)} />
            </div>

            {/* Contact */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Contact</h3>
              {detail.emails.length === 0 && detail.addresses.length === 0 && (
                <p className="text-sm text-muted-foreground">No contact details on file.</p>
              )}
              {detail.emails.map((e) => (
                <a key={e} href={`mailto:${e}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary">
                  <Mail className="h-4 w-4 text-muted-foreground" /> {e}
                </a>
              ))}
              {detail.addresses.map((a) => (
                <p key={a} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" /> {a}
                </p>
              ))}
            </section>

            {/* Jobs */}
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Hammer className="h-4 w-4 text-muted-foreground" /> Jobs ({detail.jobs.length})</h3>
              {detail.jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {detail.jobs.map((j) => (
                    <li key={j.id}>
                      <button type="button" onClick={() => router.push(`/jobs/${j.id}`)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{j.title}</p>
                          <p className="text-xs text-muted-foreground">{j.scheduled_date ? fmtDate(j.scheduled_date) : "Unscheduled"} · {j.status}</p>
                        </div>
                        {j.estimate > 0 && <span className="shrink-0 text-sm tabular-nums">{fmtMoney(j.estimate)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Invoices */}
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-muted-foreground" /> Invoices ({detail.invoices.length})</h3>
              {detail.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {detail.invoices.map((inv) => (
                    <li key={inv.id}>
                      <button type="button" onClick={() => router.push("/invoices")} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">#{inv.number}</p>
                          <p className="text-xs capitalize text-muted-foreground">{inv.status} · {fmtDate(inv.created_at)}</p>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums">{fmtMoney(inv.total)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Could not load customer.</p>
        )}
      </SlideOver>
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold">{value}</span>
    </div>
  );
}
