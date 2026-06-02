import { describe, it, expect } from "vitest";
import { can, allTruePermissions, ALL_PERMISSIONS } from "../permissions";

describe("can()", () => {
  it("grants superadmin everything regardless of the map", () => {
    expect(can(true, null, "anything.at.all")).toBe(true);
    expect(can(true, {}, "invoices.send")).toBe(true);
  });

  it("grants a non-superadmin only what their map allows", () => {
    const perms = { "jobs.view": true, "jobs.edit": false };
    expect(can(false, perms, "jobs.view")).toBe(true);
    expect(can(false, perms, "jobs.edit")).toBe(false);
    expect(can(false, perms, "jobs.delete")).toBe(false); // absent key
  });

  it("denies when the permission map is missing", () => {
    expect(can(false, null, "dashboard.view")).toBe(false);
    expect(can(false, undefined, "dashboard.view")).toBe(false);
  });
});

describe("allTruePermissions()", () => {
  it("covers every catalog permission and nothing is false", () => {
    const map = allTruePermissions();
    expect(Object.keys(map).sort()).toEqual([...ALL_PERMISSIONS].sort());
    expect(Object.values(map).every(Boolean)).toBe(true);
  });
});
