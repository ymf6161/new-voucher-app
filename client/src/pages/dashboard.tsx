import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Receipt, Send, Landmark, CalendarDays, Plus, BarChart3, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate, batchSentTo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardStats, StatsBucket } from "@shared/schema";

/**
 * Stage colours (validated for colour-blind separation in light and dark). Two sit under 3:1
 * on white, so every use carries a visible text label next to it.
 */
const STAGES = [
  { key: "unposted", label: "On hand", bar: "bg-[#eda100] dark:bg-[#c98500]" },
  { key: "posted", label: "Awaiting payment", bar: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { key: "deposited", label: "Banked", bar: "bg-[#1baf7a] dark:bg-[#199e70]" },
] as const;

/** Categorical slots for company avatars: a company keeps its colour wherever it appears. */
const AVATAR_COLORS = [
  "bg-[#2a78d6]", "bg-[#eb6834]", "bg-[#1baf7a]", "bg-[#c98500]",
  "bg-[#d55181]", "bg-[#008300]", "bg-[#6250d6]", "bg-[#e34948]",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || "?") + (words[1]?.[0] || "")).toUpperCase();
}

const qtyLabel = (b?: StatsBucket) => `${(b?.quantity ?? 0).toLocaleString("en-GB")} voucher${b?.quantity === 1 ? "" : "s"}`;

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const header = (
    <PageHeader
      title="Dashboard"
      description={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
    >
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/reports"><BarChart3 className="mr-2 h-4 w-4" />Reports</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/batches"><Send className="mr-2 h-4 w-4" />Post vouchers</Link>
        </Button>
        <Button asChild>
          <Link href="/vouchers"><Plus className="mr-2 h-4 w-4" />Receive vouchers</Link>
        </Button>
      </div>
    </PageHeader>
  );

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile title="On hand" hint="Received, not posted yet" bucket={stats.byStatus.unposted} icon={Receipt}
          chip="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" stripe="bg-[#eda100] dark:bg-[#c98500]" testId="on-hand" />
        <Tile title="Awaiting payment" hint="Posted, not banked yet" bucket={stats.byStatus.posted} icon={Send}
          chip="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" stripe="bg-[#2a78d6] dark:bg-[#3987e5]" testId="awaiting" />
        <Tile title="Banked" hint="All time" bucket={stats.byStatus.deposited} icon={Landmark}
          chip="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" stripe="bg-[#1baf7a] dark:bg-[#199e70]" testId="banked" />
        <Tile title="Received this month" hint={new Date().toLocaleDateString("en-GB", { month: "long" })} bucket={stats.thisMonth} icon={CalendarDays}
          chip="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" stripe="bg-[#6250d6] dark:bg-[#9085e9]" testId="this-month" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Where your vouchers are</CardTitle>
          </CardHeader>
          <CardContent>
            <Pipeline byStatus={stats.byStatus} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Received in the last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyBars monthly={stats.monthly} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Recent vouchers</CardTitle>
            <Link href="/vouchers" className="text-sm font-medium text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {!stats.recentVouchers?.length ? (
              <EmptyState icon={Receipt} title="No vouchers yet" description="Add your first voucher to start tracking it." className="py-8" />
            ) : (
              <ul className="divide-y">
                {stats.recentVouchers.map((voucher) => {
                  const company = voucher.voucherCompany?.name || "Unknown company";
                  const total = (parseFloat(String(voucher.amount)) || 0) * (voucher.quantity || 0);
                  return (
                    <li key={voucher.id} className="flex items-center gap-3 py-3" data-testid={`recent-voucher-${voucher.id}`}>
                      <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold text-white", avatarColor(company))} aria-hidden="true">
                        {initials(company)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-medium">{company}</span>
                          {voucher.voucherNumber && <span className="truncate text-xs text-muted-foreground">#{voucher.voucherNumber}</span>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {formatDate(voucher.dateReceived)}
                          {voucher.receivedFrom && ` · ${voucher.receivedFrom.name}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatCurrency(total)}</div>
                        {voucher.quantity > 1 && (
                          <div className="text-xs text-muted-foreground">{voucher.quantity} × {formatCurrency(voucher.amount)}</div>
                        )}
                      </div>
                      <StatusBadge status={voucher.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Recent batches</CardTitle>
            <Link href="/batches" className="text-sm font-medium text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {!stats.pendingBatches?.length ? (
              <EmptyState icon={Send} title="No batches yet" description="Create a batch to post vouchers." className="py-8" />
            ) : (
              <ul className="divide-y">
                {stats.pendingBatches.map((batch) => {
                  const sentTo = batch.recipient?.name || batch.voucherCompany?.name || "Unknown";
                  const qty = (batch.vouchers || []).reduce((sum, v) => sum + (v.quantity || 0), 0);
                  return (
                    <li key={batch.id} className="flex items-center gap-3 py-3" data-testid={`pending-batch-${batch.id}`}>
                      <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold text-white", avatarColor(sentTo))} aria-hidden="true">
                        {initials(sentTo)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{batchSentTo(batch) || sentTo}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          Batch {batch.reference} · {formatDate(batch.batchDate || batch.dateSent)} · Qty {qty}
                        </div>
                      </div>
                      <div className="text-sm font-semibold">{formatCurrency(batch.amountSent)}</div>
                      <StatusBadge status={batch.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Tile({ title, hint, bucket, icon: Icon, chip, stripe, testId }: {
  title: string;
  hint: string;
  bucket?: StatsBucket;
  icon: LucideIcon;
  chip: string;
  stripe: string;
  testId: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn("absolute inset-x-0 top-0 h-1", stripe)} aria-hidden="true" />
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight" data-testid={`tile-${testId}`}>{formatCurrency(bucket?.value ?? 0)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{qtyLabel(bucket)}</p>
          </div>
          <span className={cn("rounded-lg p-2.5", chip)}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Pipeline({ byStatus }: { byStatus: DashboardStats["byStatus"] }) {
  const total = STAGES.reduce((sum, s) => sum + (byStatus[s.key]?.value || 0), 0);
  if (total === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No vouchers yet.</p>;
  return (
    <div className="space-y-5">
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-muted" role="img"
        aria-label={STAGES.map((s) => `${s.label} ${formatCurrency(byStatus[s.key].value)}`).join(", ")}>
        {STAGES.map((s) => {
          const value = byStatus[s.key]?.value || 0;
          if (!value) return null;
          return (
            <div key={s.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.bar)}
              style={{ width: `${(value / total) * 100}%` }}
              title={`${s.label}: ${formatCurrency(value)}`} />
          );
        })}
      </div>
      <ul className="space-y-3" data-testid="pipeline-legend">
        {STAGES.map((s) => {
          const bucket = byStatus[s.key];
          const pct = total ? Math.round((bucket.value / total) * 100) : 0;
          return (
            <li key={s.key} className="flex items-center gap-3 text-sm">
              <span className={cn("h-3 w-3 flex-none rounded-sm", s.bar)} aria-hidden="true" />
              <span className="flex-1">{s.label}</span>
              <span className="text-muted-foreground">{pct}%</span>
              <span className="w-28 text-right font-semibold">{formatCurrency(bucket.value)}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t pt-4 text-sm">
        <span className="text-muted-foreground">
          Total tracked · {STAGES.reduce((sum, s) => sum + (byStatus[s.key]?.quantity || 0), 0).toLocaleString("en-GB")} vouchers
        </span>
        <span className="font-semibold">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function MonthlyBars({ monthly }: { monthly: DashboardStats["monthly"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...monthly.map((m) => m.value), 0);
  const label = (month: string, style: "short" | "long") =>
    new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: style, year: style === "long" ? "numeric" : undefined });

  if (max === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Nothing received in the last 6 months.</p>;
  return (
    <div>
      <div className="relative flex h-48 items-end gap-3 border-b" onMouseLeave={() => setActive(null)}>
        {monthly.map((m, i) => {
          const height = max ? Math.max((m.value / max) * 100, m.value ? 2 : 0) : 0;
          return (
            <button
              key={m.month}
              type="button"
              className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${label(m.month, "long")}: ${formatCurrency(m.value)}, ${m.quantity} vouchers`}
            >
              <span
                className={cn(
                  "w-full max-w-12 rounded-t bg-[#2a78d6] transition-opacity dark:bg-[#3987e5]",
                  active !== null && active !== i && "opacity-40",
                )}
                style={{ height: `${height}%` }}
              />
              {active === i && (
                <span className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-left text-xs shadow-md">
                  <span className="block font-medium">{label(m.month, "long")}</span>
                  <span className="block">{formatCurrency(m.value)}</span>
                  <span className="block text-muted-foreground">{m.quantity} vouchers</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3">
        {monthly.map((m) => (
          <span key={m.month} className="flex-1 text-center text-xs text-muted-foreground">{label(m.month, "short")}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Vouchers received per month</caption>
        <thead><tr><th>Month</th><th>Value</th><th>Vouchers</th></tr></thead>
        <tbody>
          {monthly.map((m) => (
            <tr key={m.month}><td>{label(m.month, "long")}</td><td>{formatCurrency(m.value)}</td><td>{m.quantity}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
