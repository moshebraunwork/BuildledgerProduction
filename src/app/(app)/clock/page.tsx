import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ClockClient } from "./clock-client";

// Self-service clock-in. Available to every signed-in user (no permission gate)
// — the action layer resolves the caller's own employee record. When opened
// from a specific job (`?jobId=`), that job is locked in and can't be changed.
export default async function ClockPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { jobId } = await searchParams;
  let lockedJobId: string | null = null;
  if (jobId) {
    const rows = await sql`select id from public.jobs where id = ${jobId} and company_id = ${user.companyId} limit 1`;
    if (rows.length) lockedJobId = jobId;
  }

  return <ClockClient lockedJobId={lockedJobId} userEmail={user.email} />;
}
