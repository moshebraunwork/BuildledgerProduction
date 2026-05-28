"use client";

import * as React from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/utils";

const STATUS_COLORS = ["#94a3b8", "#3b82f6", "#10b981"]; // scheduled, active, complete

export function DashboardCharts({
  revenueData, jobStatusData, topEmployees,
}: {
  revenueData: { month: string; revenue: number }[];
  jobStatusData: { name: string; value: number }[];
  topEmployees: { name: string; hours: number }[];
}) {
  const hasRevenue = revenueData.some((d) => d.revenue > 0);
  const hasJobs = jobStatusData.some((d) => d.value > 0);
  const hasEmployees = topEmployees.length > 0;

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-3">
      {/* Revenue trend */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-base">Revenue (last 6 months)</CardTitle></CardHeader>
        <CardContent>
          {hasRevenue ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={revenueData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v) => fmtMoney(Number(v))}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty label="No invoiced revenue yet." />}
        </CardContent>
      </Card>

      {/* Jobs by status */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Jobs by status</CardTitle></CardHeader>
        <CardContent>
          {hasJobs ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={jobStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {jobStatusData.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty label="No jobs yet." />}
          {hasJobs && (
            <div className="mt-2 flex justify-center gap-4 text-xs">
              {jobStatusData.map((s, i) => (
                <span key={s.name} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[i] }} />
                  {s.name} ({s.value})
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top employees by hours */}
      <Card className="lg:col-span-3">
        <CardHeader className="pb-2"><CardTitle className="text-base">Top employees by logged hours</CardTitle></CardHeader>
        <CardContent>
          {hasEmployees ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topEmployees.map((e) => ({ name: e.name, hours: Math.round(e.hours * 10) / 10 }))} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
                <Tooltip
                  formatter={(v) => `${Number(v)} hours`}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  cursor={{ fill: "hsl(var(--accent))" }}
                />
                <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty label="No logged hours yet." />}
        </CardContent>
      </Card>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">{label}</div>;
}
