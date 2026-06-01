import type { ComponentType } from "react";
import {
  LayoutDashboard, Hammer, Boxes, Users, Settings as SettingsIcon,
  ScrollText, Shield, FileText, UserCog,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  perm: string; // empty = always visible
  children?: NavItem[];
}

// Primary navigation, shared by the desktop sidebar and the mobile drawer.
// Admin is an expandable group (admin-only).
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  {
    href: "/admin", label: "Admin", icon: Shield, perm: "admin.view",
    children: [
      { href: "/admin/users",    label: "Users",        icon: UserCog,     perm: "admin.users" },
      { href: "/admin/roles",    label: "Roles",        icon: Shield,      perm: "admin.roles" },
      { href: "/admin/settings", label: "App settings", icon: SettingsIcon, perm: "admin.company" },
      { href: "/logs",           label: "Activity log", icon: ScrollText,  perm: "logs.view" },
    ],
  },
  { href: "/jobs",      label: "Jobs",      icon: Hammer,   perm: "jobs.view" },
  { href: "/invoices",  label: "Invoices",  icon: FileText, perm: "invoices.view" },
  { href: "/inventory", label: "Inventory", icon: Boxes,    perm: "inventory.view" },
  { href: "/employees", label: "Employees", icon: Users,    perm: "employees.view" },
];
