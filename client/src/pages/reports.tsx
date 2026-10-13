import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, FileText, Filter } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildFacts,
  DATE_BASIS_LABELS,
  describePeriod,
  DIMENSION_LABELS,
  inPeriod,
  MEASURE_LABELS,
  PERIOD_PRESETS,
  PERIOD_PRESET_LABELS,
  pivot,
  presetPeriod,
  toDay,
  type DateBasis,
  type Dimension,
  type Measure,
  type Period,
  type PeriodPreset,
  type ReportTable,
} from "@/lib/report-data";
import { STANDARD_REPORTS } from "@/lib/standard-reports";
import { exportReportCSV, exportReportExcel, exportReportPDF, formatCell } from "@/lib/report-export";
import type { BatchWithRelations, CompanySettings, DepositWithRelations, VoucherWithRelations } from "@shared/schema";

const NONE = "__none";

export default function Reports() {
  const { data: vouchers = [], isLoading: vouchersLoading, error: vouchersError } = useQuery<VoucherWithRelations[]>({ queryKey: ["/api/vouchers"] });
  const { data: batches = [], isLoading: batchesLoading } = useQuery<BatchWithRelations[]>({ queryKey: ["/api/batches"] });
  const { data: deposits = [], isLoading: depositsLoading } = useQuery<DepositWithRelations[]>({ queryKey: ["/api/deposits"] });
  const { data: settings } = useQuery<CompanySettings>({ queryKey: ["/api/settings"] });

  const facts = useMemo(() => buildFacts(vouchers, batches, deposits), [vouchers, batches, deposits]);
  const today = toDay(new Date())!;
  const isLoading = vouchersLoading || batchesLoading || depositsLoading;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Standard reports and a report builder. Every report exports to PDF, Excel and CSV." />
      {vouchersError ? (
        <Card><CardContent className="py-10 text-center text-destructive">Could not load report data: {(vouchersError as Error).message}</CardContent></Card>
      ) : isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Tabs defaultValue="standard">
          <TabsList>
            <TabsTrigger value="standard" data-testid="tab-standard">Standard reports</TabsTrigger>
            <TabsTrigger value="builder" data-testid="tab-builder">Report builder</TabsTrigger>
          </TabsList>
          <TabsContent value="standard" className="mt-4">
            <StandardReports facts={facts} batches={batches} deposits={deposits} settings={settings} today={today} />
          </TabsContent>
          <TabsContent value="builder" className="mt-4">
            <ReportBuilder facts={facts} settings={settings} today={today} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ---------- standard reports ----------

function StandardReports({
  facts,
  batches,
  deposits,
  settings,
  today,
}: {
  facts: ReturnType<typeof buildFacts>;
  batches: BatchWithRelations[];
  deposits: DepositWithRelations[];
  settings?: CompanySettings;
  today: string;
}) {
  const [reportId, setReportId] = useState(STANDARD_REPORTS[0].id);
  const [preset, setPreset] = useState<PeriodPreset>("this-month");
  const [custom, setCustom] = useState<Period>({ from: "", to: "" });
  const [companies, setCompanies] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const report = STANDARD_REPORTS.find((r) => r.id === reportId)!;
  const period = preset === "custom" ? custom : presetPeriod(preset);
  const companyOptions = useMemo(() => Array.from(new Set(facts.map((f) => f.company))).sort(), [facts]);
  const table = useMemo(
    () => report.build({ facts, batches, deposits, period, companies, today, search }),
    [report, facts, batches, deposits, period.from, period.to, companies, today, search],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <nav className="space-y-1" aria-label="Standard reports">
        {STANDARD_REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setReportId(r.id)}
            className={cn(
              "w-full rounded-md border p-3 text-left transition-colors",
              r.id === reportId ? "border-primary bg-primary/5" : "hover:bg-muted/50",
            )}
            aria-current={r.id === reportId}
            data-testid={`report-${r.id}`}
          >
            <div className="text-sm font-medium">{r.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{r.description}</div>
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <PeriodPicker label={report.periodLabel} preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
            <MultiSelect label="Companies" options={companyOptions} value={companies} onChange={setCompanies} testId="filter-companies" />
            {report.usesSearch && (
              <div className="space-y-1">
                <Label htmlFor="report-search">Search vouchers</Label>
                <Input id="report-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Voucher #, person, reference..." className="w-64" data-testid="input-report-search" />
              </div>
            )}
          </CardContent>
        </Card>
        <ReportView table={table} settings={settings} />
      </div>
    </div>
  );
}

// ---------- builder ----------

const ROW_DIMENSIONS: Dimension[] = ["company", "type", "receivedFrom", "reference", "status", "sentTo", "batch", "bank", "amount", "day", "week", "month", "quarter", "year", "age"];

function ReportBuilder({ facts, settings, today }: { facts: ReturnType<typeof buildFacts>; settings?: CompanySettings; today: string }) {
  const [basis, setBasis] = useState<DateBasis>("received");
  const [preset, setPreset] = useState<PeriodPreset>("this-year");
  const [custom, setCustom] = useState<Period>({ from: "", to: "" });
  const [row1, setRow1] = useState<Dimension>("company");
  const [row2, setRow2] = useState<Dimension | null>(null);
  const [column, setColumn] = useState<Dimension | null>("month");
  const [measures, setMeasures] = useState<Measure[]>(["quantity", "value"]);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [filters, setFilters] = useState<Record<string, string[]>>({});

  const period = preset === "custom" ? custom : presetPeriod(preset);
  const filterDefs: { key: keyof ReturnType<typeof buildFacts>[number]; label: string }[] = [
    { key: "company", label: "Company" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "receivedFrom", label: "Received from" },
    { key: "reference", label: "Reference" },
    { key: "sentTo", label: "Sent to" },
  ];
  const options = useMemo(
    () => Object.fromEntries(filterDefs.map((d) => [d.key, Array.from(new Set(facts.map((f) => String(f[d.key] || "")))).filter(Boolean).sort()])),
    [facts],
  );

  const filtered = facts.filter(
    (f) =>
      (includeCancelled || f.status !== "cancelled") &&
      inPeriod(f[basis], period) &&
      filterDefs.every((d) => !filters[d.key]?.length || filters[d.key].includes(String(f[d.key]))),
  );
  const rows = [row1, ...(row2 && row2 !== row1 ? [row2] : [])];
  const table: ReportTable = {
    title: `${MEASURE_LABELS[measures[0] || "value"]} by ${rows.map((d) => DIMENSION_LABELS[d].toLowerCase()).join(" and ")}${column ? ` per ${DIMENSION_LABELS[column].toLowerCase()}` : ""}`,
    subtitle: [
      `${DATE_BASIS_LABELS[basis]}: ${describePeriod(period)}`,
      ...filterDefs.filter((d) => filters[d.key]?.length).map((d) => `${d.label}: ${filters[d.key].join(", ")}`),
      ...(includeCancelled ? [] : ["Excludes cancelled vouchers"]),
    ],
    ...pivot(filtered, { rows, column, measures: measures.length ? measures : ["value"], basis, today }),
  };

  const dimensionSelect = (value: Dimension | null, onChange: (d: Dimension | null) => void, allowNone: boolean, testId: string) => (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? null : (v as Dimension))}>
      <SelectTrigger className="w-48" data-testid={testId}><SelectValue /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>None</SelectItem>}
        {ROW_DIMENSIONS.map((d) => <SelectItem key={d} value={d}>{DIMENSION_LABELS[d]}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Date to use</Label>
              <Select value={basis} onValueChange={(v) => setBasis(v as DateBasis)}>
                <SelectTrigger className="w-40" data-testid="select-basis"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DATE_BASIS_LABELS) as DateBasis[]).map((b) => <SelectItem key={b} value={b}>{DATE_BASIS_LABELS[b]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <PeriodPicker label="Period" preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label>Rows</Label>{dimensionSelect(row1, (d) => setRow1(d || "company"), false, "select-row1")}</div>
            <div className="space-y-1"><Label>Then by</Label>{dimensionSelect(row2, setRow2, true, "select-row2")}</div>
            <div className="space-y-1"><Label>Columns</Label>{dimensionSelect(column, setColumn, true, "select-column")}</div>
            <div className="space-y-1">
              <Label>Show</Label>
              <div className="flex h-9 items-center gap-3">
                {(Object.keys(MEASURE_LABELS) as Measure[]).map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={measures.includes(m)}
                      onCheckedChange={(checked) => setMeasures(checked ? [...measures, m] : measures.filter((x) => x !== m))}
                      data-testid={`measure-${m}`}
                    />
                    {MEASURE_LABELS[m]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filterDefs.map((d) => (
              <MultiSelect
                key={d.key}
                label={d.label}
                options={options[d.key] || []}
                value={filters[d.key] || []}
                onChange={(value) => setFilters({ ...filters, [d.key]: value })}
                compact
                testId={`builder-filter-${d.key}`}
              />
            ))}
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={includeCancelled} onCheckedChange={(c) => setIncludeCancelled(!!c)} />
              Include cancelled
            </label>
          </div>
        </CardContent>
      </Card>
      <ReportView table={table} settings={settings} />
    </div>
  );
}

// ---------- shared pieces ----------

function PeriodPicker({
  label,
  preset,
  onPreset,
  custom,
  onCustom,
}: {
  label: string;
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
  custom: Period;
  onCustom: (p: Period) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>{label}</Label>
        <Select
          value={preset}
          onValueChange={(v) => {
            if (v === "custom" && preset !== "custom") onCustom(presetPeriod(preset));
            onPreset(v as PeriodPreset);
          }}
        >
          <SelectTrigger className="w-44" data-testid="select-period"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[...PERIOD_PRESETS, "custom" as const].map((p) => <SelectItem key={p} value={p}>{PERIOD_PRESET_LABELS[p]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {preset === "custom" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="period-from">From</Label>
            <Input id="period-from" type="date" value={custom.from} onChange={(e) => onCustom({ ...custom, from: e.target.value })} className="w-40" data-testid="input-period-from" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="period-to">To</Label>
            <Input id="period-to" type="date" value={custom.to} onChange={(e) => onCustom({ ...custom, to: e.target.value })} className="w-40" data-testid="input-period-to" />
          </div>
        </>
      )}
    </>
  );
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
  compact = false,
  testId,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  compact?: boolean;
  testId?: string;
}) {
  const button = (
    <PopoverTrigger asChild>
      <Button variant={value.length ? "secondary" : "outline"} size={compact ? "sm" : "default"} className={compact ? "h-8" : "h-9 w-48 justify-start"} data-testid={testId}>
        <Filter className="mr-1.5 h-3.5 w-3.5" />
        {compact ? label : value.length ? `${value.length} selected` : "All"}
        {compact && value.length > 0 && <span className="ml-1">({value.length})</span>}
      </Button>
    </PopoverTrigger>
  );
  return (
    <Popover>
      {compact ? button : (
        <div className="space-y-1">
          <Label>{label}</Label>
          <div>{button}</div>
        </div>
      )}
      <PopoverContent align="start" className="w-64 p-3">
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {options.map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
              <Checkbox
                checked={value.includes(option)}
                onCheckedChange={(checked) => onChange(checked ? [...value, option] : value.filter((v) => v !== option))}
              />
              <span className="truncate">{option}</span>
            </label>
          ))}
          {options.length === 0 && <p className="text-sm text-muted-foreground">No values</p>}
        </div>
        {value.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => onChange([])}>Clear</Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ReportView({ table, settings }: { table: ReportTable; settings?: CompanySettings }) {
  const { toast } = useToast();
  const emphasis = new Set(table.emphasisRows || []);
  const run = async (kind: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
    } catch (error: any) {
      toast({ title: `${kind} export failed`, description: error?.message, variant: "destructive" });
    }
  };
  const align = (i: number) => (table.columns[i]?.format === "text" ? "text-left" : "text-right");

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" data-testid="report-title">{table.title}</h2>
            {table.subtitle.map((line) => <p key={line} className="text-xs text-muted-foreground">{line}</p>)}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => run("PDF", () => exportReportPDF(table, settings))} disabled={!table.rows.length} data-testid="export-pdf">
              <FileDown className="mr-1.5 h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => run("Excel", () => exportReportExcel(table))} disabled={!table.rows.length} data-testid="export-excel">
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => run("CSV", () => exportReportCSV(table))} disabled={!table.rows.length} data-testid="export-csv">
              <FileText className="mr-1.5 h-4 w-4" /> CSV
            </Button>
          </div>
        </div>
        {table.rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground" data-testid="report-empty">Nothing to show for this period and these filters.</p>
        ) : (
          <div className="max-h-[65vh] overflow-auto rounded-md border">
            <table className="w-full text-sm" data-testid="report-table">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={i} className={cn("whitespace-nowrap px-3 py-2 font-medium", align(i))}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className={cn("border-t", emphasis.has(r) && "bg-muted/40 font-semibold")}>
                    {row.map((v, i) => (
                      <td key={i} className={cn("whitespace-nowrap px-3 py-1.5", align(i))}>{formatCell(v, table.columns[i]?.format || "text")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {table.totals && (
                <tfoot className="sticky bottom-0 border-t-2 bg-muted font-semibold">
                  <tr data-testid="report-totals">
                    {table.totals.map((v, i) => (
                      <td key={i} className={cn("whitespace-nowrap px-3 py-2", align(i))}>{formatCell(v, table.columns[i]?.format || "text")}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
