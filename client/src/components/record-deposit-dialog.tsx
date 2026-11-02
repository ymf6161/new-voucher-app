import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, type Column, type FilterDef } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDate, generateDepositReference } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import type { Bank, BatchWithRelations, Name, VoucherCompany, VoucherWithRelations } from "@shared/schema";

interface CompanyWithPosted {
  company: VoucherCompany;
  voucherCount: number;
  totalQuantity?: number;
  totalAmount: number;
}

interface RecipientWithPosted {
  recipient: Name;
  voucherCount: number;
  totalQuantity: number;
  totalAmount: number;
}

/** Deposits bank posted vouchers either per voucher company or per person they were posted to. */
interface DepositSource {
  kind: "company" | "person";
  id: string;
  name: string;
}

const today = () => new Date().toISOString().slice(0, 10);
/** Money in whole pence, so totals and differences add up exactly. */
const pence = (value: number | string) => Math.round((typeof value === "string" ? parseFloat(value) : value) * 100);

export function RecordDepositDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [source, setSource] = useState<DepositSource | null>(null);
  const [bankId, setBankId] = useState("");
  const [dateBanked, setDateBanked] = useState(today());
  const [reference, setReference] = useState(generateDepositReference());
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** How many of a multi-voucher line to bank; lines not listed are banked in full. */
  const [bankQty, setBankQty] = useState<Record<string, number>>({});
  const [bankedAmount, setBankedAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const reset = () => {
    setSource(null);
    setBankId("");
    setDateBanked(today());
    setReference(generateDepositReference());
    setNotes("");
    setSelectedIds([]);
    setBankQty({});
    setBankedAmount("");
    setAmountEdited(false);
    setAdjustmentReason("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const { data: companiesWithPosted = [] } = useQuery<CompanyWithPosted[]>({
    queryKey: ["/api/vouchers/posted-by-company"],
    enabled: open,
    staleTime: 0,
  });
  const { data: recipientsWithPosted = [] } = useQuery<RecipientWithPosted[]>({
    queryKey: ["/api/vouchers/posted-by-recipient"],
    enabled: open,
    staleTime: 0,
  });
  const { data: banks = [] } = useQuery<Bank[]>({ queryKey: ["/api/banks"], enabled: open });
  const { data: batches = [] } = useQuery<BatchWithRelations[]>({ queryKey: ["/api/batches"], enabled: open });
  const { data: vouchers = [], isLoading: vouchersLoading } = useQuery<VoucherWithRelations[]>({
    queryKey: ["/api/vouchers", "posted", source?.kind, source?.id],
    queryFn: async () => {
      const filter = source?.kind === "person" ? `recipientId=${source.id}` : `companyId=${source?.id}`;
      return (await apiRequest("GET", `/api/vouchers?${filter}&status=posted`)).json();
    },
    enabled: open && !!source,
    staleTime: 0,
  });

  const batchRef = useMemo(() => Object.fromEntries(batches.map((b) => [b.id, b.reference])), [batches]);
  const qtyFor = (v: VoucherWithRelations) => (selectedIds.includes(v.id) ? bankQty[v.id] ?? v.quantity : 0);

  const selected = vouchers.filter((v) => selectedIds.includes(v.id));
  const selectedQty = selected.reduce((sum, v) => sum + qtyFor(v), 0);
  const selectedPence = selected.reduce((sum, v) => sum + pence(v.amount) * qtyFor(v), 0);
  const bankedPence = bankedAmount === "" || isNaN(parseFloat(bankedAmount)) ? null : pence(bankedAmount);
  const differencePence = bankedPence === null ? 0 : bankedPence - selectedPence;

  // The banked amount follows the vouchers chosen until it is typed over.
  useEffect(() => {
    if (!amountEdited) setBankedAmount(selectedPence ? (selectedPence / 100).toFixed(2) : "");
  }, [selectedPence, amountEdited]);

  useEffect(() => {
    if (open && !bankId) {
      const active = banks.filter((b) => !b.isArchived);
      if (active.length === 1) setBankId(active[0].id);
    }
  }, [open, bankId, banks]);

  const setLineQty = (v: VoucherWithRelations, raw: string) => {
    const n = Math.max(1, Math.min(v.quantity, Math.floor(Number(raw) || 1)));
    setBankQty((prev) => ({ ...prev, [v.id]: n }));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!source) return;
      const companyIds = Array.from(new Set(selected.map((v) => v.voucherCompanyId)));
      const quantities = Object.fromEntries(
        selected.filter((v) => qtyFor(v) < v.quantity).map((v) => [v.id, qtyFor(v)]),
      );
      return apiRequest("POST", "/api/deposits", {
        bankId,
        voucherCompanyId: source.kind === "company" ? source.id : companyIds.length === 1 ? companyIds[0] : null,
        recipientNameId: source.kind === "person" ? source.id : null,
        dateDeposited: dateBanked,
        amountBanked: (bankedPence! / 100).toFixed(2),
        adjustmentAmount: differencePence ? (differencePence / 100).toFixed(2) : null,
        adjustmentReason: differencePence ? adjustmentReason.trim() : null,
        reference: reference || null,
        notes: notes || null,
        voucherIds: selectedIds,
        quantities,
      });
    },
    onSuccess: () => {
      for (const key of ["/api/deposits", "/api/vouchers", "/api/vouchers/posted-by-company", "/api/vouchers/posted-by-recipient", "/api/batches", "/api/dashboard/stats"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast({ title: "Deposit recorded", description: `${selectedQty} voucher(s) banked.` });
      close();
    },
    onError: (error: any) => {
      toast({ title: "Could not record deposit", description: error?.message?.replace(/^\d+: /, ""), variant: "destructive" });
    },
  });

  const canSave =
    selectedIds.length > 0 &&
    !!bankId &&
    !!dateBanked &&
    bankedPence !== null &&
    bankedPence >= 0 &&
    (differencePence === 0 || adjustmentReason.trim().length > 0) &&
    !mutation.isPending;

  // ---------- step 1: where the money came from ----------
  const sourcePicker = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Choose where the money came from to see posted vouchers ready to bank:</p>
      {companiesWithPosted.length === 0 && recipientsWithPosted.length === 0 ? (
        <EmptyState icon={Building2} title="No posted vouchers" description="There are no posted vouchers ready to bank. Create a batch first." className="py-8" />
      ) : (
        [
          {
            title: "Voucher companies",
            items: companiesWithPosted.map((c) => ({ kind: "company" as const, id: c.company.id, name: c.company.name, qty: c.totalQuantity ?? c.voucherCount, total: c.totalAmount })),
          },
          {
            title: "People",
            items: recipientsWithPosted.map((r) => ({ kind: "person" as const, id: r.recipient.id, name: r.recipient.name, qty: r.totalQuantity, total: r.totalAmount })),
          },
        ]
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <div key={group.title} className="space-y-2">
              <h4 className="text-sm font-medium">{group.title}</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    className="flex items-center justify-between rounded-md border p-3 text-left hover:bg-muted/50"
                    onClick={() => setSource({ kind: item.kind, id: item.id, name: item.name })}
                    data-testid={`card-${item.kind}-${item.id}`}
                  >
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">Qty {item.qty}</div>
                    </div>
                    <span className="font-medium">{formatCurrency(item.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  );

  // ---------- step 2: choose vouchers ----------
  const columns: Column<VoucherWithRelations>[] = [
    { key: "dateReceived", header: "Received", value: (v) => String(v.dateReceived), render: (v) => formatDate(v.dateReceived), className: "whitespace-nowrap" },
    { key: "voucherNumber", header: "Voucher no.", value: (v) => v.voucherNumber || "", render: (v) => v.voucherNumber || "-" },
    ...(source?.kind === "person"
      ? [{ key: "company", header: "Company", value: (v: VoucherWithRelations) => v.voucherCompany?.name || "", render: (v: VoucherWithRelations) => v.voucherCompany?.name || "-" } as Column<VoucherWithRelations>]
      : []),
    { key: "type", header: "Type" },
    { key: "receivedFrom", header: "Received from", value: (v) => v.receivedFrom?.name || "", render: (v) => v.receivedFrom?.name || "-" },
    { key: "reference", header: "Reference", value: (v) => v.reference?.reference || "", render: (v) => v.reference?.reference || "-" },
    { key: "batch", header: "Batch", value: (v) => (v.batchId && batchRef[v.batchId]) || "", render: (v) => (v.batchId && batchRef[v.batchId]) || "-" },
    { key: "amount", header: "Amount", value: (v) => parseFloat(v.amount), render: (v) => formatCurrency(v.amount), className: "text-right" },
    { key: "quantity", header: "Qty", value: (v) => v.quantity, className: "text-right" },
    {
      key: "bank",
      header: "Bank qty",
      sortable: false,
      className: "text-right",
      render: (v) =>
        !selectedIds.includes(v.id) ? (
          <span className="text-muted-foreground">-</span>
        ) : v.quantity > 1 ? (
          <Input
            type="number"
            min={1}
            max={v.quantity}
            value={qtyFor(v)}
            onChange={(e) => setLineQty(v, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="ml-auto h-8 w-16 text-right"
            aria-label={`How many of voucher ${v.voucherNumber || ""} to bank`}
            data-testid={`input-bank-qty-${v.id}`}
          />
        ) : (
          "1"
        ),
    },
    {
      key: "value",
      header: "Value",
      value: (v) => parseFloat(v.amount) * v.quantity,
      render: (v) => formatCurrency((pence(v.amount) * (selectedIds.includes(v.id) ? qtyFor(v) : v.quantity)) / 100),
      className: "text-right font-medium",
    },
  ];

  const filters: FilterDef<VoucherWithRelations>[] = [
    { key: "batch", label: "Batch", type: "select", value: (v) => (v.batchId && batchRef[v.batchId]) || undefined },
    { key: "receivedFrom", label: "Received from", type: "select", value: (v) => v.receivedFrom?.name },
    { key: "reference", label: "Reference", type: "select", value: (v) => v.reference?.reference },
    ...(source?.kind === "person" ? [{ key: "company", label: "Company", type: "select", value: (v: VoucherWithRelations) => v.voucherCompany?.name } as FilterDef<VoucherWithRelations>] : []),
    { key: "type", label: "Type", type: "select", value: (v) => v.type },
    { key: "amount", label: "Amount", type: "numberRange", value: (v) => parseFloat(v.amount) },
    { key: "received", label: "Received", type: "dateRange", value: (v) => v.dateReceived },
  ];

  const voucherStep = source && (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{source.name}</h3>
          <p className="text-sm text-muted-foreground">Tick the vouchers that were banked. For a line of several vouchers you can bank only some.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setSource(null); setSelectedIds([]); setBankQty({}); }}>
          Change
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="date-banked">Date banked *</Label>
          <Input id="date-banked" type="date" value={dateBanked} max={today()} onChange={(e) => setDateBanked(e.target.value)} data-testid="input-date-banked" />
        </div>
        <div className="space-y-1">
          <Label>Bank account *</Label>
          <Select value={bankId} onValueChange={setBankId}>
            <SelectTrigger data-testid="select-bank"><SelectValue placeholder="Select bank" /></SelectTrigger>
            <SelectContent>
              {banks.filter((b) => !b.isArchived).map((bank) => (
                <SelectItem key={bank.id} value={bank.id}>{bank.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="deposit-reference">Reference</Label>
          <Input id="deposit-reference" value={reference} onChange={(e) => setReference(e.target.value)} data-testid="input-deposit-reference" />
        </div>
      </div>

      <DataTable
        data={vouchers}
        columns={columns}
        isLoading={vouchersLoading}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={(ids) => {
          setSelectedIds(ids);
          // Forget part-quantities of lines that are no longer ticked.
          setBankQty((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => ids.includes(id))));
        }}
        searchPlaceholder="Search voucher no., person, reference, batch, amount..."
        searchFields={["notes", "accountNumber"]}
        filters={filters}
        summary={(rows) => (
          <span>
            Showing {rows.length} line(s), {rows.reduce((s, v) => s + v.quantity, 0)} voucher(s),{" "}
            {formatCurrency(rows.reduce((s, v) => s + pence(v.amount) * v.quantity, 0) / 100)}
          </span>
        )}
        emptyMessage="No posted vouchers here"
      />

      <div className="grid gap-4 rounded-md border bg-muted/30 p-4 sm:grid-cols-3">
        <div>
          <Label className="text-xs text-muted-foreground">Vouchers ticked</Label>
          <p className="text-lg font-semibold" data-testid="text-selected-total">
            {formatCurrency(selectedPence / 100)}
          </p>
          <p className="text-xs text-muted-foreground">{selectedQty} voucher(s) on {selectedIds.length} line(s)</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="banked-amount">Amount banked *</Label>
          <Input
            id="banked-amount"
            type="number"
            step="0.01"
            min="0"
            value={bankedAmount}
            onChange={(e) => {
              setAmountEdited(true);
              setBankedAmount(e.target.value);
            }}
            data-testid="input-banked-amount"
          />
          {amountEdited && differencePence !== 0 && (
            <button type="button" className="text-xs text-primary underline" onClick={() => setAmountEdited(false)}>
              Use voucher total
            </button>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Difference</Label>
          <p className={`text-lg font-semibold ${differencePence ? "text-amber-600" : "text-emerald-600"}`} data-testid="text-difference">
            {differencePence > 0 ? "+" : ""}
            {formatCurrency(differencePence / 100)}
          </p>
          <p className="text-xs text-muted-foreground">{differencePence ? "Recorded as an adjustment" : "Matches the vouchers"}</p>
        </div>
      </div>

      {differencePence !== 0 && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            Adjustment of {differencePence > 0 ? "+" : ""}{formatCurrency(differencePence / 100)}
          </div>
          <Label htmlFor="adjustment-reason">Reason *</Label>
          <Input
            id="adjustment-reason"
            value={adjustmentReason}
            onChange={(e) => setAdjustmentReason(e.target.value)}
            placeholder="e.g. Bank fee, commission, short paid"
            data-testid="input-adjustment-reason"
          />
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="deposit-notes">Notes</Label>
        <Textarea id="deposit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this deposit..." className="resize-none" data-testid="input-deposit-notes" />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Deposit</DialogTitle>
          <DialogDescription>Record posted vouchers that have been paid into the bank.</DialogDescription>
        </DialogHeader>
        {source ? voucherStep : sourcePicker}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={close} data-testid="button-cancel">Cancel</Button>
          {source && (
            <Button onClick={() => mutation.mutate()} disabled={!canSave} data-testid="button-record-deposit-submit">
              {mutation.isPending ? "Recording..." : `Record deposit of ${bankedPence === null ? "—" : formatCurrency(bankedPence / 100)}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
