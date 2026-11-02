import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, ChevronRight, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { AutoCompleteDropdown } from "@/components/auto-complete-dropdown";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Bank, BatchWithRelations, Name, VoucherCompany, VoucherWithRelations } from "@shared/schema";

interface CompanyWithUnposted {
  company: VoucherCompany;
  voucherCount: number;
  totalQuantity?: number;
  totalAmount: number;
}

type RecipientKind = "company" | "person";
type Step = "recipient" | "select" | "confirm";
type GroupKey = "type" | "amount" | "reference" | "receivedFrom";

const GROUP_KEYS: { key: GroupKey; label: string }[] = [
  { key: "type", label: "Type" },
  { key: "amount", label: "Amount" },
  { key: "reference", label: "Reference" },
  { key: "receivedFrom", label: "Received from" },
];

export function lineTotal(voucher: { amount: string | number; quantity: number }): number {
  return (parseFloat(String(voucher.amount)) || 0) * (voucher.quantity || 0);
}

function groupValue(voucher: VoucherWithRelations, key: GroupKey): string {
  switch (key) {
    case "type":
      return voucher.type;
    case "amount":
      return formatCurrency(voucher.amount);
    case "reference":
      return voucher.reference?.reference || "No reference";
    case "receivedFrom":
      return voucher.receivedFrom?.name || "No name";
  }
}

export interface VoucherLine {
  key: string;
  labels: string[];
  vouchers: VoucherWithRelations[];
  quantity: number;
  total: number;
}

export interface CompanySection {
  companyId: string;
  companyName: string;
  lines: VoucherLine[];
  quantity: number;
  total: number;
}

