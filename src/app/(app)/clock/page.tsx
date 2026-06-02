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
  let lockedJob: { id: string; title: string; place: string | null; require_punch_photo: boolean } | null = null;
  if (jobId) {
    const rows = await sql`
      select id, title, place, require_punch_photo
      from public.jobs where id = ${jobId} and company_id = ${user.companyId} limit 1
    `;
    if (rows.length) {
      lockedJob = {
        id: rows[0].id, title: rows[0].title, place: rows[0].place,
        require_punch_photo: rows[0].require_punch_photo,
      };
    }
  }

  return <ClockClient lockedJob={lockedJob} userEmail={user.email} />;
}
