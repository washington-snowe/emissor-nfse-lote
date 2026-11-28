import test from "node:test";
import assert from "node:assert/strict";
import { overviewMonth, overviewSummary, type OverviewNote } from "../src/lib/dashboard-overview.ts";

const note = (amount: string, date: string, status = "authorized", environment: "production" | "homologation" = "production"): OverviewNote => ({
  id: date, recipient: { legalName: "Empresa de teste" }, amount, competence_date: date, status, environment,
});

test("overview totals group every operation state and preserve cancellations", () => {
  const data = overviewSummary({ authorized: 7, preparing: 2, sending: 1, queued: 4, reconciling: 3, blocked: 2, uncertain: 1, rejected: 1, intervention: 1, cancelled: 2 }, [], "2026-11");
  assert.deepEqual(data.groups.map(group => group.value), [7, 10, 5, 2]);
  assert.equal(data.total, 24);
});

test("financial chart sums exact decimal cents and includes only authorized production notes in the period", () => {
  const data = overviewSummary({}, [
    note("999999999999999.99", "2026-11-01"),
    note("0.01", "2026-11-02"),
    note("50.20", "2026-06-01"),
    note("99.99", "2026-05-31"),
    note("99.99", "2026-12-01"),
    note("99.99", "2026-11-02", "queued"),
    note("99.99", "2026-11-02", "authorized", "homologation"),
  ], "2026-11");
  assert.equal(data.months[5].cents, 100000000000000000n);
  assert.equal(data.months[5].count, 2);
  assert.equal(data.recentCents, 100000000000005020n);
  assert.equal(data.months[0].key, "2026-06");
});

test("overview handles empty history, year boundaries, and São Paulo's month boundary", () => {
  const empty = overviewSummary({}, [], "2027-02");
  assert.equal(empty.recentCents, 0n);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.months.map(item => item.key), ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.equal(overviewMonth(new Date("2026-12-01T02:59:00Z")), "2026-11");
  assert.equal(overviewMonth(new Date("2026-12-01T03:00:00Z")), "2026-12");
});
