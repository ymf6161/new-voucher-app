import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, CreditCard as Edit2, Trash2, Landmark, Building2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DepositDetailsDialog } from "@/components/deposit-details-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { DataTable, Column, FilterDef } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate, generateDepositReference } from "@/lib/format";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { downloadCSV, formatDepositsForExport } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DepositWithRelations, VoucherWithRelations, VoucherCompany, Bank, Name } from "@shared/schema";

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

export default function Deposits() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<DepositSource | null>(null);
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [bankedAmount, setBankedAmount] = useState("");
  const [depositReference, setDepositReference] = useState(generateDepositReference());
  const [depositNotes, setDepositNotes] = useState("");
  const [deleteDeposit, setDeleteDeposit] = useState<DepositWithRelations | null>(null);
  const [viewDeposit, setViewDeposit] = useState<DepositWithRelations | null>(null);
  const { toast } = useToast();

  const { data: deposits = [], isLoading } = useQuery<DepositWithRelations[]>({
    queryKey: ["/api/deposits"],
  });

  const { data: banks = [] } = useQuery<Bank[]>({
    queryKey: ["/api/banks"],
  });

  const { data: companiesWithPosted = [] } = useQuery<CompanyWithPosted[]>({
    queryKey: ["/api/vouchers/posted-by-company"],
    staleTime: 0,
  });

  const { data: recipientsWithPosted = [] } = useQuery<RecipientWithPosted[]>({
    queryKey: ["/api/vouchers/posted-by-recipient"],
    staleTime: 0,
  });

  const { data: postedVouchers = [] } = useQuery<VoucherWithRelations[]>({
    queryKey: ["/api/vouchers", "posted", selectedSource?.kind, selectedSource?.id],
    queryFn: async () => {
      const filter = selectedSource?.kind === "person" ? `recipientId=${selectedSource.id}` : `companyId=${selectedSource?.id}`;
      const res = await apiRequest("GET", `/api/vouchers?${filter}&status=posted`);
      return res.json();
    },
    enabled: !!selectedSource,
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSource || !selectedBank || selectedVoucherIds.length === 0) return;

      const selectedCompanyIds = Array.from(new Set(
        postedVouchers.filter((v) => selectedVoucherIds.includes(v.id)).map((v) => v.voucherCompanyId),
      ));
      return apiRequest("POST", "/api/deposits", {
        bankId: selectedBank,
        voucherCompanyId: selectedSource.kind === "company"
          ? selectedSource.id
          : selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : null,
        recipientNameId: selectedSource.kind === "person" ? selectedSource.id : null,
        amountBanked: bankedAmount,
        reference: depositReference || null,
        notes: depositNotes || null,
        voucherIds: selectedVoucherIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers/posted-by-company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers/posted-by-recipient"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Deposit recorded",
        description: "The vouchers have been marked as deposited.",
      });
      resetCreateDialog();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to record deposit. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/deposits/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDeleteDeposit(null);
      toast({
        title: "Deposit deleted",
        description: "The deposit has been removed and vouchers marked as posted.",
      });
    },
    onError: (error: any) => {
      console.error('Delete deposit error:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to delete deposit. Please try again.",
        variant: "destructive",
      });
      setDeleteDeposit(null);
    },
  });

  const resetCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setSelectedSource(null);
    setSelectedBank("");
    setSelectedVoucherIds([]);
    setBankedAmount("");
    setDepositReference(generateDepositReference());
    setDepositNotes("");
  };

  const depositFilters: FilterDef<DepositWithRelations>[] = [
    { key: "from", label: "From", type: "select", value: (d) => d.recipient?.name || d.voucherCompany?.name },
    { key: "bank", label: "Bank", type: "select", value: (d) => d.bank?.name },
    { key: "date", label: "Date", type: "dateRange", value: (d) => d.dateDeposited },
  ];

  const columns: Column<DepositWithRelations>[] = [
    {
      key: "dateDeposited",
      header: "Date",
      value: (deposit) => String(deposit.dateDeposited),
      render: (deposit) => formatDate(deposit.dateDeposited),
      className: "whitespace-nowrap",
    },
    {
      key: "reference",
      header: "Reference",
      render: (deposit) => deposit.reference || "-",
    },
    {
      key: "from",
      header: "From",
      value: (deposit) => deposit.recipient?.name || deposit.voucherCompany?.name,
      render: (deposit) => deposit.recipient?.name || deposit.voucherCompany?.name || "-",
    },
    {
      key: "bank",
      header: "Bank",
      value: (deposit) => deposit.bank?.name,
      render: (deposit) => deposit.bank?.name || "-",
    },
    {
      key: "amountBanked",
      header: "Amount",
      value: (deposit) => parseFloat(deposit.amountBanked),
      render: (deposit) => formatCurrency(deposit.amountBanked),
      className: "text-right font-medium",
    },
    {
      key: "notes",
      header: "Notes",
      render: (deposit) => (
        <span className="text-muted-foreground truncate max-w-[200px] block">
          {deposit.notes || "-"}
        </span>
      ),
    },
  ];

  const selectedTotal = postedVouchers
    .filter(v => selectedVoucherIds.includes(v.id))
    .reduce((sum, v) => sum + parseFloat(v.amount) * v.quantity, 0);

  const amountMatch = Math.abs(selectedTotal - parseFloat(bankedAmount || "0")) < 0.01;

  if (!isLoading && deposits.length === 0 && !isCreateDialogOpen) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Deposit Vouchers"
          description="Record voucher deposits to bank accounts"
        >
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-record-deposit">
            <Plus className="h-4 w-4 mr-2" />
            Record Deposit
          </Button>
        </PageHeader>
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Landmark}
              title="No deposits yet"
              description="Record your first deposit to track which vouchers have been banked."
            >
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-record-first-deposit">
                <Plus className="h-4 w-4 mr-2" />
                Record First Deposit
              </Button>
            </EmptyState>
          </CardContent>
        </Card>

        <Dialog open={isCreateDialogOpen} onOpenChange={(open) => !open && resetCreateDialog()}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record Deposit</DialogTitle>
              <DialogDescription>
                Select vouchers that have been deposited to the bank.
              </DialogDescription>
            </DialogHeader>
            <CreateDepositContent
              companiesWithPosted={companiesWithPosted}
              recipientsWithPosted={recipientsWithPosted}
              banks={banks}
              selectedSource={selectedSource}
              setSelectedSource={setSelectedSource}
              selectedBank={selectedBank}
              setSelectedBank={setSelectedBank}
              postedVouchers={postedVouchers}
              selectedVoucherIds={selectedVoucherIds}
              setSelectedVoucherIds={setSelectedVoucherIds}
              bankedAmount={bankedAmount}
              setBankedAmount={setBankedAmount}
              depositReference={depositReference}
              setDepositReference={setDepositReference}
              depositNotes={depositNotes}
              setDepositNotes={setDepositNotes}
              selectedTotal={selectedTotal}
              amountMatch={amountMatch}
              onCancel={resetCreateDialog}
              onSubmit={() => createMutation.mutate()}
              isPending={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deposit Vouchers"
        description="Record voucher deposits to bank accounts"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-record-deposit">
            <Plus className="h-4 w-4 mr-2" />
            Record Deposit
          </Button>
        </div>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            data={deposits}
            columns={columns}
            isLoading={isLoading}
            searchPlaceholder="Search any column..."
            searchFields={["notes"]}
            filters={depositFilters}
            urlStateKey="d"
            summary={(rows) => (
              <span>Total {formatCurrency(rows.reduce((sum, d) => sum + (parseFloat(d.amountBanked) || 0), 0))}</span>
            )}
            toolbar={(rows) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCSV(formatDepositsForExport(rows, banks), "deposits")}
                disabled={rows.length === 0}
                data-testid="button-export-deposits"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV ({rows.length})
              </Button>
            )}
            emptyMessage="No deposits found"
            actions={(deposit) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewDeposit(deposit)}
                  title="View & Edit Deposit"
                  data-testid={`button-view-${deposit.id}`}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteDeposit(deposit)}
                  data-testid={`button-delete-${deposit.id}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => !open && resetCreateDialog()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Deposit</DialogTitle>
            <DialogDescription>
              Select vouchers that have been deposited to the bank.
            </DialogDescription>
          </DialogHeader>
          <CreateDepositContent
            companiesWithPosted={companiesWithPosted}
            recipientsWithPosted={recipientsWithPosted}
            banks={banks}
            selectedSource={selectedSource}
            setSelectedSource={setSelectedSource}
            selectedBank={selectedBank}
            setSelectedBank={setSelectedBank}
            postedVouchers={postedVouchers}
            selectedVoucherIds={selectedVoucherIds}
            setSelectedVoucherIds={setSelectedVoucherIds}
            bankedAmount={bankedAmount}
            setBankedAmount={setBankedAmount}
            depositReference={depositReference}
            setDepositReference={setDepositReference}
            depositNotes={depositNotes}
            setDepositNotes={setDepositNotes}
            selectedTotal={selectedTotal}
            amountMatch={amountMatch}
            onCancel={resetCreateDialog}
            onSubmit={() => createMutation.mutate()}
            isPending={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <DepositDetailsDialog
        deposit={viewDeposit}
        onClose={() => setViewDeposit(null)}
      />

      <AlertDialog open={!!deleteDeposit} onOpenChange={(open) => !open && setDeleteDeposit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deposit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this deposit? Vouchers will be marked as posted again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDeposit && deleteMutation.mutate(deleteDeposit.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface CreateDepositContentProps {
  companiesWithPosted: CompanyWithPosted[];
  recipientsWithPosted: RecipientWithPosted[];
  banks: Bank[];
  selectedSource: DepositSource | null;
  setSelectedSource: (source: DepositSource | null) => void;
  selectedBank: string;
  setSelectedBank: (bankId: string) => void;
  postedVouchers: VoucherWithRelations[];
  selectedVoucherIds: string[];
  setSelectedVoucherIds: (ids: string[]) => void;
  bankedAmount: string;
  setBankedAmount: (amount: string) => void;
  depositReference: string;
  setDepositReference: (ref: string) => void;
  depositNotes: string;
  setDepositNotes: (notes: string) => void;
  selectedTotal: number;
  amountMatch: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

function CreateDepositContent({
  companiesWithPosted,
  recipientsWithPosted,
  banks,
  selectedSource,
  setSelectedSource,
  selectedBank,
  setSelectedBank,
  postedVouchers,
  selectedVoucherIds,
  setSelectedVoucherIds,
  bankedAmount,
  setBankedAmount,
  depositReference,
  setDepositReference,
  depositNotes,
  setDepositNotes,
  selectedTotal,
  amountMatch,
  onCancel,
  onSubmit,
  isPending,
}: CreateDepositContentProps) {
  if (!selectedSource) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose where the money came from to see posted vouchers ready for deposit:
        </p>
        {companiesWithPosted.length === 0 && recipientsWithPosted.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No posted vouchers"
            description="There are no posted vouchers ready for deposit. Create a batch first."
            className="py-8"
          />
        ) : (
          <div className="space-y-4">
            {[
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
                        onClick={() => setSelectedSource({ kind: item.kind, id: item.id, name: item.name })}
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
              ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel} data-testid="button-cancel">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{selectedSource.name}</h3>
          <p className="text-sm text-muted-foreground">
            Select vouchers that have been banked
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSelectedSource(null)}>
          Change
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="bank">Destination Bank *</Label>
          <Select value={selectedBank} onValueChange={setSelectedBank}>
            <SelectTrigger data-testid="select-bank">
              <SelectValue placeholder="Select bank" />
            </SelectTrigger>
            <SelectContent>
              {banks.map((bank) => (
                <SelectItem key={bank.id} value={bank.id}>
                  {bank.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="bankedAmount">Banked Amount *</Label>
          <Input
            id="bankedAmount"
            type="number"
            step="0.01"
            value={bankedAmount}
            onChange={(e) => setBankedAmount(e.target.value)}
            placeholder="0.00"
            data-testid="input-banked-amount"
          />
        </div>
        <div>
          <Label htmlFor="reference">Deposit Reference</Label>
          <Input
            id="reference"
            value={depositReference}
            onChange={(e) => setDepositReference(e.target.value)}
            data-testid="input-deposit-reference"
          />
        </div>
        <div>
          <Label>Selected Total</Label>
          <div
            className={`h-9 flex items-center px-3 rounded-md font-semibold ${
              bankedAmount && !amountMatch
                ? "bg-destructive/10 text-destructive"
                : "bg-muted"
            }`}
            data-testid="text-selected-total"
          >
            {formatCurrency(selectedTotal)}
            {bankedAmount && !amountMatch && (
              <span className="ml-2 text-xs">
                (Mismatch: {formatCurrency(Math.abs(selectedTotal - parseFloat(bankedAmount)))})
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="border rounded-md max-h-[300px] overflow-y-auto">
        <div className="p-3 border-b bg-muted/50 flex items-center gap-2">
          <Checkbox
            checked={selectedVoucherIds.length === postedVouchers.length && postedVouchers.length > 0}
            onCheckedChange={(checked) => {
              if (checked) {
                setSelectedVoucherIds(postedVouchers.map(v => v.id));
              } else {
                setSelectedVoucherIds([]);
              }
            }}
            data-testid="checkbox-select-all-vouchers"
          />
          <span className="text-sm font-medium">Select All ({postedVouchers.length})</span>
        </div>
        {postedVouchers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No posted vouchers here
          </div>
        ) : (
          postedVouchers.map((voucher) => (
            <div
              key={voucher.id}
              className="p-3 border-b last:border-0 flex items-center gap-3 hover:bg-muted/30"
            >
              <Checkbox
                checked={selectedVoucherIds.includes(voucher.id)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedVoucherIds([...selectedVoucherIds, voucher.id]);
                  } else {
                    setSelectedVoucherIds(selectedVoucherIds.filter(id => id !== voucher.id));
                  }
                }}
                data-testid={`checkbox-voucher-${voucher.id}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">#{voucher.voucherNumber || "N/A"}</span>
                  <span className="text-muted-foreground">{voucher.type}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(voucher.dateReceived)}
                  {selectedSource.kind === "person" && voucher.voucherCompany && ` • ${voucher.voucherCompany.name}`}
                  {voucher.receivedFrom && ` • ${voucher.receivedFrom.name}`}
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium">{formatCurrency(voucher.amount)}</div>
                {voucher.quantity > 1 && (
                  <div className="text-xs text-muted-foreground">x{voucher.quantity}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div>
        <Label htmlFor="notes">Notes (Optional)</Label>
        <Textarea
          id="notes"
          value={depositNotes}
          onChange={(e) => setDepositNotes(e.target.value)}
          placeholder="Add any notes about this deposit..."
          className="resize-none"
          data-testid="input-deposit-notes"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onCancel} data-testid="button-cancel">
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={
            selectedVoucherIds.length === 0 ||
            !selectedBank ||
            !bankedAmount ||
            !amountMatch ||
            isPending
          }
          data-testid="button-record-deposit-submit"
        >
          {isPending ? "Recording..." : "Record Deposit"}
        </Button>
      </div>
    </div>
  );
}