/** Aggregate vouchers into company sections, each split into lines by the chosen keys. */
export function aggregateVouchers(
  vouchers: VoucherWithRelations[],
  keys: GroupKey[],
): CompanySection[] {
  const sections = new Map<string, CompanySection>();
  vouchers.forEach((voucher) => {
    const companyId = voucher.voucherCompanyId;
    let section = sections.get(companyId);
    if (!section) {
      section = { companyId, companyName: voucher.voucherCompany?.name || "Unknown company", lines: [], quantity: 0, total: 0 };
      sections.set(companyId, section);
    }
    const labels = keys.map((key) => groupValue(voucher, key));
    const lineKey = `${companyId}|${labels.join("|")}`;
    let line = section.lines.find((l) => l.key === lineKey);
    if (!line) {
      line = { key: lineKey, labels, vouchers: [], quantity: 0, total: 0 };
      section.lines.push(line);
    }
    line.vouchers.push(voucher);
    line.quantity += voucher.quantity || 0;
    line.total += lineTotal(voucher);
    section.quantity += voucher.quantity || 0;
    section.total += lineTotal(voucher);
  });
  const compare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  return Array.from(sections.values())
    .sort((a, b) => compare(a.companyName, b.companyName))
    .map((section) => ({ ...section, lines: section.lines.sort((a, b) => compare(a.labels.join(" "), b.labels.join(" "))) }));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface BatchEditorProps {
  open: boolean;
  /** The batch to edit, or null to create a new one. */
  batch: BatchWithRelations | null;
  onClose: () => void;
}

export function BatchEditor({ open, batch, onClose }: BatchEditorProps) {
  const { toast } = useToast();
  const isEdit = !!batch;

  const [step, setStep] = useState<Step>("recipient");
  const [kind, setKind] = useState<RecipientKind>("company");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupKeys, setGroupKeys] = useState<GroupKey[]>(["type", "amount", "reference", "receivedFrom"]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reference, setReference] = useState("");
  const [referenceTouched, setReferenceTouched] = useState(false);
  const [batchDate, setBatchDate] = useState(today());
  const [bankId, setBankId] = useState("");
  const [notes, setNotes] = useState("");
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  const { data: companiesWithUnposted = [], isLoading: companiesLoading, error: companiesError } = useQuery<CompanyWithUnposted[]>({
    queryKey: ["/api/vouchers/unposted-by-company"],
    enabled: open,
    staleTime: 0,
  });
  const { data: names = [] } = useQuery<Name[]>({ queryKey: ["/api/names"], enabled: open });
  const { data: banks = [] } = useQuery<Bank[]>({ queryKey: ["/api/banks"], enabled: open });
  const { data: nextReference } = useQuery<{ reference: string }>({
    queryKey: ["/api/batches/next-reference", open],
    queryFn: async () => (await apiRequest("GET", "/api/batches/next-reference")).json(),
    enabled: open && !isEdit,
    staleTime: 0,
  });
  const companyKey = [...companyIds].sort().join(",");
  const { data: unposted = [], isLoading: vouchersLoading } = useQuery<VoucherWithRelations[]>({
    queryKey: ["/api/vouchers", "unposted", companyKey],
    queryFn: async () => (await apiRequest("GET", `/api/vouchers?status=unposted&companyId=${companyKey}`)).json(),
    enabled: open && companyIds.length > 0,
    staleTime: 0,
  });
  const { data: batchVouchers = [], isFetched: batchVouchersFetched } = useQuery<VoucherWithRelations[]>({
    queryKey: ["/api/vouchers", "batch", batch?.id, "forEdit"],
    queryFn: async () => (await apiRequest("GET", `/api/vouchers?batchId=${batch!.id}`)).json(),
    enabled: open && isEdit,
    staleTime: 0,
  });

  const activeBanks = banks.filter((b) => !b.isArchived);

  // Reset when the dialog opens for a new batch.
  useEffect(() => {
    if (!open || isEdit || initializedFor === "new") return;
    setStep("recipient");
    setKind("company");
    setCompanyIds([]);
    setRecipientId("");
    setRecipientLabel("");
    setSelectedIds([]);
    setExpanded(new Set());
    setReference("");
    setReferenceTouched(false);
    setBatchDate(today());
    setBankId("");
    setNotes("");
    setInitializedFor("new");
  }, [open, isEdit, initializedFor]);

  // Load an existing batch into the editor.
  useEffect(() => {
    if (!open || !batch || initializedFor === batch.id || !batchVouchersFetched) return;
    const ids = Array.from(new Set(batchVouchers.map((v) => v.voucherCompanyId)));
    if (batch.recipientNameId) {
      setKind("person");
      setRecipientId(batch.recipientNameId);
      setRecipientLabel(batch.recipient?.name || "");
    } else {
      setKind("company");
    }
    setCompanyIds(ids.length ? ids : batch.voucherCompanyId ? [batch.voucherCompanyId] : []);
    setSelectedIds(batchVouchers.map((v) => v.id));
    setReference(batch.reference || "");
    setReferenceTouched(true);
    setBatchDate(String(batch.batchDate || batch.dateSent).slice(0, 10));
    setBankId(batch.bankId || "");
    setNotes(batch.notes || "");
    setStep("select");
    setInitializedFor(batch.id);
  }, [open, batch, batchVouchers, batchVouchersFetched, initializedFor]);

  useEffect(() => {
    if (open && !isEdit && nextReference?.reference && !referenceTouched) setReference(nextReference.reference);
  }, [open, isEdit, nextReference?.reference, referenceTouched]);

  useEffect(() => {
    if (open && !bankId && activeBanks.length > 0) setBankId(activeBanks[0].id);
  }, [open, bankId, activeBanks]);

  const available = useMemo(() => {
    const byId = new Map<string, VoucherWithRelations>();
    batchVouchers.forEach((v) => byId.set(v.id, v));
    unposted.forEach((v) => byId.set(v.id, v));
    return Array.from(byId.values()).filter((v) => companyIds.includes(v.voucherCompanyId));
  }, [batchVouchers, unposted, companyIds]);

  const sections = useMemo(() => aggregateVouchers(available, groupKeys), [available, groupKeys]);
  const selected = available.filter((v) => selectedIds.includes(v.id));
  const selectedSections = useMemo(() => aggregateVouchers(selected, groupKeys), [selected, groupKeys]);
  const selectedQty = selected.reduce((sum, v) => sum + (v.quantity || 0), 0);
  const selectedTotal = selected.reduce((sum, v) => sum + lineTotal(v), 0);

  const toggleIds = (ids: string[]) => {
    const allOn = ids.every((id) => selectedIds.includes(id));
    setSelectedIds(allOn ? selectedIds.filter((id) => !ids.includes(id)) : Array.from(new Set([...selectedIds, ...ids])));
  };

  const close = () => {
    setInitializedFor(null);
    onClose();
  };

  const createNameMutation = useMutation({
    mutationFn: async (name: string) => (await apiRequest("POST", "/api/names", { name })).json() as Promise<Name>,
    onSuccess: (name) => {
      queryClient.invalidateQueries({ queryKey: ["/api/names"] });
      setRecipientId(name.id);
      setRecipientLabel(name.name);
    },
    onError: (error: any) => toast({ title: "Could not add name", description: error?.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const voucherCompanyId = kind === "company" || companyIds.length === 1 ? companyIds[0] : null;
      const recipientNameId = kind === "person" ? recipientId : null;
      const payload = {
        voucherCompanyId,
        recipientNameId,
        reference: reference.trim(),
        batchDate,
        amountSent: selectedTotal.toFixed(2),
        notes: notes || null,
        bankId,
      };
      if (!batch) {
        await apiRequest("POST", "/api/batches", { ...payload, status: "pending", voucherIds: selectedIds });
        return;
      }
      // Details and voucher list are saved together in one transaction.
      await apiRequest("PATCH", `/api/batches/${batch.id}`, { ...payload, voucherIds: selectedIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers/unposted-by-company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: isEdit ? "Batch updated" : "Batch created", description: isEdit ? undefined : "Saved as pending." });
      close();
    },
    onError: (error: any) => toast({ title: "Could not save batch", description: error?.message, variant: "destructive" }),
  });

  const recipientReady = kind === "company" ? companyIds.length === 1 : !!recipientId && companyIds.length > 0;
  const recipientName =
    kind === "person"
      ? recipientLabel
      : companiesWithUnposted.find((c) => c.company.id === companyIds[0])?.company.name ||
        batch?.voucherCompany?.name ||
        "";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit batch ${batch?.reference}` : "Post vouchers"}</DialogTitle>
          <DialogDescription>
            {step === "recipient" && "Choose who the vouchers are going to."}
            {step === "select" && `Sending to ${recipientName}. Pick the vouchers to include.`}
            {step === "confirm" && "Check the batch before saving."}
          </DialogDescription>
        </DialogHeader>

        {step === "recipient" && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Send to">
              {([
                { value: "company", icon: Building2, title: "A voucher company", text: "Post one company's vouchers to that company." },
                { value: "person", icon: User, title: "A person", text: "Someone takes vouchers from one or more companies (e.g. for cash)." },
              ] as const).map(({ value, icon: Icon, title, text }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  onClick={() => {
                    setKind(value);
                    setCompanyIds([]);
                  }}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    kind === value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                  data-testid={`recipient-kind-${value}`}
                >
                  <div className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4" />{title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{text}</p>
                </button>
              ))}
            </div>

            {kind === "person" && (
              <div className="space-y-1">
                <Label>Recipient</Label>
                <AutoCompleteDropdown
                  value={recipientId}
                  displayValue={recipientLabel}
                  options={names.map((n) => ({ id: n.id, label: n.name }))}
                  placeholder="Type a name, or add a new one..."
                  onValueChange={(label, id) => {
                    setRecipientLabel(label);
                    setRecipientId(id);
                  }}
                  onCreateNew={async (name) => {
                    await createNameMutation.mutateAsync(name);
                  }}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>{kind === "company" ? "Voucher company" : "Companies to include"}</Label>
              {companiesLoading ? (
                <p className="text-sm text-muted-foreground">Loading companies...</p>
              ) : companiesError ? (
                <EmptyState icon={Building2} title="Could not load companies" description={(companiesError as Error).message} className="py-6" />
              ) : companiesWithUnposted.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title="No vouchers ready to post"
                  description="Only unposted vouchers that aren't already in a batch appear here."
                  className="py-6"
                />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {companiesWithUnposted.map(({ company, totalQuantity, voucherCount, totalAmount }) => {
                    const checked = companyIds.includes(company.id);
                    return (
                      <button
                        key={company.id}
                        type="button"
                        onClick={() =>
                          setCompanyIds(
                            kind === "company"
                              ? [company.id]
                              : checked
                                ? companyIds.filter((id) => id !== company.id)
                                : [...companyIds, company.id],
                          )
                        }
                        className={cn(
                          "flex items-center gap-3 rounded-md border p-3 text-left transition-colors",
                          checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                        )}
                        data-testid={`card-company-${company.id}`}
                      >
                        {kind === "person" && <Checkbox checked={checked} tabIndex={-1} aria-hidden />}
                        <div className="flex-1">
                          <div className="font-medium">{company.name}</div>
                          <div className="text-xs text-muted-foreground">Qty {totalQuantity ?? voucherCount}</div>
                        </div>
                        <div className="font-medium">{formatCurrency(totalAmount)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={() => setStep("select")} disabled={!recipientReady} data-testid="button-next-select">
                Next: choose vouchers
              </Button>
            </div>
          </div>
        )}

        {step === "select" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="batch-date">Batch date</Label>
                <Input id="batch-date" type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="batch-reference">Batch number</Label>
                <Input
                  id="batch-reference"
                  value={reference}
                  onChange={(e) => {
                    setReferenceTouched(true);
                    setReference(e.target.value);
                  }}
                  data-testid="input-batch-reference"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="batch-bank">Remit to bank account</Label>
                <Select value={bankId} onValueChange={setBankId}>
                  <SelectTrigger id="batch-bank"><SelectValue placeholder="Select bank..." /></SelectTrigger>
                  <SelectContent>
                    {activeBanks.map((bank) => <SelectItem key={bank.id} value={bank.id}>{bank.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 p-3">
                <span className="text-sm font-medium">Group by:</span>
                {GROUP_KEYS.map(({ key, label }) => {
                  const on = groupKeys.includes(key);
                  return (
                    <Button
                      key={key}
                      type="button"
                      size="sm"
                      variant={on ? "secondary" : "outline"}
                      aria-pressed={on}
                      onClick={() =>
                        setGroupKeys(on ? groupKeys.filter((k) => k !== key) : GROUP_KEYS.map((g) => g.key).filter((k) => k === key || groupKeys.includes(k)))
                      }
                      data-testid={`group-${key}`}
                    >
                      {label}
                    </Button>
                  );
                })}
                <div className="ml-auto flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds(available.map((v) => v.id))} data-testid="button-select-all-vouchers">
                    Select all
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds([])}>Clear</Button>
                </div>
              </div>

              {vouchersLoading && available.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Loading vouchers...</p>
              ) : available.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No unposted vouchers for the chosen companies.</p>
              ) : (
                <div className="max-h-[45vh] overflow-y-auto">
                  {sections.map((section) => {
                    const sectionIds = section.lines.flatMap((l) => l.vouchers.map((v) => v.id));
                    const sectionSelected = sectionIds.filter((id) => selectedIds.includes(id)).length;
                    return (
                      <div key={section.companyId} className="border-b last:border-0" data-testid={`section-${section.companyId}`}>
                        <div className="flex items-center gap-3 bg-muted/30 px-3 py-2">
                          <Checkbox
                            checked={sectionSelected === sectionIds.length ? true : sectionSelected > 0 ? "indeterminate" : false}
                            onCheckedChange={() => toggleIds(sectionIds)}
                            aria-label={`Select all ${section.companyName}`}
                          />
                          <span className="flex-1 font-semibold">{section.companyName}</span>
                          <span className="w-20 text-right text-sm text-muted-foreground">Qty {section.quantity}</span>
                          <span className="w-28 text-right font-semibold">{formatCurrency(section.total)}</span>
                        </div>
                        {section.lines.map((line) => {
                          const ids = line.vouchers.map((v) => v.id);
                          const lineSelected = ids.filter((id) => selectedIds.includes(id)).length;
                          const isOpen = expanded.has(line.key);
                          return (
                            <div key={line.key} className="border-t" data-testid="voucher-line">
                              <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                                <Checkbox
                                  checked={lineSelected === ids.length ? true : lineSelected > 0 ? "indeterminate" : false}
                                  onCheckedChange={() => toggleIds(ids)}
                                  aria-label={`Select ${line.labels.join(" ")}`}
                                />
                                <button
                                  type="button"
                                  className="flex flex-1 items-center gap-2 text-left text-sm"
                                  onClick={() => {
                                    const next = new Set(expanded);
                                    if (isOpen) next.delete(line.key);
                                    else next.add(line.key);
                                    setExpanded(next);
                                  }}
                                  aria-expanded={isOpen}
                                >
                                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                  <span className="flex flex-wrap gap-x-3">
                                    {line.labels.length > 0 ? line.labels.map((label, i) => <span key={i}>{label}</span>) : <span>All vouchers</span>}
                                  </span>
                                </button>
                                <span className="w-20 text-right text-sm" data-testid="line-qty">Qty {line.quantity}</span>
                                <span className="w-28 text-right font-medium">{formatCurrency(line.total)}</span>
                              </div>
                              {isOpen && (
                                <div className="bg-muted/20">
                                  {line.vouchers.map((voucher) => (
                                    <label key={voucher.id} className="flex cursor-pointer items-center gap-3 border-t py-1.5 pl-12 pr-3 text-xs">
                                      <Checkbox checked={selectedIds.includes(voucher.id)} onCheckedChange={() => toggleIds([voucher.id])} />
                                      <span className="w-24">{formatDate(voucher.dateReceived)}</span>
                                      <span className="w-24 font-medium">#{voucher.voucherNumber || "N/A"}</span>
                                      <span className="flex-1 truncate text-muted-foreground">
                                        {[voucher.receivedFrom?.name, voucher.reference?.reference, voucher.notes].filter(Boolean).join(" · ")}
                                      </span>
                                      <span className="w-16 text-right">Qty {voucher.quantity}</span>
                                      <span className="w-24 text-right">{formatCurrency(lineTotal(voucher))}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/50 p-3">
              <span className="text-sm font-medium">Selected</span>
              <span className="text-lg font-semibold" data-testid="text-selected-total">
                Qty {selectedQty} · {formatCurrency(selectedTotal)}
              </span>
            </div>

            <div className="space-y-1">
              <Label htmlFor="batch-notes">Notes (optional)</Label>
              <Textarea id="batch-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" data-testid="input-batch-notes" />
            </div>

            <div className="flex justify-between gap-2">
              {isEdit ? <span /> : <Button variant="outline" onClick={() => setStep("recipient")}>Back</Button>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button
                  onClick={() => setStep("confirm")}
                  disabled={selectedIds.length === 0 || !bankId || !reference.trim() || !batchDate}
                  data-testid="button-review-batch"
                >
                  Review
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Send to", recipientName],
                ["Batch number", reference],
                ["Batch date", formatDate(batchDate)],
                ["Remit account", banks.find((b) => b.id === bankId)?.name || "-"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 font-medium">{value}</div>
                </div>
              ))}
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-md border">
              {selectedSections.map((section) => (
                <div key={section.companyId} className="border-b last:border-0">
                  <div className="flex justify-between bg-muted/30 px-3 py-2 font-semibold">
                    <span>{section.companyName}</span>
                    <span>Qty {section.quantity} · {formatCurrency(section.total)}</span>
                  </div>
                  {section.lines.map((line) => (
                    <div key={line.key} className="flex justify-between border-t px-3 py-1.5 text-sm">
                      <span className="flex flex-wrap gap-x-3">{line.labels.map((l, i) => <span key={i}>{l}</span>)}</span>
                      <span>Qty {line.quantity} · {formatCurrency(line.total)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/50 p-3">
              <span className="text-sm font-medium">Total ({selectedSections.length} compan{selectedSections.length === 1 ? "y" : "ies"})</span>
              <span className="text-lg font-semibold" data-testid="text-confirm-total">Qty {selectedQty} · {formatCurrency(selectedTotal)}</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("select")} data-testid="button-back-to-edit-batch">Back</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-create-batch-submit">
                {saveMutation.isPending ? "Saving..." : isEdit ? "Save changes" : "Create pending batch"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
