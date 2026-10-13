import type { BatchWithRelations, DepositWithRelations, VoucherWithRelations } from "@shared/schema";

/** One voucher line joined to the batch it was posted in and the deposit that banked it. */
export interface VoucherFact {
  id: string;
  voucherNumber: string;
  company: string;
  type: string;
  receivedFrom: string;
  reference: string;
  status: string;
  notes: string;
  amount: number;
  quantity: number;
  value: number;
  received: string; // YYYY-MM-DD
  posted: string | null; // batch date
  deposited: string | null; // deposit date
  batchRef: string;
  sentTo: string;
  depositRef: string;
  bank: string;
}

export function toDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildFacts(
  vouchers: VoucherWithRelations[],
  batches: BatchWithRelations[],
  deposits: DepositWithRelations[],
): VoucherFact[] {
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const depositById = new Map(deposits.map((d) => [d.id, d]));
  return vouchers.map((v) => {
    const batch = v.batchId ? batchById.get(v.batchId) : undefined;
    const deposit = v.depositId ? depositById.get(v.depositId) : undefined;
    const amount = parseFloat(String(v.amount)) || 0;
    const quantity = v.quantity || 0;
    return {
      id: v.id,
      voucherNumber: v.voucherNumber || "",
      company: v.voucherCompany?.name || "Unknown company",
      type: v.type,
      receivedFrom: v.receivedFrom?.name || "(none)",
      reference: v.reference?.reference || "(none)",
      status: v.status,
      notes: v.notes || "",
      amount,
      quantity,
      value: amount * quantity,
      received: toDay(v.dateReceived) || "",
      posted: batch && batch.status === "sent" ? toDay(batch.batchDate || batch.dateSent) : null,
      deposited: deposit ? toDay(deposit.dateDeposited) : null,
      batchRef: batch?.reference || "",
      sentTo: batch ? batch.recipient?.name || batch.voucherCompany?.name || v.voucherCompany?.name || "" : "",
      depositRef: deposit?.reference || "",
      bank: deposit?.bank?.name || "",
    };
  });
}

// ---------- periods ----------

export type DateBasis = "received" | "posted" | "deposited";
export const DATE_BASIS_LABELS: Record<DateBasis, string> = {
  received: "Date received",
  posted: "Date posted",
  deposited: "Date banked",
};

export interface Period {
  from: string; // inclusive, "" = open
  to: string; // inclusive, "" = open
}

export const PERIOD_PRESETS = [
  "all",
  "this-month",
  "last-month",
  "this-quarter",
  "last-quarter",
  "this-year",
  "last-year",
  "last-12-months",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number] | "custom";

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  all: "All time",
  "this-month": "This month",
  "last-month": "Last month",
  "this-quarter": "This quarter",
  "last-quarter": "Last quarter",
  "this-year": "This year",
  "last-year": "Last year",
  "last-12-months": "Last 12 months",
  custom: "Custom dates",
};

export function presetPeriod(preset: PeriodPreset, now = new Date()): Period {
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = (d: Date) => toDay(d)!;
  const q = Math.floor(m / 3);
  switch (preset) {
    case "this-month":
      return { from: day(new Date(y, m, 1)), to: day(new Date(y, m + 1, 0)) };
    case "last-month":
      return { from: day(new Date(y, m - 1, 1)), to: day(new Date(y, m, 0)) };
    case "this-quarter":
      return { from: day(new Date(y, q * 3, 1)), to: day(new Date(y, q * 3 + 3, 0)) };
    case "last-quarter":
      return { from: day(new Date(y, q * 3 - 3, 1)), to: day(new Date(y, q * 3, 0)) };
    case "this-year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last-year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "last-12-months":
      return { from: day(new Date(y, m - 11, 1)), to: day(new Date(y, m + 1, 0)) };
    default:
      return { from: "", to: "" };
  }
}

export function inPeriod(date: string | null, period: Period): boolean {
  if (!period.from && !period.to) return true;
  if (!date) return false;
  return (!period.from || date >= period.from) && (!period.to || date <= period.to);
}

