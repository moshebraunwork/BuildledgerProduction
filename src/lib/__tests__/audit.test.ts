import { describe, it, expect } from "vitest";
import { diff } from "../audit";

describe("diff", () => {
  it("returns only changed fields as { from, to }", () => {
    const before = { title: "Kitchen", estimate: 1000, status: "scheduled" };
    const after = { title: "Kitchen", estimate: 1500, status: "active" };
    expect(diff(before, after)).toEqual({
      estimate: { from: 1000, to: 1500 },
      status: { from: "scheduled", to: "active" },
    });
  });

  it("treats numeric strings and numbers as equal (no spurious change)", () => {
    // The DB often returns numerics as strings; 1500 and "1500.00" are the same.
    expect(diff({ total: 1500 }, { total: "1500.00" })).toEqual({});
  });

  it("treats null and undefined as equal", () => {
    expect(diff({ note: null }, { note: undefined })).toEqual({});
  });

  it("restricts comparison to the given fields", () => {
    const before = { name: "A", secret: "x" };
    const after = { name: "B", secret: "y" };
    expect(diff(before, after, ["name"])).toEqual({ name: { from: "A", to: "B" } });
  });

  it("detects a value appearing or being cleared", () => {
    expect(diff({ phone: null }, { phone: "555" }, ["phone"])).toEqual({
      phone: { from: null, to: "555" },
    });
    expect(diff({ phone: "555" }, { phone: null }, ["phone"])).toEqual({
      phone: { from: "555", to: null },
    });
  });

  it("handles null/undefined inputs without throwing", () => {
    expect(diff(null, { a: 1 }, ["a"])).toEqual({ a: { from: null, to: 1 } });
    expect(diff(undefined, undefined)).toEqual({});
  });
});
