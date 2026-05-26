import { requirePermission } from "@/lib/guard";
import { createClient } from "@/lib/supabase-server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/utils";
import { Hammer, Boxes, Users, FileText } from "lucide-react";

export default async function DashboardPage() {
  await requirePermission("dashboard.view");
  const supabase = createClient();

  const [{ count: jobCount }, { count: activeCount }, { data: items }, { count: workerCount }, { data: invoices }] =
    await Promise.all([
      supabase.from("jobs").select("*", { count: "exact", head: true }),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("items").select("stock, low_threshold"),
      supabase.from("workers").select("*", { count: "exact", head: true }),
      supabase.from("invoices").select("total, status"),
    ]);

  const lowStock = (items ?? []).filter((i) => i.stock <= i.low_threshold).length;
  const billed = (invoices ?? []).reduce((s, i) => s + Number(i.total || 0), 0);

  const stats = [
    { label: "Total jobs", value: String(jobCount ?? 0), sub: `${activeCount ?? 0} active`, icon: Hammer },
    { label: "Inventory items", value: String(items?.length ?? 0), sub: `${lowStock} low stock`, icon: Boxes },
    { label: "Workers", value: String(workerCount ?? 0), sub: "on the crew", icon: Users },
    { label: "Invoiced", value: fmtMoney(billed), sub: `${invoices?.length ?? 0} invoices`, icon: FileText },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="At-a-glance overview of your operation." />
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
    </>
  );
}
