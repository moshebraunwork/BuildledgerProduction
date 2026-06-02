import { describe, it, expect } from "vitest";
import { round2, computeBilling, laborLines } from "../billing";

describe("round2", () => {
  it("rounds to whole cents and kills binary-float drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.555)).toBe(2.56);
  });
});

describe("computeBilling — itemized", () => {
  const base = {
    billingMode: "itemized" as const,
    rate: 0,
    excludeStoreTime: true,
    punches: [],
    employeeName: {},
    nowMs: 0,
  };

  it("multiplies charge by qty and sums with tax", () => {
    const r = computeBilling({
      ...base,
      taxRate: 0.1,
      items: [
        { name: "Pipe", qty: 3, charge: 2.5, excluded: false },
        { name: "Elbow", qty: 2, charge: 1.25, excluded: false },
      ],
      costs: [],
    });
    expect(r.subtotal).toBe(10); // 7.5 + 2.5
    expect(r.tax).toBe(1); // 10 * 0.1
    expect(r.total).toBe(11);
    expect(r.lines).toHaveLength(2);
  });

  it("skips excluded items and includes one-time costs", () => {
    const r = computeBilling({
      ...base,
      taxRate: 0,
      items: [
        { name: "Billed", qty: 1, charge: 100, excluded: false },
        { name: "Skipped", qty: 1, charge: 999, excluded: true },
      ],
      costs: [{ label: "Permit", charge: 50, excluded: false }],
    });
    expect(r.subtotal).toBe(150);
    expect(r.lines.map((l) => l.name)).toEqual(["Billed", "Permit"]);
  });
});

describe("computeBilling — hourly labor", () => {
  const hour = 3600 * 1000;
  const start = "2026-01-01T08:00:00.000Z";
  const twoHoursLater = "2026-01-01T10:00:00.000Z";

  it("bills hours * rate per employee", () => {
    const r = computeBilling({
      billingMode: "hourly",
      rate: 50,
      taxRate: 0,
      excludeStoreTime: true,
      items: [],
      costs: [],
      punches: [{ employee_id: "e1", kind: "site", started_at: start, ended_at: twoHoursLater }],
      employeeName: { e1: "Sam" },
      nowMs: Date.parse(twoHoursLater),
    });
    expect(r.subtotal).toBe(100); // 2h * 50
    expect(r.lines[0].name).toBe("Labor — Sam");
  });

  it("excludes store time when requested", () => {
    const lines = laborLines(
      [
        { employee_id: "e1", kind: "site", started_at: start, ended_at: twoHoursLater },
        { employee_id: "e1", kind: "store", started_at: start, ended_at: twoHoursLater },
      ],
      { e1: "Sam" },
      50,
      true,
      Date.parse(twoHoursLater) + hour
    );
    // Only the 2h site punch is billed; the 2h store punch is dropped.
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(100);
  });

  it("uses nowMs as the end for still-open punches", () => {
    const r = computeBilling({
      billingMode: "hourly",
      rate: 60,
      taxRate: 0,
      excludeStoreTime: false,
      items: [],
      costs: [],
      punches: [{ employee_id: "e1", kind: "site", started_at: start, ended_at: null }],
      employeeName: { e1: "Sam" },
      nowMs: Date.parse(start) + hour, // open for exactly 1 hour
    });
    expect(r.subtotal).toBe(60);
  });
});
