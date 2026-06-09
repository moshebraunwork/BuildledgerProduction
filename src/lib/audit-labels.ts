// ============================================================================
// Shared, client-safe helpers for presenting audit-log entries. Kept free of
// server imports so both the Activity Log page and the per-user log panel can
// render actions, devices, and detail the same way.
// ============================================================================

// Maps an action key to a plain-English sentence. Anything not listed falls back
// to a de-dotted version of the key, so new actions still read sensibly.
export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "profile.update": "Updated their profile",
  "job.create": "Created a job",
  "job.update": "Edited a job",
  "job.delete": "Deleted a job",
  "job.status": "Changed job status",
  "job_item.add": "Added an item to a job",
  "job_item.remove": "Removed an item from a job",
  "job_cost.add": "Added a cost to a job",
  "job_cost.remove": "Removed a cost from a job",
  "job_notes.save": "Updated job notes",
  "crew.add": "Assigned crew to a job",
  "crew.remove": "Removed crew from a job",
  "media.upload": "Uploaded a file to a job",
  "media.delete": "Deleted a job file",
  "invoice.create": "Generated an invoice",
  "invoice.edit": "Edited an invoice",
  "invoice.delete": "Deleted an invoice",
  "invoice.send": "Sent an invoice",
  "invoice.paid": "Marked an invoice paid",
  "invoice.unpaid": "Reversed an invoice payment",
  "employee.create": "Added an employee",
  "employee.update": "Edited an employee",
  "employee.delete": "Removed an employee",
  "employee.invite": "Invited an employee to log in",
  "employee.invite_resend": "Resent an employee invite",
  "item.create": "Added an inventory item",
  "item.update": "Edited an inventory item",
  "item.delete": "Deleted an inventory item",
  "punch.in": "Clocked in a worker",
  "punch.out": "Clocked out a worker",
  "punch.self_in": "Clocked in",
  "punch.self_out": "Clocked out",
  "punch.store_out": "Left for the store",
  "punch.store_return": "Returned from the store",
  "punch.admin_create": "Added a time entry",
  "punch.admin_edit": "Edited a time entry",
  "punch.admin_remove_end": "Removed a time entry's end",
  "punch.admin_delete": "Deleted a time entry",
  "user.set_role": "Assigned a role",
  "user.set_access": "Changed a user's access",
  "user.enable": "Enabled a user",
  "user.disable": "Disabled a user",
  "user.update_name": "Renamed a user",
  "user.update_email": "Changed a user's email",
  "user.invite": "Invited a user",
  "user.reinvite": "Re-invited a user",
  "role.create": "Created a role",
  "role.update": "Edited a role",
  "role.delete": "Deleted a role",
  "company.update": "Updated company settings",
};

// Human-friendly category names for the filter dropdown (keyed by action prefix).
export const CATEGORY_LABELS: Record<string, string> = {
  auth: "Sign in / out",
  job: "Jobs",
  job_item: "Job items",
  job_cost: "Job costs",
  job_notes: "Job notes",
  crew: "Crew",
  media: "Files",
  invoice: "Invoices",
  employee: "Employees",
  item: "Inventory",
  punch: "Time clock",
  user: "Users",
  role: "Roles",
  company: "Company",
  profile: "Profile",
};

export function humanizeAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

export function titleizeKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Best-effort, dependency-free parse of a user-agent string into "Browser · OS".
export function describeDevice(ua: string | null | undefined): string | null {
  if (!ua) return null;
  let browser = "Unknown browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return os ? `${browser} · ${os}` : browser;
}

// A compact one-line summary of a detail object — for tight spaces like the
// per-user log panel. Renders a "changes" map as "field old→new" and other
// keys as "key: value".
export function summarizeDetail(detail: Record<string, any> | null | undefined): string {
  if (!detail) return "";
  const parts: string[] = [];
  const { changes, added, removed, ...rest } = detail;
  if (changes && typeof changes === "object") {
    for (const [k, v] of Object.entries(changes as Record<string, { from: any; to: any }>)) {
      parts.push(`${titleizeKey(k)} ${fmtVal(v?.from)}→${fmtVal(v?.to)}`);
    }
  }
  if (Array.isArray(added) && added.length) parts.push(`+${added.join(", ")}`);
  if (Array.isArray(removed) && removed.length) parts.push(`-${removed.join(", ")}`);
  for (const [k, v] of Object.entries(rest)) parts.push(`${titleizeKey(k)}: ${fmtVal(v)}`);
  return parts.join(" · ");
}
