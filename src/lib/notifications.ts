// ============================================================================
// NOTIFICATION CATALOG
// Notifications are derived from the activity log (audit_log). Each "type" maps
// a set of audit action prefixes to a user-facing category that admins can
// toggle per role (on the Roles screen). Missing pref key = enabled (opt-out).
// ============================================================================

export interface NotificationType {
  key: string;
  label: string;
  /** Audit action prefixes that belong to this category (e.g. "job."). */
  prefixes: string[];
}

export const NOTIFICATION_TYPES: NotificationType[] = [
  { key: "jobs", label: "Jobs — created, status changes, completed", prefixes: ["job."] },
  { key: "invoices", label: "Invoices — created, sent, paid", prefixes: ["invoice."] },
  { key: "inventory", label: "Inventory — items & stock changes", prefixes: ["item.", "inventory."] },
  { key: "team", label: "Team — employees & invites", prefixes: ["employee.", "user.", "profile."] },
  { key: "time", label: "Time clock — punch in/out", prefixes: ["punch."] },
  { key: "admin", label: "Admin — roles, company & settings", prefixes: ["role.", "company.", "settings."] },
];

export type NotificationPrefs = Record<string, boolean>;

// The audit-action prefixes a role (or superadmin) should be notified about.
export function enabledPrefixes(prefs: NotificationPrefs | null | undefined, isSuperadmin: boolean): string[] {
  return NOTIFICATION_TYPES
    .filter((t) => isSuperadmin || prefs?.[t.key] !== false) // opt-out model
    .flatMap((t) => t.prefixes);
}

// Friendly one-liner for an audit action key.
const ACTION_PHRASES: Record<string, string> = {
  "job.create": "created a job",
  "job.update": "updated a job",
  "job.status": "changed a job's status",
  "job.delete": "deleted a job",
  "invoice.create": "created an invoice",
  "invoice.send": "sent an invoice",
  "invoice.paid": "marked an invoice paid",
  "invoice.unpaid": "reopened an invoice",
  "invoice.delete": "deleted an invoice",
  "item.create": "added an inventory item",
  "item.update": "updated an inventory item",
  "item.delete": "deleted an inventory item",
  "employee.create": "added a team member",
  "employee.invite": "sent an invite",
  "employee.update": "updated a team member",
  "punch.in": "clocked in",
  "punch.out": "clocked out",
  "role.create": "created a role",
  "role.update": "updated a role",
  "role.delete": "deleted a role",
  "company.update": "updated company settings",
};

export function prettyAction(action: string): string {
  if (ACTION_PHRASES[action]) return ACTION_PHRASES[action];
  return action.replace(/[._]/g, " ");
}
