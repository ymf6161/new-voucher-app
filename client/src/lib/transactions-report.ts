import { describePeriod, inPeriod, type CellFormat, type DateBasis, type Period, type ReportTable, type VoucherFact } from "./report-data";

// One report that shows every voucher from any angle: choose what to group by
// and how much detail to show under each group.

export type GroupBy = "none" | "receivedFrom" | "reference" | "company" | "batch" | "deposit";
export type Detail = "each" | "received" | "banked" | "total";
export type StatusFilter = "all" | "unposted" | "posted" | "deposited";

export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  none: "Everything",
  receivedFrom: "Received from",
  reference: "Reference",
  company: "Voucher company",
  batch: "Posted (batch)",
  deposit: "Banked (deposit)",
};

export const DETAIL_LABELS: Record<Detail, string> = {
  each: "Each voucher",
  received: "As received",
  banked: "As banked",
  total: "Totals only",
};

export const DETAIL_HELP: Record<Detail, string> = {
  each: "One line per physical voucher. A line of 5 is shown as 5 vouchers.",
  received: "One line per entry, exactly as it was recorded.",
  banked: "Added up by company, type and amount, the way vouchers are sent and banked.",
  total: "One line per group with its count, quantity and value.",
};

export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  unposted: "Not yet posted",
  posted: "Posted, not banked",
  deposited: "Banked",
};

/** The date that best fits each grouping; the user can still pick another. */
export const DEFAULT_DATE_BASIS: Record<GroupBy, DateBasis> = {
  none: "received",
  receivedFrom: "received",
  reference: "received",
  company: "received",
  batch: "posted",
  deposit: "deposited",
};

export interface TransactionsOptions {
  groupBy: GroupBy;
  detail: Detail;
  status: StatusFilter;
  basis: DateBasis;
  period: Period;
  /** Voucher companies to include (empty = all). */
  companies: string[];
  includeCancelled: boolean;
}

