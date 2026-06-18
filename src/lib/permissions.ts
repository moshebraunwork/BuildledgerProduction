// ============================================================================
// PERMISSION CATALOG
// The single source of truth for every permission in the system.
// The admin's "Roles" screen renders checkboxes from this list, grouped by
// module. Adding a new permission anywhere = add it here once.
// ============================================================================

export type Permission = string;

export interface PermissionDef {
  key: Permission;
  label: string;
}

export interface PermissionGroup {
  module: string;
  perms: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: "Dashboard",
    perms: [{ key: "dashboard.view", label: "View dashboard" }],
  },
  {
    module: "Jobs",
    perms: [
      { key: "jobs.view", label: "View jobs" },
      { key: "jobs.edit", label: "Create & edit jobs" },
      { key: "jobs.delete", label: "Delete jobs" },
      { key: "jobs.statuses", label: "Add & manage job statuses (board columns)" },
      { key: "punches.view", label: "View clocking / punch logs" },
      { key: "punches.manage", label: "Punch in/out & manage punch logs" },
      { key: "media.view", label: "View job media / photos" },
      { key: "media.manage", label: "Upload & delete job media" },
    ],
  },
  {
    module: "Inventory",
    perms: [
      { key: "inventory.view", label: "View inventory" },
      { key: "inventory.edit", label: "Add & edit items" },
      { key: "inventory.delete", label: "Delete items" },
    ],
  },
  {
    module: "Employees",
    perms: [
      { key: "employees.view", label: "View employees" },
      { key: "employees.edit", label: "Add & edit employees" },
      { key: "employees.delete", label: "Delete employees" },
    ],
  },
  {
    module: "Invoices",
    perms: [
      { key: "invoices.view", label: "View invoices" },
      { key: "invoices.create", label: "Generate invoices" },
      { key: "invoices.edit", label: "Edit invoices" },
      { key: "invoices.send", label: "Send invoices by email" },
    ],
  },
  {
    module: "Administration",
    perms: [
      { key: "admin.view", label: "Access admin area" },
      { key: "admin.users", label: "Manage users" },
      { key: "admin.roles", label: "Manage roles & permissions" },
      { key: "admin.company", label: "Edit company settings" },
    ],
  },
  {
    module: "Activity Log",
    perms: [{ key: "logs.view", label: "View activity log" }],
  },
  {
    module: "Map",
    perms: [
      { key: "map.view", label: "View the map" },
      { key: "map.employees", label: "See employee locations on the map" },
    ],
  },
  {
    module: "Ask AI",
    perms: [{ key: "ai.use", label: "Use the Ask AI assistant" }],
  },
];

// Flat list of all permission keys
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.perms.map((p) => p.key)
);

export type PermissionMap = Record<string, boolean>;

// A user's effective permissions. Superadmin always returns true for everything.
export function can(
  isSuperadmin: boolean,
  perms: PermissionMap | null | undefined,
  key: Permission
): boolean {
  if (isSuperadmin) return true;
  return !!perms?.[key];
}

// Build an all-true map (used for the Administrator system role)
export function allTruePermissions(): PermissionMap {
  return Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, true]));
}
