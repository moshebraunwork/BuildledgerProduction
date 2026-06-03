import { requirePermission } from "@/lib/guard";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { LogsManager } from "./logs-manager";

export default async function LogsPage() {
  const user = await requirePermission("logs.view");

  // The actor_name / ip_address / user_agent columns arrive with migration 0011.
  // Read the rich shape, but fall back to the original columns (defaulting the
  // new fields to null) so the page still renders on a database that hasn't been
  // migrated yet rather than throwing a "something went wrong" error.
  let logs: any[];
  try {
    logs = (await sql`
      select id, actor_id, actor_email, actor_name, action, entity, entity_id::text as entity_id,
             coalesce(detail, '{}'::jsonb) as detail,
             ip_address, user_agent, created_at
      from public.audit_log
      where company_id = ${user.companyId}
      order by created_at desc
      limit 1000
    `) as any[];
  } catch {
    logs = (await sql`
      select id, actor_id, actor_email, null as actor_name, action, entity, entity_id::text as entity_id,
             coalesce(detail, '{}'::jsonb) as detail,
             null as ip_address, null as user_agent, created_at
      from public.audit_log
      where company_id = ${user.companyId}
      order by created_at desc
      limit 1000
    `) as any[];
  }

  return (
    <>
      <PageHeader title="Activity log" description="Every sign-in, sign-out, and change made in the system — newest first." />
      <LogsManager initialLogs={logs as any[]} />
    </>
  );
}
