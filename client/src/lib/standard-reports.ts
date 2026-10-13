import type { BatchWithRelations, DepositWithRelations } from "@shared/schema";
import {
  describePeriod,
  inPeriod,
  pivot,
  toDay,
  type Period,
  type ReportTable,
  type VoucherFact,
} from "./report-data";

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export interface ReportContext {
  facts: VoucherFact[];
  batches: BatchWithRelations[];
  deposits: DepositWithRelations[];
  period: Period;
  /** Restrict to these voucher companies (empty = all). */
  companies: string[];
  today: string;
  /** Free-text voucher search for the audit trail. */
  search: string;
}

export interface StandardReport {
  id: string;
  title: string;
  description: string;
  /** Which date the period applies to, shown next to the period picker. */
  periodLabel: string;
  usesSearch?: boolean;
  build: (ctx: ReportContext) => ReportTable;
}

function scoped(ctx: ReportContext): VoucherFact[] {
  return ctx.companies.length ? ctx.facts.filter((f) => ctx.companies.includes(f.company)) : ctx.facts;
}

function subtitle(ctx: ReportContext, dateLabel: string, extra: string[] = []): string[] {
  return [
    `${dateLabel}: ${describePeriod(ctx.period)}`,
    ...(ctx.companies.length ? [`Companies: ${ctx.companies.join(", ")}`] : []),
    ...extra,
  ];
}

