import { describe, expect, it } from "vitest";
import type { VoucherFact } from "./report-data";
import { buildTransactionsReport, type TransactionsOptions } from "./transactions-report";

const fact = (over: Partial<VoucherFact>): VoucherFact => ({
  id: "v",
  voucherNumber: "",
  company: "Achisomoch",
  type: "PPV",
  receivedFrom: "Cohen",
  reference: "(none)",
  status: "unposted",
  notes: "",
  amount: 10,
  quantity: 1,
  value: 10,
  received: "2026-10-05",
  posted: null,
  deposited: null,
  batchId: null,
  batchDate: null,
  depositId: null,
  batchRef: "",
  sentTo: "",
  depositRef: "",
  bank: "",
  ...over,
});

const facts: VoucherFact[] = [
  fact({ id: "1", voucherNumber: "101", amount: 10, quantity: 3, value: 30, receivedFrom: "Cohen", status: "posted", batchId: "b1", batchRef: "B-101", batchDate: "2026-10-10", posted: "2026-10-10", sentTo: "Achisomoch" }),
  fact({ id: "2", voucherNumber: "102", amount: 10, quantity: 2, value: 20, receivedFrom: "Levy", status: "deposited", batchId: "b1", batchRef: "B-101", batchDate: "2026-10-10", posted: "2026-10-10", depositId: "d1", deposited: "2026-10-20", bank: "Main" }),
  fact({ id: "3", voucherNumber: "103", company: "Tzedaka", type: "ACC", amount: 18, quantity: 1, value: 18, receivedFrom: "Cohen" }),
  fact({ id: "4", amount: 5, quantity: 1, value: 5, status: "cancelled" }),
  fact({ id: "5", amount: 50, quantity: 1, value: 50, received: "2026-09-01" }),
];

const base: TransactionsOptions = {
  groupBy: "none",
  detail: "received",
  status: "all",
  basis: "received",
  period: { from: "2026-10-01", to: "2026-10-31" },
  companies: [],
  includeCancelled: false,
};
const run = (o: Partial<TransactionsOptions>) => buildTransactionsReport(facts, { ...base, ...o });
const col = (t: ReturnType<typeof run>, header: string) => t.columns.findIndex((c) => c.header === header);

describe("transactions report", () => {
  it("filters by period and leaves out cancelled vouchers", () => {
    const t = run({});
    expect(t.rows).toHaveLength(3);
    expect(t.totals![col(t, "Qty")]).toBe(6);
    expect(t.totals![col(t, "Value")]).toBe(68);
  });

  it("includes cancelled vouchers when asked", () => {
    expect(run({ includeCancelled: true }).rows).toHaveLength(4);
  });

  it("shows one line per physical voucher for 'each voucher'", () => {
    const t = run({ detail: "each" });
    expect(t.rows).toHaveLength(6);
    expect(t.totals![col(t, "Amount")]).toBe(68);
    expect(t.totals![0]).toContain("6 vouchers");
  });

  it("adds up by company, type and amount for 'as banked'", () => {
    const t = run({ detail: "banked" });
    expect(t.rows).toEqual([
      ["Achisomoch", "PPV", 10, 5, 50],
      ["Tzedaka", "ACC", 18, 1, 18],
    ]);
  });

  it("groups with a heading and subtotal per group", () => {
    const t = run({ groupBy: "receivedFrom" });
    const labels = t.rows.map((r) => r[0]);
    expect(labels).toContain("Cohen");
    expect(labels).toContain("Total Cohen");
    expect(t.columns.some((c) => c.header === "Received from")).toBe(false);
    const cohenTotal = t.rows.find((r) => r[0] === "Total Cohen")!;
    expect(cohenTotal[col(t, "Value")]).toBe(48);
  });

  it("gives one line per group for 'totals only'", () => {
    const t = run({ groupBy: "company", detail: "total" });
    expect(t.rows).toEqual([
      ["Achisomoch", 2, 5, 50],
      ["Tzedaka", 1, 1, 18],
    ]);
    expect(t.totals!.slice(1)).toEqual([3, 6, 68]);
  });

  it("puts vouchers not yet posted or banked in their own group, last", () => {
    const byBatch = run({ groupBy: "batch", detail: "total" });
    expect(byBatch.rows.map((r) => r[0])).toEqual(["Batch B-101 · 10 Oct 2026 · to Achisomoch", "Not posted"]);
    const byDeposit = run({ groupBy: "deposit", detail: "total" });
    expect(byDeposit.rows.at(-1)![0]).toBe("Not banked");
  });

  it("uses the banked date when asked", () => {
    const t = run({ basis: "deposited", period: { from: "2026-10-15", to: "2026-10-31" } });
    expect(t.rows).toHaveLength(1);
  });

  it("filters by status and company", () => {
    expect(run({ status: "posted" }).rows).toHaveLength(1);
    expect(run({ companies: ["Tzedaka"] }).rows).toHaveLength(1);
  });
});