export function describePeriod(period: Period): string {
  if (!period.from && !period.to) return "All dates";
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (period.from && period.to) return `${fmt(period.from)} – ${fmt(period.to)}`;
  return period.from ? `From ${fmt(period.from)}` : `Up to ${fmt(period.to)}`;
}

// ---------- dimensions & pivot ----------

export type Dimension =
  | "company"
  | "type"
  | "receivedFrom"
  | "reference"
  | "status"
  | "sentTo"
  | "batch"
  | "bank"
  | "amount"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "age";

export const DIMENSION_LABELS: Record<Dimension, string> = {
  company: "Voucher company",
  type: "Type",
  receivedFrom: "Received from",
  reference: "Reference",
  status: "Status",
  sentTo: "Sent to",
  batch: "Batch",
  bank: "Bank",
  amount: "Unit amount",
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
  age: "Age (days since received)",
};

const AGE_BUCKETS = ["0–7 days", "8–30 days", "31–60 days", "61–90 days", "90+ days"];

function ageBucket(received: string, today: string): string {
  const days = Math.floor((Date.parse(today) - Date.parse(received)) / 86400000);
  if (days <= 7) return AGE_BUCKETS[0];
  if (days <= 30) return AGE_BUCKETS[1];
  if (days <= 60) return AGE_BUCKETS[2];
  if (days <= 90) return AGE_BUCKETS[3];
  return AGE_BUCKETS[4];
}

function isoWeekStart(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const dayOfWeek = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dayOfWeek);
  return toDay(d)!;
}

/** Returns [sortKey, label] for a fact under a dimension. Time dimensions use the chosen date basis. */
export function dimensionValue(fact: VoucherFact, dimension: Dimension, basis: DateBasis, today: string): [string, string] {
  const date = fact[basis] || "";
  switch (dimension) {
    case "day":
      return date ? [date, new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })] : ["~", "(no date)"];
    case "week": {
      if (!date) return ["~", "(no date)"];
      const start = isoWeekStart(date);
      return [start, `w/c ${new Date(`${start}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`];
    }
    case "month":
      return date ? [date.slice(0, 7), new Date(`${date.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })] : ["~", "(no date)"];
    case "quarter": {
      if (!date) return ["~", "(no date)"];
      const q = Math.floor((parseInt(date.slice(5, 7), 10) - 1) / 3) + 1;
      return [`${date.slice(0, 4)}-Q${q}`, `Q${q} ${date.slice(0, 4)}`];
    }
    case "year":
      return date ? [date.slice(0, 4), date.slice(0, 4)] : ["~", "(no date)"];
    case "age": {
      const bucket = ageBucket(fact.received, today);
      return [String(AGE_BUCKETS.indexOf(bucket)), bucket];
    }
    case "amount":
      return [fact.amount.toFixed(2).padStart(12, "0"), `£${fact.amount.toFixed(2)}`];
    case "batch":
      return [fact.batchRef || "~", fact.batchRef || "(not posted)"];
    case "sentTo":
      return [fact.sentTo || "~", fact.sentTo || "(not posted)"];
    case "bank":
      return [fact.bank || "~", fact.bank || "(not banked)"];
    case "status": {
      const order = ["unposted", "posted", "deposited", "completed", "cancelled"];
      return [String(order.indexOf(fact.status)), fact.status.charAt(0).toUpperCase() + fact.status.slice(1)];
    }
    default: {
      const value = String(fact[dimension] ?? "");
      return [value.toLowerCase(), value];
    }
  }
}

export type Measure = "count" | "quantity" | "value" | "average";
export const MEASURE_LABELS: Record<Measure, string> = {
  count: "Lines",
  quantity: "Qty",
  value: "Value",
  average: "Avg value / voucher",
};

interface Totals {
  count: number;
  quantity: number;
  value: number;
}

function measureValue(totals: Totals, measure: Measure): number {
  if (measure === "average") return totals.quantity ? totals.value / totals.quantity : 0;
  return totals[measure];
}

// ---------- report table (what the UI renders and exports) ----------

export type CellFormat = "text" | "number" | "money";

export interface ReportColumn {
  header: string;
  format: CellFormat;
}

