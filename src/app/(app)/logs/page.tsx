import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { LogsManager } from "./logs-manager";

export default async function LogsPage() {
  const user = await requirePermission("logs.view");
  const logs = await sql`
    select id, actor_id, actor_email, action, entity, entity_id::text as entity_id,
           coalesce(detail, '{}'::jsonb) as detail,
           created_at
    from public.audit_log
    where company_id = ${user.companyId}
    order by created_at desc
    limit 500
  `;

  return (
    <>
      <PageHeader title="Activity log" description="Everything that happens in the system, newest first." />
      <LogsManager initialLogs={logs as any[]} />
    </>
  );
}