const STATUS_TEXT: Record<string, string> = {
  unposted: "Unposted",
  posted: "Posted",
  deposited: "Banked",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

interface Group {
  key: string;
  label: string;
  sort: string;
  /** Catch-all groups ("Not posted", "(none)") go after the rest. */
  last?: boolean;
  facts: VoucherFact[];
}

function groupOf(f: VoucherFact, groupBy: GroupBy): Omit<Group, "facts"> {
  switch (groupBy) {
    case "receivedFrom":
      return { key: f.receivedFrom, label: f.receivedFrom, sort: f.receivedFrom.toLowerCase(), last: f.receivedFrom === "(none)" };
    case "reference":
      return { key: f.reference, label: f.reference, sort: f.reference.toLowerCase(), last: f.reference === "(none)" };
    case "company":
      return { key: f.company, label: f.company, sort: f.company.toLowerCase() };
    case "batch":
      if (!f.batchId) return { key: "", label: "Not posted", sort: "", last: true };
      return {
        key: f.batchId,
        label: [`Batch ${f.batchRef}`, fmtDate(f.batchDate), f.sentTo && `to ${f.sentTo}`, !f.posted && "(pending)"].filter(Boolean).join(" · "),
        sort: `${f.batchDate || ""} ${f.batchRef}`,
      };
    case "deposit":
      if (!f.depositId) return { key: "", label: "Not banked", sort: "", last: true };
      return {
        key: f.depositId,
        label: [`Banked ${fmtDate(f.deposited)}`, f.bank, f.depositRef && `ref ${f.depositRef}`].filter(Boolean).join(" · "),
        sort: `${f.deposited || ""} ${f.depositId}`,
      };
    default:
      return { key: "all", label: "All vouchers", sort: "" };
  }
}

function matchesStatus(f: VoucherFact, status: StatusFilter): boolean {
  return status === "all" || f.status === status;
}

export function filterFacts(facts: VoucherFact[], o: TransactionsOptions): VoucherFact[] {
  return facts.filter(
    (f) =>
      (o.includeCancelled || f.status !== "cancelled") &&
      matchesStatus(f, o.status) &&
      (!o.companies.length || o.companies.includes(f.company)) &&
      inPeriod(o.basis === "posted" ? f.batchDate : f[o.basis], o.period),
  );
}

function groupFacts(facts: VoucherFact[], groupBy: GroupBy): Group[] {
  const groups = new Map<string, Group>();
  for (const f of facts) {
    const g = groupOf(f, groupBy);
    if (!groups.has(g.key)) groups.set(g.key, { ...g, facts: [] });
    groups.get(g.key)!.facts.push(f);
  }
  return Array.from(groups.values()).sort((a, b) => Number(!!a.last) - Number(!!b.last) || a.sort.localeCompare(b.sort) || a.label.localeCompare(b.label));
}

const byReceived = (a: VoucherFact, b: VoucherFact) =>
  a.received.localeCompare(b.received) || a.company.localeCompare(b.company) || a.voucherNumber.localeCompare(b.voucherNumber, undefined, { numeric: true });

const sumOf = (facts: VoucherFact[], key: "quantity" | "value") => facts.reduce((total, f) => total + f[key], 0);

// ---------- columns per detail level ----------

type Field = "received" | "company" | "type" | "voucherNumber" | "receivedFrom" | "reference" | "status" | "batch" | "banked" | "amount" | "quantity" | "value" | "group" | "lines";

const FIELD_COLUMNS: Record<Field, { header: string; format: CellFormat }> = {
  received: { header: "Received", format: "text" },
  company: { header: "Company", format: "text" },
  type: { header: "Type", format: "text" },
  voucherNumber: { header: "Voucher no.", format: "text" },
  receivedFrom: { header: "Received from", format: "text" },
  reference: { header: "Reference", format: "text" },
  status: { header: "Status", format: "text" },
  batch: { header: "Batch", format: "text" },
  banked: { header: "Banked", format: "text" },
  amount: { header: "Amount", format: "money" },
  quantity: { header: "Qty", format: "number" },
  value: { header: "Value", format: "money" },
  group: { header: "", format: "text" },
  lines: { header: "Entries", format: "number" },
};

/** The field that repeats the group heading, so it can be left out of the lines. */
const GROUP_FIELD: Partial<Record<GroupBy, Field>> = {
  receivedFrom: "receivedFrom",
  reference: "reference",
  company: "company",
  batch: "batch",
  deposit: "banked",
};

function fieldsFor(detail: Detail, groupBy: GroupBy): Field[] {
  if (detail === "total") return ["group", "lines", "quantity", "value"];
  if (detail === "banked") return ["company", "type", "amount", "quantity", "value"].filter((f) => !(groupBy === "company" && f === "company")) as Field[];
  const all: Field[] = ["received", "company", "type", "voucherNumber", "receivedFrom", "reference", "status", "batch", "banked", "amount"];
  const shown = all.filter((f) => f !== GROUP_FIELD[groupBy]);
  return detail === "each" ? shown : [...shown, "quantity", "value"];
}

function factCell(f: VoucherFact, field: Field, each: boolean): string | number {
  switch (field) {
    case "received": return fmtDate(f.received);
    case "company": return f.company;
    case "type": return f.type;
    case "voucherNumber": return f.voucherNumber;
    case "receivedFrom": return f.receivedFrom === "(none)" ? "" : f.receivedFrom;
    case "reference": return f.reference === "(none)" ? "" : f.reference;
    case "status": return STATUS_TEXT[f.status] || f.status;
    case "batch": return f.batchRef;
    case "banked": return fmtDate(f.deposited);
    case "amount": return f.amount;
    case "quantity": return each ? 1 : f.quantity;
    case "value": return each ? f.amount : f.value;
    default: return "";
  }
}

/** Vouchers added up by company, type and amount (how they are posted and banked). */
function aggregate(facts: VoucherFact[]) {
  const lines = new Map<string, { company: string; type: string; amount: number; quantity: number; value: number }>();
  for (const f of facts) {
    const key = `${f.company}\u0000${f.type}\u0000${f.amount}`;
    const line = lines.get(key) || { company: f.company, type: f.type, amount: f.amount, quantity: 0, value: 0 };
    line.quantity += f.quantity;
    line.value += f.value;
    lines.set(key, line);
  }
  return Array.from(lines.values()).sort((a, b) => a.company.localeCompare(b.company) || a.type.localeCompare(b.type) || a.amount - b.amount);
}

// ---------- the report ----------

export function buildTransactionsReport(allFacts: VoucherFact[], o: TransactionsOptions): ReportTable {
  const facts = filterFacts(allFacts, o);
  const groups = groupFacts(facts, o.groupBy);
  const fields = fieldsFor(o.detail, o.groupBy);
  const grouped = o.groupBy !== "none";
  const blank = () => fields.map(() => "" as string | number);
  const rows: (string | number)[][] = [];
  const emphasisRows: number[] = [];

  // Puts quantity/value (and entries) into the matching columns of a row.
  const withTotals = (row: (string | number)[], groupFacts: VoucherFact[]) => {
    fields.forEach((field, i) => {
      if (field === "quantity") row[i] = sumOf(groupFacts, "quantity");
      if (field === "value") row[i] = sumOf(groupFacts, "value");
      if (field === "lines") row[i] = groupFacts.length;
    });
    return row;
  };

  for (const group of groups) {
    if (o.detail === "total") {
      const row = blank();
      row[0] = group.label;
      rows.push(withTotals(row, group.facts));
      continue;
    }

    if (grouped) {
      const heading = blank();
      heading[0] = group.label;
      emphasisRows.push(rows.length);
      rows.push(heading);
    }

    if (o.detail === "banked") {
      for (const line of aggregate(group.facts)) {
        rows.push(fields.map((field) => (field in line ? (line as any)[field] : "")));
      }
    } else {
      for (const f of [...group.facts].sort(byReceived)) {
        const copies = o.detail === "each" ? Math.max(f.quantity, 0) : 1;
        for (let n = 0; n < copies; n++) rows.push(fields.map((field) => factCell(f, field, o.detail === "each")));
      }
    }

    if (grouped) {
      const subtotal = blank();
      subtotal[0] = o.detail === "each" ? `Total ${group.label} (${sumOf(group.facts, "quantity")} vouchers)` : `Total ${group.label}`;
      // "Each voucher" has no Qty column, so show the count in the amount column's place.
      if (o.detail === "each") subtotal[fields.indexOf("amount")] = sumOf(group.facts, "value");
      emphasisRows.push(rows.length);
      rows.push(withTotals(subtotal, group.facts));
    }
  }

  const totals = withTotals(blank(), facts);
  totals[0] = `Grand total (${sumOf(facts, "quantity").toLocaleString("en-GB")} vouchers)`;
  if (o.detail === "each") totals[fields.indexOf("amount")] = sumOf(facts, "value");

  const columns = fields.map((field) =>
    field === "group" ? { header: GROUP_BY_LABELS[o.groupBy] === "Everything" ? "" : GROUP_BY_LABELS[o.groupBy], format: "text" as CellFormat } : FIELD_COLUMNS[field],
  );

  const basisLabel = { received: "Date received", posted: "Date posted", deposited: "Date banked" }[o.basis];
  const title = o.groupBy === "none" ? `Vouchers – ${DETAIL_LABELS[o.detail].toLowerCase()}` : `Vouchers by ${GROUP_BY_LABELS[o.groupBy].toLowerCase()} – ${DETAIL_LABELS[o.detail].toLowerCase()}`;
  return {
    title,
    subtitle: [
      `${basisLabel}: ${describePeriod(o.period)}`,
      ...(o.status !== "all" ? [`Status: ${STATUS_LABELS[o.status]}`] : []),
      ...(o.companies.length ? [`Companies: ${o.companies.join(", ")}`] : []),
      ...(o.includeCancelled ? [] : ["Excludes cancelled vouchers"]),
    ],
    columns,
    rows,
    emphasisRows,
    totals: facts.length ? totals : undefined,
  };
}