export interface ReportTable {
  title: string;
  subtitle: string[];
  columns: ReportColumn[];
  rows: (string | number)[][];
  /** Rows rendered bold (e.g. group subtotals). */
  emphasisRows?: number[];
  totals?: (string | number)[];
}

export interface PivotConfig {
  rows: Dimension[]; // 1 or 2
  column: Dimension | null;
  measures: Measure[];
  basis: DateBasis;
  today: string;
}

/** Group facts by row dimensions (with subtotals for two levels) and an optional column dimension. */
export function pivot(facts: VoucherFact[], config: PivotConfig): Omit<ReportTable, "title" | "subtitle"> {
  const { rows: rowDims, column, measures, basis, today } = config;
  const measureFormat = (m: Measure): CellFormat => (m === "value" || m === "average" ? "money" : "number");
  const empty = (): Totals => ({ count: 0, quantity: 0, value: 0 });
  const add = (t: Totals, f: VoucherFact) => {
    t.count += 1;
    t.quantity += f.quantity;
    t.value += f.value;
  };

  const columnKeys = new Map<string, string>();
  if (column) facts.forEach((f) => {
    const [key, label] = dimensionValue(f, column, basis, today);
    columnKeys.set(key, label);
  });
  const sortedColumns = Array.from(columnKeys.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));

  // tree: level1 key -> { label, totals, byColumn, children: level2 key -> {...} }
  type Node = { label: string; totals: Totals; byColumn: Map<string, Totals>; children: Map<string, Node> };
  const newNode = (label: string): Node => ({ label, totals: empty(), byColumn: new Map(), children: new Map() });
  const root = newNode("Total");
  facts.forEach((f) => {
    const columnKey = column ? dimensionValue(f, column, basis, today)[0] : "";
    const touch = (node: Node) => {
      add(node.totals, f);
      if (column) {
        const t = node.byColumn.get(columnKey) || empty();
        add(t, f);
        node.byColumn.set(columnKey, t);
      }
    };
    touch(root);
    let node = root;
    rowDims.forEach((dim) => {
      const [key, label] = dimensionValue(f, dim, basis, today);
      let child = node.children.get(key);
      if (!child) {
        child = newNode(label);
        node.children.set(key, child);
      }
      touch(child);
      node = child;
    });
  });

  const valueCells = (node: Node): number[] => {
    if (!column) return measures.map((m) => measureValue(node.totals, m));
    const cells: number[] = [];
    sortedColumns.forEach(([key]) => measures.forEach((m) => cells.push(measureValue(node.byColumn.get(key) || empty(), m))));
    measures.forEach((m) => cells.push(measureValue(node.totals, m)));
    return cells;
  };

  const columns: ReportColumn[] = rowDims.map((d) => ({ header: DIMENSION_LABELS[d], format: "text" as const }));
  if (column) {
    sortedColumns.forEach(([, label]) =>
      measures.forEach((m) => columns.push({ header: measures.length > 1 ? `${label} ${MEASURE_LABELS[m]}` : label, format: measureFormat(m) })),
    );
    measures.forEach((m) => columns.push({ header: measures.length > 1 ? `Total ${MEASURE_LABELS[m]}` : "Total", format: measureFormat(m) }));
  } else {
    measures.forEach((m) => columns.push({ header: MEASURE_LABELS[m], format: measureFormat(m) }));
  }

  const sortChildren = (node: Node) => Array.from(node.children.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  const rows: (string | number)[][] = [];
  const emphasisRows: number[] = [];
  sortChildren(root).forEach(([, level1]) => {
    if (rowDims.length === 1) {
      rows.push([level1.label, ...valueCells(level1)]);
      return;
    }
    sortChildren(level1).forEach(([, level2]) => rows.push([level1.label, level2.label, ...valueCells(level2)]));
    emphasisRows.push(rows.length);
    rows.push([`${level1.label} total`, "", ...valueCells(level1)]);
  });

  const totals = [...rowDims.map((_, i) => (i === 0 ? "Total" : "")), ...valueCells(root)];
  return { columns, rows, emphasisRows, totals };
}
