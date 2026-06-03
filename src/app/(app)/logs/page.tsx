import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { LogsManager } from "./logs-manager";

export default async function LogsPage() {
  const user = await requirePermission("logs.view");
  const logs = await sql`
    select id, actor_id, actor_email, actor_name, action, entity, entity_id::text as entity_id,
           coalesce(detail, '{}'::jsonb) as detail,
           ip_address, user_agent, created_at
    from public.audit_log
    where company_id = ${user.companyId}
    order by created_at desc
    limit 1000
  `;

  return (
    <>
      <PageHeader title="Activity log" description="Every sign-in, sign-out, and change made in the system — newest first." />
      <LogsManager initialLogs={logs as any[]} />
    </>
  );
}