export const STANDARD_REPORTS: StandardReport[] = [
  {
    id: "running-balance",
    title: "Running balance",
    description: "Every voucher movement in date order: received in, posted out, with a running balance of vouchers on hand and of posted vouchers awaiting payment.",
    periodLabel: "Movement date",
    build: runningBalance,
  },
  {
    id: "received-by-period",
    title: "Vouchers received by period",
    description: "Monthly totals of vouchers received, by company.",
    periodLabel: "Date received",
    build: (ctx) => {
      const facts = scoped(ctx).filter((f) => f.status !== "cancelled" && inPeriod(f.received, ctx.period));
      return {
        title: "Vouchers received by period",
        subtitle: subtitle(ctx, "Date received", ["Excludes cancelled vouchers"]),
        ...pivot(facts, { rows: ["month", "company"], column: null, measures: ["quantity", "value"], basis: "received", today: ctx.today }),
      };
    },
  },
  {
    id: "by-submitter",
    title: "Received by person",
    description: "Who brought in which vouchers, split by voucher company.",
    periodLabel: "Date received",
    build: (ctx) => {
      const facts = scoped(ctx).filter((f) => f.status !== "cancelled" && inPeriod(f.received, ctx.period));
      return {
        title: "Vouchers received by person",
        subtitle: subtitle(ctx, "Date received", ["Excludes cancelled vouchers"]),
        ...pivot(facts, { rows: ["receivedFrom", "company"], column: null, measures: ["quantity", "value"], basis: "received", today: ctx.today }),
      };
    },
  },
  {
    id: "outstanding-unposted",
    title: "Outstanding unposted (aged)",
    description: "Vouchers on hand that haven't been posted yet, by how long ago they were received.",
    periodLabel: "Date received",
    build: (ctx) => {
      const facts = scoped(ctx).filter((f) => f.status === "unposted" && inPeriod(f.received, ctx.period));
      return {
        title: "Outstanding unposted vouchers",
        subtitle: subtitle(ctx, "Date received", [`Aged as at ${fmtDate(ctx.today)}`]),
        ...pivot(facts, { rows: ["company"], column: "age", measures: ["value"], basis: "received", today: ctx.today }),
      };
    },
  },
  {
    id: "posted-not-banked",
    title: "Posted, not yet banked",
    description: "Vouchers sent out in batches where the money hasn't been banked yet.",
    periodLabel: "Date posted",
    build: (ctx) => {
      const facts = scoped(ctx).filter((f) => f.status === "posted" && inPeriod(f.posted, ctx.period));
      return {
        title: "Posted vouchers not yet banked",
        subtitle: subtitle(ctx, "Date posted"),
        ...pivot(facts, { rows: ["sentTo", "batch"], column: null, measures: ["quantity", "value"], basis: "posted", today: ctx.today }),
      };
    },
  },
  {
    id: "batch-register",
    title: "Batch register",
    description: "Every batch with who it went to, quantity, value and how much has been banked.",
    periodLabel: "Batch date",
    build: (ctx) => {
      const rows = ctx.batches
        .map((b) => {
          const date = toDay(b.batchDate || b.dateSent) || "";
          const vouchers = (b.vouchers || []).filter((v) => v.status !== "cancelled");
          const companies = b.companyNames?.length ? b.companyNames : [b.voucherCompany?.name].filter(Boolean) as string[];
          const value = sum(vouchers.map((v) => (parseFloat(String(v.amount)) || 0) * v.quantity));
          const banked = sum(vouchers.filter((v) => v.status === "deposited").map((v) => (parseFloat(String(v.amount)) || 0) * v.quantity));
          return { date, b, companies, qty: sum(vouchers.map((v) => v.quantity)), value, banked };
        })
        .filter((r) => inPeriod(r.date, ctx.period))
        .filter((r) => !ctx.companies.length || r.companies.some((c) => ctx.companies.includes(c)))
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        title: "Batch register",
        subtitle: subtitle(ctx, "Batch date"),
        columns: [
          { header: "Date", format: "text" },
          { header: "Batch", format: "text" },
          { header: "Sent to", format: "text" },
          { header: "Companies", format: "text" },
          { header: "Status", format: "text" },
          { header: "Qty", format: "number" },
          { header: "Value", format: "money" },
          { header: "Banked", format: "money" },
          { header: "Outstanding", format: "money" },
        ],
        rows: rows.map((r) => [
          fmtDate(r.date),
          r.b.reference,
          r.b.recipient?.name || r.b.voucherCompany?.name || "",
          r.companies.join(", "),
          r.b.status === "sent" ? "Posted" : capitalize(r.b.status),
          r.qty,
          r.value,
          r.banked,
          r.value - r.banked,
        ]),
        totals: ["Total", `${rows.length} batches`, "", "", "", sum(rows.map((r) => r.qty)), sum(rows.map((r) => r.value)), sum(rows.map((r) => r.banked)), sum(rows.map((r) => r.value - r.banked))],
      };
    },
  },
  {
    id: "deposit-register",
    title: "Deposit register & reconciliation",
    description: "Every deposit with the voucher value it covers, the amount banked and any difference.",
    periodLabel: "Date banked",
    build: (ctx) => {
      const rows = ctx.deposits
        .map((d) => {
          const vouchers = d.vouchers || [];
          const value = sum(vouchers.map((v) => (parseFloat(String(v.amount)) || 0) * v.quantity));
          const banked = parseFloat(d.amountBanked) || 0;
          return { date: toDay(d.dateDeposited) || "", d, qty: sum(vouchers.map((v) => v.quantity)), value, banked };
        })
        .filter((r) => inPeriod(r.date, ctx.period))
        .filter((r) => !ctx.companies.length || ctx.companies.includes(r.d.voucherCompany?.name || ""))
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        title: "Deposit register & reconciliation",
        subtitle: subtitle(ctx, "Date banked"),
        columns: [
          { header: "Date", format: "text" },
          { header: "Reference", format: "text" },
          { header: "From", format: "text" },
          { header: "Bank", format: "text" },
          { header: "Qty", format: "number" },
          { header: "Voucher value", format: "money" },
          { header: "Banked", format: "money" },
          { header: "Difference", format: "money" },
        ],
        rows: rows.map((r) => [
          fmtDate(r.date),
          r.d.reference || "",
          r.d.recipient?.name || r.d.voucherCompany?.name || "",
          r.d.bank?.name || "",
          r.qty,
          r.value,
          r.banked,
          r.banked - r.value,
        ]),
        totals: ["Total", `${rows.length} deposits`, "", "", sum(rows.map((r) => r.qty)), sum(rows.map((r) => r.value)), sum(rows.map((r) => r.banked)), sum(rows.map((r) => r.banked - r.value))],
      };
    },
  },
  {
    id: "company-statement",
    title: "Company statement",
    description: "All activity for the chosen voucher companies: each voucher with when it was received, posted and banked.",
    periodLabel: "Date received",
    build: (ctx) => {
      const facts = scoped(ctx)
        .filter((f) => inPeriod(f.received, ctx.period))
        .sort((a, b) => a.company.localeCompare(b.company) || a.received.localeCompare(b.received));
      return {
        title: ctx.companies.length === 1 ? `Statement – ${ctx.companies[0]}` : "Company statement",
        subtitle: subtitle(ctx, "Date received", ctx.companies.length ? [] : ["Tip: choose a company to get a statement for it alone"]),
        columns: [
          { header: "Company", format: "text" },
          { header: "Received", format: "text" },
          { header: "Voucher #", format: "text" },
          { header: "Type", format: "text" },
          { header: "From", format: "text" },
          { header: "Qty", format: "number" },
          { header: "Value", format: "money" },
          { header: "Status", format: "text" },
          { header: "Batch", format: "text" },
          { header: "Posted", format: "text" },
          { header: "Banked", format: "text" },
        ],
        rows: facts.map((f) => [
          f.company,
          fmtDate(f.received),
          f.voucherNumber,
          f.type,
          f.receivedFrom,
          f.quantity,
          f.value,
          capitalize(f.status),
          f.batchRef,
          fmtDate(f.posted),
          fmtDate(f.deposited),
        ]),
        totals: ["Total", "", `${facts.length} lines`, "", "", sum(facts.map((f) => f.quantity)), sum(facts.map((f) => f.value)), "", "", "", ""],
      };
    },
  },
  {
    id: "audit-trail",
    title: "Voucher audit trail",
    description: "Follow vouchers from receipt to bank. Search by voucher number, person, reference or notes.",
    periodLabel: "Date received",
    usesSearch: true,
    build: (ctx) => {
      const terms = ctx.search.toLowerCase().split(/\s+/).filter(Boolean);
      const facts = scoped(ctx)
        .filter((f) => inPeriod(f.received, ctx.period))
        .filter((f) => {
          if (!terms.length) return true;
          const text = [f.voucherNumber, f.company, f.receivedFrom, f.reference, f.notes, f.batchRef, f.depositRef, f.sentTo].join(" ").toLowerCase();
          return terms.every((t) => text.includes(t));
        })
        .sort((a, b) => a.received.localeCompare(b.received));
      return {
        title: "Voucher audit trail",
        subtitle: subtitle(ctx, "Date received", terms.length ? [`Search: "${ctx.search}"`] : []),
        columns: [
          { header: "Voucher #", format: "text" },
          { header: "Company", format: "text" },
          { header: "Value", format: "money" },
          { header: "Received", format: "text" },
          { header: "From", format: "text" },
          { header: "Posted", format: "text" },
          { header: "Batch / sent to", format: "text" },
          { header: "Banked", format: "text" },
          { header: "Deposit / bank", format: "text" },
          { header: "Status", format: "text" },
        ],
        rows: facts.map((f) => [
          f.voucherNumber || "(no number)",
          f.company,
          f.value,
          fmtDate(f.received),
          f.receivedFrom,
          fmtDate(f.posted),
          f.batchRef ? `${f.batchRef} → ${f.sentTo}` : "",
          fmtDate(f.deposited),
          f.depositRef ? `${f.depositRef} (${f.bank})` : "",
          capitalize(f.status),
        ]),
        totals: ["Total", `${facts.length} lines`, sum(facts.map((f) => f.value)), "", "", "", "", "", "", ""],
      };
    },
  },
];

