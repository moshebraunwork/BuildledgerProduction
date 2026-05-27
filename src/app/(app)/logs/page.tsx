import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function LogsPage() {
  const user = await requirePermission("logs.view");
  const logs = await sql`
    select * from public.audit_log
    where company_id = ${user.companyId}
    order by created_at desc
    limit 200
  `;

  return (
    <>
      <PageHeader title="Activity log" description="Everything that happens in the system, newest first." />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs as any[]).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">{l.actor_email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-xs">{l.action}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.entity ? `${l.entity}${l.entity_id ? ` · ${String(l.entity_id).slice(0, 8)}` : ""}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {(logs as any[]).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No activity recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
