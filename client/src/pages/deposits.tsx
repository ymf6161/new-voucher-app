import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, CreditCard as Edit2, Trash2, Landmark, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DepositDetailsDialog } from "@/components/deposit-details-dialog";
import { RecordDepositDialog } from "@/components/record-deposit-dialog";
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
import { PageHeader } from "@/components/page-header";
import { DataTable, Column, FilterDef } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/format";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { downloadCSV, formatDepositsForExport } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";
import type { DepositWithRelations, Bank } from "@shared/schema";

type DepositRow = DepositWithRelations & { voucherNumbers: string };

export default function Deposits() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteDeposit, setDeleteDeposit] = useState<DepositWithRelations | null>(null);
  const [viewDeposit, setViewDeposit] = useState<DepositWithRelations | null>(null);
  const { toast } = useToast();

  const { data: deposits = [], isLoading } = useQuery<DepositWithRelations[]>({
    queryKey: ["/api/deposits"],
  });

  const { data: banks = [] } = useQuery<Bank[]>({
    queryKey: ["/api/banks"],
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

  // Lets the search box find the deposit a voucher was banked in.
  const searchableDeposits = deposits.map((d) => ({
    ...d,
    voucherNumbers: d.vouchers.map((v) => v.voucherNumber).filter(Boolean).join(" "),
  }));

  const depositFilters: FilterDef<DepositRow>[] = [
    { key: "from", label: "From", type: "select", value: (d) => d.recipient?.name || d.voucherCompany?.name },
    { key: "bank", label: "Bank", type: "select", value: (d) => d.bank?.name },
    { key: "date", label: "Date", type: "dateRange", value: (d) => d.dateDeposited },
  ];

  const columns: Column<DepositRow>[] = [
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

        <RecordDepositDialog open={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)} />
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
            data={searchableDeposits}
            columns={columns}
            isLoading={isLoading}
            searchPlaceholder="Search deposits or a voucher number..."
            searchFields={["notes", "voucherNumbers"]}
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

      <RecordDepositDialog open={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)} />

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