/**
 * Ledger of voucher movements. In = vouchers received; out = vouchers posted in a sent batch.
 * "On hand" is the running value of vouchers held; "awaiting payment" is posted but not yet banked.
 */
function runningBalance(ctx: ReportContext): ReportTable {
  // Cancelled and completed vouchers never move through posting/banking.
  const facts = scoped(ctx).filter((f) => f.status !== "cancelled" && f.status !== "completed" && f.received);

  interface Movement {
    date: string;
    order: number; // received before posted before banked on the same day
    movement: string;
    detail: string;
    qtyIn: number;
    valueIn: number;
    qtyOut: number;
    valueOut: number;
    banked: number;
  }
  const grouped = new Map<string, Movement>();
  const bump = (key: string, base: Omit<Movement, "qtyIn" | "valueIn" | "qtyOut" | "valueOut" | "banked">, delta: Partial<Movement>) => {
    const m = grouped.get(key) || { ...base, qtyIn: 0, valueIn: 0, qtyOut: 0, valueOut: 0, banked: 0 };
    m.qtyIn += delta.qtyIn || 0;
    m.valueIn += delta.valueIn || 0;
    m.qtyOut += delta.qtyOut || 0;
    m.valueOut += delta.valueOut || 0;
    m.banked += delta.banked || 0;
    grouped.set(key, m);
  };
  facts.forEach((f) => {
    bump(`r|${f.received}|${f.company}|${f.receivedFrom}`, {
      date: f.received,
      order: 0,
      movement: "Received",
      detail: `${f.company} from ${f.receivedFrom}`,
    }, { qtyIn: f.quantity, valueIn: f.value });
    if (f.posted) {
      bump(`p|${f.posted}|${f.batchRef}`, {
        date: f.posted,
        order: 1,
        movement: "Posted",
        detail: `Batch ${f.batchRef} to ${f.sentTo}`,
      }, { qtyOut: f.quantity, valueOut: f.value });
    }
    if (f.deposited) {
      bump(`d|${f.deposited}|${f.depositRef}`, {
        date: f.deposited,
        order: 2,
        movement: "Banked",
        detail: `${f.depositRef || "Deposit"}${f.bank ? ` at ${f.bank}` : ""}`,
      }, { banked: f.value });
    }
  });

  const movements = Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.detail.localeCompare(b.detail));
  let onHand = 0;
  let awaiting = 0;
  let onHandQty = 0;
  const before = movements.filter((m) => ctx.period.from && m.date < ctx.period.from);
  before.forEach((m) => {
    onHand += m.valueIn - m.valueOut;
    onHandQty += m.qtyIn - m.qtyOut;
    awaiting += m.valueOut - m.banked;
  });
  const within = movements.filter((m) => inPeriod(m.date, ctx.period));

  const rows: (string | number)[][] = [];
  const emphasisRows: number[] = [];
  emphasisRows.push(0);
  rows.push([ctx.period.from ? fmtDate(ctx.period.from) : "", "Opening balance", "", "", "", "", onHandQty, onHand, awaiting]);
  within.forEach((m) => {
    onHand += m.valueIn - m.valueOut;
    onHandQty += m.qtyIn - m.qtyOut;
    awaiting += m.valueOut - m.banked;
    rows.push([
      fmtDate(m.date),
      m.movement,
      m.detail,
      m.movement === "Received" ? m.valueIn : "",
      m.movement === "Posted" ? m.valueOut : "",
      m.movement === "Banked" ? m.banked : "",
      onHandQty,
      onHand,
      awaiting,
    ]);
  });

  return {
    title: "Running balance",
    subtitle: subtitle(ctx, "Movement date", [
      "In = vouchers received · Out = vouchers posted in a sent batch · Banked = posted vouchers banked",
      "Excludes cancelled and completed vouchers",
    ]),
    columns: [
      { header: "Date", format: "text" },
      { header: "Movement", format: "text" },
      { header: "Detail", format: "text" },
      { header: "In", format: "money" },
      { header: "Out (posted)", format: "money" },
      { header: "Banked", format: "money" },
      { header: "Qty on hand", format: "number" },
      { header: "Value on hand", format: "money" },
      { header: "Awaiting payment", format: "money" },
    ],
    rows,
    emphasisRows,
    totals: [
      ctx.period.to ? fmtDate(ctx.period.to) : "",
      "Closing balance",
      `${within.length} movements`,
      sum(within.map((m) => m.valueIn)),
      sum(within.map((m) => m.valueOut)),
      sum(within.map((m) => m.banked)),
      onHandQty,
      onHand,
      awaiting,
    ],
  };
}
