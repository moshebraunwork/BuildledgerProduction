// ============================================================================
// Billing engine — the single source of truth for turning a job's items,
// one-time costs and punch-clock time into invoice line items + totals.
//
// Used in two places so the customer-facing number and the stored invoice
// can never disagree:
//   - the job detail screen (live billing preview), and
//   - generateInvoice on the server (authoritative — recomputed from the DB,
//     never trusting amounts sent by the client).
// ============================================================================

export interface BillingLine {
  name: string;
  qty?: number;
  amount: number;
}

export interface BillingPunch {
  employee_id: string;
  kind: string; // 'site' | 'store'
  started_at: string;
  ended_at: string | null;
}

export interface BillingInput {
  billingMode: string; // 'itemized' | 'hourly'
  rate: number; // hourly labor rate
  taxRate: number; // 0..1
  excludeStoreTime: boolean; // hourly: don't bill 'store' run time
  items: { name: string; qty: number; charge: number; excluded: boolean }[];
  costs: { label: string; charge: number; excluded: boolean }[];
  punches: BillingPunch[];
  employeeName: Record<string, string>; // employee_id -> display name
  nowMs: number; // clock for still-open punches
}

export interface BillingResult {
  lines: BillingLine[];
  subtotal: number;
  tax: number;
  total: number;
}

// Round to whole cents, avoiding binary-float drift (e.g. 0.1 + 0.2).
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Billable labor lines from punches, grouped per employee. Bills EVERY employee
// who has punch time on the job — not just the assigned crew — so hours logged
// by a helper who was never added to the crew are still invoiced.
export function laborLines(
  punches: BillingPunch[],
  employeeName: Record<string, string>,
  rate: number,
  excludeStoreTime: boolean,
  nowMs: number
): BillingLine[] {
  const totalSec = new Map<string, number>();
  const storeSec = new Map<string, number>();
  // Preserve first-seen order for stable line ordering.
  const order: string[] = [];

  for (const p of punches) {
    const start = Date.parse(p.started_at);
    const end = p.ended_at ? Date.parse(p.ended_at) : nowMs;
    const sec = Math.max(0, (end - start) / 1000);
    if (!totalSec.has(p.employee_id)) order.push(p.employee_id);
    totalSec.set(p.employee_id, (totalSec.get(p.employee_id) ?? 0) + sec);
    if (p.kind === "store") storeSec.set(p.employee_id, (storeSec.get(p.employee_id) ?? 0) + sec);
  }

  const lines: BillingLine[] = [];
  for (const id of order) {
    const total = totalSec.get(id) ?? 0;
    const store = storeSec.get(id) ?? 0;
    const billSec = excludeStoreTime ? total - store : total;
    const hours = billSec / 3600;
    if (hours > 0) {
      lines.push({ name: `Labor — ${employeeName[id] ?? "Crew"}`, amount: round2(hours * rate) });
    }
  }
  return lines;
}

// Assemble the full set of invoice lines + rounded totals for a job.
export function computeBilling(input: BillingInput): BillingResult {
  const lines: BillingLine[] = [];

  if (input.billingMode === "itemized") {
    for (const it of input.items) {
      if (it.excluded) continue;
      lines.push({ name: it.name, qty: it.qty, amount: round2(it.charge * it.qty) });
    }
  } else {
    lines.push(...laborLines(input.punches, input.employeeName, input.rate, input.excludeStoreTime, input.nowMs));
  }

  // One-time costs apply in both billing modes.
  for (const c of input.costs) {
    if (c.excluded) continue;
    lines.push({ name: c.label, amount: round2(c.charge) });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const tax = round2(subtotal * input.taxRate);
  const total = round2(subtotal + tax);
  return { lines, subtotal, tax, total };
}
