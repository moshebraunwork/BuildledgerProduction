import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/utils";
import { Hammer, Boxes, Users, FileText } from "lucide-react";

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  const cid = user.companyId;

  const [jobsCount, activeCount, items, workersCount, invoices] = await Promise.all([
    sql`select count(*)::int as n from public.jobs where company_id = ${cid}`,
    sql`select count(*)::int as n from public.jobs where company_id = ${cid} and status = 'active'`,
    sql`select stock, low_threshold from public.items where company_id = ${cid}`,
    sql`select count(*)::int as n from public.workers where company_id = ${cid}`,
    sql`select total from public.invoices where company_id = ${cid}`,
  ]);

  const lowStock = (items as any[]).filter((i) => i.stock <= i.low_threshold).length;
  const billed = (invoices as any[]).reduce((s, i) => s + Number(i.total || 0), 0);

  const stats = [
    { label: "Total jobs", value: String(jobsCount[0].n), sub: `${activeCount[0].n} active`, icon: Hammer },
    { label: "Inventory items", value: String((items as any[]).length), sub: `${lowStock} low stock`, icon: Boxes },
    { label: "Workers", value: String(workersCount[0].n), sub: "on the crew", icon: Users },
    { label: "Invoiced", value: fmtMoney(billed), sub: `${(invoices as any[]).length} invoices`, icon: FileText },
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
