import { describe, it, expect } from "vitest";
import { toolsForUser } from "../tools";
import type { CurrentUser } from "@/lib/auth";

function userWith(perms: Record<string, boolean>, isSuperadmin = false): CurrentUser {
  return {
    id: "u1",
    clerkUserId: "ck1",
    email: "u@example.com",
    fullName: "Test User",
    companyId: "c1",
    roleId: "r1",
    isSuperadmin,
    isActive: true,
    theme: "system",
    permissions: perms,
  };
}

describe("toolsForUser", () => {
  it("always exposes the permission-free tools (context + geocoding)", () => {
    const names = toolsForUser(userWith({})).map((t) => t.name);
    expect(names).toContain("get_context");
    expect(names).toContain("geocode_place");
  });

  it("gates find_nearby_jobs behind jobs.view", () => {
    expect(toolsForUser(userWith({})).map((t) => t.name)).not.toContain("find_nearby_jobs");
    expect(toolsForUser(userWith({ "jobs.view": true })).map((t) => t.name)).toContain("find_nearby_jobs");
  });

  it("only exposes data tools the user is permitted to use", () => {
    const names = toolsForUser(userWith({ "logs.view": true })).map((t) => t.name);
    expect(names).toContain("search_activity_log"); // logs.view granted
    expect(names).not.toContain("list_jobs"); // jobs.view not granted
    expect(names).not.toContain("list_invoices");
    expect(names).not.toContain("list_employees");
  });

  it("maps each area permission to its tool", () => {
    const names = toolsForUser(
      userWith({
        "jobs.view": true,
        "invoices.view": true,
        "inventory.view": true,
        "employees.view": true,
        "punches.view": true,
      })
    ).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_jobs",
        "get_job_details",
        "list_invoices",
        "list_inventory",
        "list_employees",
        "time_summary",
      ])
    );
    expect(names).not.toContain("search_activity_log"); // logs.view not granted
  });

  it("gives a superadmin every tool", () => {
    const names = toolsForUser(userWith({}, true)).map((t) => t.name);
    expect(names).toContain("search_activity_log");
    expect(names).toContain("list_jobs");
    expect(names).toContain("time_summary");
  });
});
