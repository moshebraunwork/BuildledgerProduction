import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, fmtDate, cn } from "@/lib/utils";
import { Hammer, Boxes, Users, DollarSign, TrendingUp, AlertTriangle, ArrowUpRight, ArrowDownRight, CalendarClock, Gauge } from "lucide-react";
import { DashboardCharts } from "./dashboard-charts";
import { Sparkline } from "@/components/sparkline";
import { MobileRedirect } from "@/components/mobile-redirect";

const statusTone: Record<string, string> = {
  scheduled: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  complete: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  const cid = user.companyId;

  const [
    jobsCount, activeCount, completeCount, scheduledCount,
    items, employeesCount, invoices,
    revenueByMonth, recentActivity, topEmployees, lowStockItems, openPunches,
    jobsByMonth, scheduledToday,
  ] = await Promise.all([
    sql`select count(*)::int as n from public.jobs where company_id = ${cid}`,
    sql`select count(*)::int as n from public.jobs where company_id = ${cid} and status = 'active'`,
    sql`select count(*)::int as n from public.jobs where company_id = ${cid} and status = 'complete'`,
    sql`select count(*)::int as n from public.jobs where company_id = ${cid} and status = 'scheduled'`,
    sql`select stock, low_threshold, name from public.items where company_id = ${cid}`,
    sql`select count(*)::int as n from public.employees where company_id = ${cid}`,
    sql`select total, status, created_at from public.invoices where company_id = ${cid}`,
    // revenue grouped by month (last 6 months); issued invoices only (no drafts)
    sql`
      select to_char(date_trunc('month', created_at), 'Mon') as month,
             date_trunc('month', created_at) as m,
             sum(total)::float as revenue
      from public.invoices
      where company_id = ${cid} and status in ('sent', 'paid')
        and created_at > now() - interval '6 months'
      group by 1, 2 order by 2
    `,
    // recent activity feed
    sql`
      select action, actor_email, entity, created_at
      from public.audit_log where company_id = ${cid}
      order by created_at desc limit 8
    `,
    // top employees by total logged hours
    sql`
      select e.name,
             coalesce(sum(extract(epoch from (coalesce(p.ended_at, now()) - p.started_at))) / 3600, 0)::float as hours
      from public.employees e
      left join public.punches p on p.employee_id = e.id
      where e.company_id = ${cid}
      group by e.id, e.name
      having coalesce(sum(extract(epoch from (coalesce(p.ended_at, now()) - p.started_at))), 0) > 0
      order by hours desc limit 5
    `,
    sql`select name, stock, low_threshold from public.items where company_id = ${cid} and stock <= low_threshold order by stock asc limit 5`,
    sql`select count(*)::int as n from public.punches where company_id = ${cid} and ended_at is null`,
    // jobs created per month (last 6) — drives the "Open jobs" KPI sparkline
    sql`
      select date_trunc('month', created_at) as m, count(*)::int as n
      from public.jobs
      where company_id = ${cid} and created_at > now() - interval '6 months'
      group by 1 order by 1
    `,
    // today's scheduled jobs
    sql`
      select id::text as id, title, customer_name, place, status
      from public.jobs
      where company_id = ${cid} and scheduled_date = current_date
      order by title limit 6
    `,
  ]);

  const lowStock = (items as any[]).filter((i) => i.stock <= i.low_threshold).length;
  // Collected = paid; Outstanding = issued but not yet paid (sent). Drafts are
  // not counted as revenue.
  const collected = (invoices as any[]).filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
  const outstanding = (invoices as any[]).filter((i) => i.status === "sent").reduce((s, i) => s + Number(i.total || 0), 0);

  // Revenue series (last 6 months, paid+sent) for the revenue KPI sparkline + delta.
  const revSeries = (revenueByMonth as any[]).map((r) => Math.round(r.revenue || 0));
  const jobsSeries = (jobsByMonth as any[]).map((r) => Number(r.n || 0));
  const pctDelta = (series: number[]): number | null => {
    if (series.length < 2) return null;
    const prev = series[series.length - 2];
    const curr = series[series.length - 1];
    if (!prev) return curr > 0 ? 100 : null;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  };
  const revDelta = pctDelta(revSeries);
  const jobsDelta = pctDelta(jobsSeries);

  const stats = [
    {
      label: "Revenue (collected)", value: fmtMoney(collected), sub: `${fmtMoney(outstanding)} outstanding`,
      icon: DollarSign, tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", accent: "bg-emerald-500",
      series: revSeries, spark: "#10b981", delta: revDelta,
    },
    {
      label: "Open jobs", value: String(activeCount[0].n + scheduledCount[0].n), sub: `${jobsCount[0].n} total · ${activeCount[0].n} active`,
      icon: Hammer, tint: "bg-blue-500/10 text-blue-600 dark:text-blue-400", accent: "bg-blue-500",
      series: jobsSeries, spark: "#3b82f6", delta: jobsDelta,
    },
    {
      label: "Employees", value: String(employeesCount[0].n), sub: `${openPunches[0].n} clocked in now`,
      icon: Users, tint: "bg-violet-500/10 text-violet-600 dark:text-violet-400", accent: "bg-violet-500",
      series: [] as number[], spark: "#8b5cf6", delta: null as number | null,
    },
    {
      label: "Low stock", value: String(lowStock), sub: `${(items as any[]).length} items total`,
      icon: Boxes, tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400", accent: "bg-amber-500",
      series: [] as number[], spark: "#f59e0b", delta: null as number | null,
    },
  ];

  // Crew utilisation — top employees by hours this period, as % of a 40h week.
  const crewUtil = (topEmployees as any[]).map((e) => {
    const hours = Math.round((Number(e.hours) || 0) * 10) / 10;
    return { name: e.name as string, hours, pct: Math.min(100, Math.round((hours / 40) * 100)) };
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = (user.fullName || "").split(" ")[0];
  const todayString = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const jobStatusData = [
    { name: "Scheduled", value: scheduledCount[0].n },
    { name: "Active", value: activeCount[0].n },
    { name: "Complete", value: completeCount[0].n },
  ];

  const revenueData = (revenueByMonth as any[]).map((r) => ({ month: r.month, revenue: Math.round(r.revenue || 0) }));

  return (
    <>
      {/* The dashboard is desktop-only — phones use the jobs list as home. */}
      <MobileRedirect to="/jobs" />

      {/* Greeting header */}
      <div className="mb-6 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Good {greeting}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {todayString} · {activeCount[0].n} {activeCount[0].n === 1 ? "job" : "jobs"} active · {openPunches[0].n} clocked in
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          const up = s.delta != null && s.delta >= 0;
          return (
            <Card key={s.label} className="relative overflow-hidden transition-all hover:shadow-md md:hover:-translate-y-0.5">
              <span className={cn("absolute inset-x-0 top-0 h-1", s.accent)} />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", s.tint)}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-2">
                  <div className="font-mono text-2xl font-bold tracking-tight">{s.value}</div>
                  {s.delta != null && (
                    <span className={cn(
                      "mb-0.5 flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                      up ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    )}>
                      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(s.delta)}%
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
                {s.series.length > 1 && (
                  <div className="mt-2 -mb-1" style={{ color: s.spark }}>
                    <Sparkline data={s.series} stroke={s.spark} fill />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Today's schedule + crew utilisation */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-muted-foreground" /> Today&apos;s schedule
              <Badge variant="secondary" className="ml-1 font-mono">{(scheduledToday as any[]).length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(scheduledToday as any[]).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled for today.</p>
            ) : (
              <ul className="divide-y">
                {(scheduledToday as any[]).map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{j.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[j.customer_name, j.place].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase", statusTone[j.status] ?? "bg-muted")}>
                      {j.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-muted-foreground" /> Crew utilisation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {crewUtil.length === 0 ? (
              <p className="text-sm text-muted-foreground">No logged hours yet.</p>
            ) : (
              <div className="space-y-3">
                {crewUtil.map((c) => (
                  <div key={c.name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate">{c.name}</span>
                      <span className="font-mono text-muted-foreground">{c.hours}h · {c.pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="ws-grow h-full rounded-full bg-gradient-to-r from-primary to-violet-500"
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <DashboardCharts revenueData={revenueData} jobStatusData={jobStatusData} topEmployees={topEmployees as any[]} />

      {/* Lower row: low stock + recent activity */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Low stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(lowStockItems as any[]).length === 0 ? (
              <p className="text-sm text-muted-foreground">Everything is well stocked.</p>
            ) : (
              <ul className="space-y-2">
                {(lowStockItems as any[]).map((i, idx) => (
                  <li key={idx} className="flex items-center justify-between text-sm">
                    <span>{i.name}</span>
                    <Badge variant="warning">{i.stock} left</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-muted-foreground" /> Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(recentActivity as any[]).length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-2">
                {(recentActivity as any[]).map((a, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      <span className="font-mono text-xs text-muted-foreground">{a.action}</span>
                      {a.actor_email && <span className="text-muted-foreground"> · {a.actor_email}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
