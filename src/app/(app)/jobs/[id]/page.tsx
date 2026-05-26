import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/guard";
import { createClient, getCurrentUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";
import { JobDetail } from "./job-detail";

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("jobs.view");
  const supabase = createClient();
  const jobId = params.id;

  const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).single();
  if (!job) notFound();

  const [
    { data: crew },
    { data: allWorkers },
    { data: jobItems },
    { data: catalog },
    { data: costs },
    { data: punches },
    { data: company },
    { data: existingInvoices },
  ] = await Promise.all([
    supabase.from("job_workers").select("worker_id, workers(id, name, role_title, pay_rate, require_punch_photo)").eq("job_id", jobId),
    supabase.from("workers").select("id, name, role_title, pay_rate, require_punch_photo").order("name"),
    supabase.from("job_items").select("*").eq("job_id", jobId),
    supabase.from("items").select("*").order("name"),
    supabase.from("job_costs").select("*").eq("job_id", jobId),
    supabase.from("punches").select("*").eq("job_id", jobId).order("started_at", { ascending: false }),
    supabase.from("companies").select("*").eq("id", user.companyId).single(),
    supabase.from("invoices").select("id, number, status, total, created_at").eq("job_id", jobId).order("created_at", { ascending: false }),
  ]);

  return (
    <JobDetail
      job={job}
      crew={(crew ?? []).map((c: any) => c.workers).filter(Boolean)}
      allWorkers={allWorkers ?? []}
      jobItems={jobItems ?? []}
      catalog={catalog ?? []}
      costs={costs ?? []}
      punches={punches ?? []}
      company={company}
      invoices={existingInvoices ?? []}
      companyId={user.companyId}
      perms={{
        edit: can(user.isSuperadmin, user.permissions, "jobs.edit"),
        punches: can(user.isSuperadmin, user.permissions, "punches.manage"),
        invoiceCreate: can(user.isSuperadmin, user.permissions, "invoices.create"),
        invoiceSend: can(user.isSuperadmin, user.permissions, "invoices.send"),
        isSuperadmin: user.isSuperadmin,
      }}
    />
  );
}
