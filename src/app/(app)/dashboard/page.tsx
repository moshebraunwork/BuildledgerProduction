import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { Hammer, Boxes, Users, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { DashboardCharts } from "./dashboard-charts";

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  const cid = user.companyId;

  const [
    jobsCount, activeCount, completeCount, scheduledCount,
    items, employeesCount, invoices,
    revenueByMonth, recentActivity, topEmployees, lowStockItems, openPunches,
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
  ]);

  const lowStock = (items as any[]).filter((i) => i.stock <= i.low_threshold).length;
  // Collected = paid; Outstanding = issued but not yet paid (sent). Drafts are
  // not counted as revenue.
  const collected = (invoices as any[]).filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
  const outstanding = (invoices as any[]).filter((i) => i.status === "sent").reduce((s, i) => s + Number(i.total || 0), 0);

  const stats = [
    { label: "Revenue (collected)", value: fmtMoney(collected), sub: `${fmtMoney(outstanding)} outstanding`, icon: DollarSign },
    { label: "Active jobs", value: String(activeCount[0].n), sub: `${jobsCount[0].n} total`, icon: Hammer },
    { label: "Employees", value: String(employeesCount[0].n), sub: `${openPunches[0].n} clocked in now`, icon: Users },
    { label: "Low stock", value: String(lowStock), sub: `${(items as any[]).length} items total`, icon: Boxes },
  ];

  const jobStatusData = [
    { name: "Scheduled", value: scheduledCount[0].n },
    { name: "Active", value: activeCount[0].n },
    { name: "Complete", value: completeCount[0].n },
  ];

  const revenueData = (revenueByMonth as any[]).map((r) => ({ month: r.month, revenue: Math.round(r.revenue || 0) }));

  return (
    <>
      <PageHeader title="Dashboard" description="Your operation at a glance." />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{s.value}</div>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </CardContent>
            </Card>
          );
        })}
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
