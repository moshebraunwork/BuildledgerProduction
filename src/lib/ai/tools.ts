// ============================================================================
// Ask AI tools — the ONLY way the assistant can reach company data.
//
// Each tool is read-only, always scoped to the caller's company, and gated by
// the same `can()` permission the rest of the app uses. We only declare the
// tools a user is allowed to use, so the model can't even attempt to read data
// the user can't see — and every executor re-checks the permission as a second
// line of defence. There is deliberately no tool that writes, updates, or
// deletes anything.
// ============================================================================

import { sql } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";
import type { FunctionDeclaration } from "./gemini";

interface ToolDef {
  name: string;
  description: string;
  // null = available to every signed-in user (e.g. "who am I / today's date").
  permission: string | null;
  parameters: FunctionDeclaration["parameters"];
  run: (user: CurrentUser, args: Record<string, any>) => Promise<unknown>;
}

// Clamp a model-supplied limit into a sane range.
function clampLimit(v: unknown, def: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

function like(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? `%${s}%` : null;
}

function sinceDays(v: unknown, def: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

const TOOLS: ToolDef[] = [
  // --------------------------------------------------------------------------
  {
    name: "get_context",
    description:
      "Get who the current user is, their role, the company name, today's date/time, and which data areas they can access. Call this for 'who am I', date/time questions, or to ground app-help answers.",
    permission: null,
    parameters: { type: "object", properties: {} },
    async run(user) {
      const [companyRows, roleRows] = await Promise.all([
        sql`select name from public.companies where id = ${user.companyId} limit 1`,
        user.roleId
          ? sql`select name from public.roles where id = ${user.roleId} limit 1`
          : Promise.resolve([] as any[]),
      ]);
      const areas: string[] = [];
      const map: Record<string, string> = {
        "logs.view": "activity log",
        "jobs.view": "jobs",
        "invoices.view": "invoices",
        "inventory.view": "inventory",
        "employees.view": "employees",
        "punches.view": "time clock",
      };
      for (const [perm, label] of Object.entries(map)) {
        if (can(user.isSuperadmin, user.permissions, perm)) areas.push(label);
      }
      return {
        name: user.fullName,
        email: user.email,
        role: user.isSuperadmin ? "Superadmin" : roleRows[0]?.name ?? "No role",
        company: companyRows[0]?.name ?? null,
        now: new Date().toISOString(),
        accessible_areas: areas,
      };
    },
  },

  // --------------------------------------------------------------------------
  {
    name: "search_activity_log",
    description:
      "Search the activity log (audit trail) of actions taken in the system: who did what and when (logins, edits, deletes, invoices sent, etc.). Use for questions about history, recent changes, or what a specific person did.",
    permission: "logs.view",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text to match against action, person, or details." },
        category: { type: "string", description: "Action prefix to filter by, e.g. 'job', 'invoice', 'auth', 'user', 'punch'." },
        actor_email: { type: "string", description: "Limit to actions by this person's email." },
        since_days: { type: "number", description: "How many days back to look (default 30, max 365)." },
        limit: { type: "number", description: "Max rows (default 25, max 50)." },
      },
    },
    async run(user, args) {
      const q = like(args.query);
      const cat = typeof args.category === "string" && args.category.trim() ? args.category.trim() : null;
      const actor = like(args.actor_email);
      const days = sinceDays(args.since_days, 30, 365);
      const limit = clampLimit(args.limit, 25, 50);
      const rows = await sql`
        select created_at, actor_email, action, entity, entity_id::text as entity_id, detail
        from public.audit_log
        where company_id = ${user.companyId}
          and created_at >= now() - make_interval(days => ${days})
          and (${q}::text is null or action ilike ${q} or actor_email ilike ${q} or coalesce(detail::text,'') ilike ${q})
          and (${cat}::text is null or action like ${cat ? cat + ".%" : null})
          and (${actor}::text is null or actor_email ilike ${actor})
        order by created_at desc
        limit ${limit}
      `;
      return { count: rows.length, entries: rows };
    },
  },

  // --------------------------------------------------------------------------
  {
    name: "list_jobs",
    description: "List jobs with their status, customer, schedule and estimate. Use for questions about jobs, what's active/scheduled/complete, or finding a job by name.",
    permission: "jobs.view",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: scheduled, active, or complete." },
        query: { type: "string", description: "Match against job title, place, or customer." },
        limit: { type: "number", description: "Max rows (default 25, max 50)." },
      },
    },
    async run(user, args) {
      const status = ["scheduled", "active", "complete"].includes(args.status) ? args.status : null;
      const q = like(args.query);
      const limit = clampLimit(args.limit, 25, 50);
      const rows = await sql`
        select id::text as id, title, place, customer_name, status, scheduled_date, estimate, billing_mode, created_at
        from public.jobs
        where company_id = ${user.companyId}
          and (${status}::text is null or status = ${status})
          and (${q}::text is null or title ilike ${q} or place ilike ${q} or customer_name ilike ${q})
        order by created_at desc
        limit ${limit}
      `;
      return { count: rows.length, jobs: rows };
    },
  },

  // --------------------------------------------------------------------------
  {
    name: "get_job_details",
    description: "Get full detail for one job: crew, items used, one-time costs, invoices, and total logged hours. Provide job_id (preferred) or a title to look up.",
    permission: "jobs.view",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job's UUID (from list_jobs)." },
        title: { type: "string", description: "Job title to look up if you don't have the id." },
      },
    },
    async run(user, args) {
      const jobId = typeof args.job_id === "string" ? args.job_id : null;
      const title = like(args.title);
      const jobRows = await sql`
        select id::text as id, title, place, customer_name, customer_email, status,
               scheduled_date, estimate, billing_mode, billing_rate, created_at
        from public.jobs
        where company_id = ${user.companyId}
          and (
            (${jobId}::uuid is not null and id = ${jobId}::uuid)
            or (${jobId}::uuid is null and ${title}::text is not null and title ilike ${title})
          )
        order by created_at desc
        limit 1
      `;
      if (!jobRows.length) return { found: false };
      const job = jobRows[0];
      const [crew, items, costs, invoices, hours] = await Promise.all([
        sql`select e.name from public.job_employees je join public.employees e on e.id = je.employee_id where je.job_id = ${job.id}::uuid`,
        sql`select name, qty, charge, excluded from public.job_items where job_id = ${job.id}::uuid`,
        sql`select label, charge, excluded from public.job_costs where job_id = ${job.id}::uuid`,
        sql`select number, status, total, created_at from public.invoices where job_id = ${job.id}::uuid order by created_at desc`,
        sql`select coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at)) / 3600.0), 0) as hours
            from public.punches where job_id = ${job.id}::uuid`,
      ]);
      return {
        found: true,
        job,
        crew: (crew as any[]).map((c) => c.name),
        items,
        costs,
        invoices,
        total_hours: Number((hours as any[])[0]?.hours ?? 0),
      };
    },
  },

  // --------------------------------------------------------------------------
  {
    name: "list_invoices",
    description: "List invoices with number, customer, status (draft/sent/paid), total and the job they belong to. Use for billing questions, outstanding/paid amounts, etc.",
    permission: "invoices.view",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: draft, sent, or paid." },
        query: { type: "string", description: "Match against invoice number or customer." },
        limit: { type: "number", description: "Max rows (default 25, max 50)." },
      },
    },
    async run(user, args) {
      const status = ["draft", "sent", "paid"].includes(args.status) ? args.status : null;
      const q = like(args.query);
      const limit = clampLimit(args.limit, 25, 50);
      const rows = await sql`
        select i.number, i.customer_name, i.status, i.total, i.created_at, j.title as job_title
        from public.invoices i
        left join public.jobs j on j.id = i.job_id
        where i.company_id = ${user.companyId}
          and (${status}::text is null or i.status = ${status})
          and (${q}::text is null or i.number ilike ${q} or i.customer_name ilike ${q})
        order by i.created_at desc
        limit ${limit}
      `;
      return { count: rows.length, invoices: rows };
    },
  },

  // --------------------------------------------------------------------------
  {
    name: "list_inventory",
    description: "List inventory items with stock levels, cost and charge. Use for stock questions and to find low-stock items.",
    permission: "inventory.view",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Match against item name or source." },
        low_stock: { type: "boolean", description: "If true, only items at or below their low-stock threshold." },
        limit: { type: "number", description: "Max rows (default 30, max 100)." },
      },
    },
    async run(user, args) {
      const q = like(args.query);
      const low = args.low_stock === true;
      const limit = clampLimit(args.limit, 30, 100);
      const rows = await sql`
        select name, source, stock, low_threshold, cost, charge
        from public.items
        where company_id = ${user.companyId}
          and (${q}::text is null or name ilike ${q} or source ilike ${q})
          and (${low} = false or stock <= low_threshold)
        order by name
        limit ${limit}
      `;
      return { count: rows.length, items: rows };
    },
  },

  // --------------------------------------------------------------------------
  {
    name: "list_employees",
    description: "List employees with their role, pay rate, phone and invite status. Use for team/crew roster questions.",
    permission: "employees.view",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Match against employee name or role." },
        limit: { type: "number", description: "Max rows (default 30, max 100)." },
      },
    },
    async run(user, args) {
      const q = like(args.query);
      const limit = clampLimit(args.limit, 30, 100);
      const rows = await sql`
        select name, role_title, phone, pay_rate, invite_status
        from public.employees
        where company_id = ${user.companyId}
          and (${q}::text is null or name ilike ${q} or role_title ilike ${q})
        order by name
        limit ${limit}
      `;
      return { count: rows.length, employees: rows };
    },
  },

  // --------------------------------------------------------------------------
  {
    name: "time_summary",
    description: "Summarize logged time (punches) over a recent window: hours per employee plus the most recent punch records. Use for 'how many hours did X work' or job/labor-time questions.",
    permission: "punches.view",
    parameters: {
      type: "object",
      properties: {
        employee: { type: "string", description: "Limit to an employee by name." },
        job: { type: "string", description: "Limit to a job by title." },
        since_days: { type: "number", description: "Window in days (default 14, max 180)." },
      },
    },
    async run(user, args) {
      const emp = like(args.employee);
      const job = like(args.job);
      const days = sinceDays(args.since_days, 14, 180);
      const rows = await sql`
        select e.name as employee, j.title as job, p.kind, p.started_at, p.ended_at,
               round(extract(epoch from (coalesce(p.ended_at, now()) - p.started_at)) / 3600.0, 2) as hours
        from public.punches p
        join public.employees e on e.id = p.employee_id
        join public.jobs j on j.id = p.job_id
        where p.company_id = ${user.companyId}
          and p.started_at >= now() - make_interval(days => ${days})
          and (${emp}::text is null or e.name ilike ${emp})
          and (${job}::text is null or j.title ilike ${job})
        order by p.started_at desc
        limit 100
      `;
      const totals: Record<string, number> = {};
      for (const r of rows as any[]) {
        totals[r.employee] = (totals[r.employee] ?? 0) + Number(r.hours || 0);
      }
      const hoursByEmployee = Object.entries(totals)
        .map(([employee, hours]) => ({ employee, hours: Math.round(hours * 100) / 100 }))
        .sort((a, b) => b.hours - a.hours);
      return { window_days: days, hours_by_employee: hoursByEmployee, recent_punches: rows };
    },
  },
];

// The tools this user may use, as Gemini function declarations.
export function toolsForUser(user: CurrentUser): FunctionDeclaration[] {
  return TOOLS.filter((t) => t.permission === null || can(user.isSuperadmin, user.permissions, t.permission)).map(
    (t) => ({ name: t.name, description: t.description, parameters: t.parameters })
  );
}

// Execute a tool call for a user. Returns an object suitable for a Gemini
// functionResponse. Enforces the permission again and refuses unknown tools.
export async function executeTool(
  user: CurrentUser,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  if (tool.permission && !can(user.isSuperadmin, user.permissions, tool.permission)) {
    return { error: "You don't have permission to access this information." };
  }
  try {
    const result = await tool.run(user, args ?? {});
    return { result };
  } catch (e: any) {
    return { error: e?.message ? String(e.message).slice(0, 300) : "Tool failed to run." };
  }
}
