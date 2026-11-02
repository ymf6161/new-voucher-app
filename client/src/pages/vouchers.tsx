import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Receipt, Grid3x3 as Grid3X3, LayoutList, Download, FileUp, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { VoucherForm } from "@/components/voucher-form";
import { BatchVoucherEntry } from "@/components/batch-voucher-entry";
import { VoucherImportDialog } from "@/components/voucher-import-dialog";
import { BulkEditVouchersDialog, isBulkEditable } from "@/components/bulk-edit-vouchers-dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { downloadCSV, formatVouchersForExport } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";
import type { Voucher, VoucherWithRelations, VoucherCompany, Name, Reference } from "@shared/schema";

function voucherTotal(voucher: Voucher): number {
  return (parseFloat(voucher.amount) || 0) * (voucher.quantity || 0);
}

export default function Vouchers() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [viewVoucher, setViewVoucher] = useState<VoucherWithRelations | null>(null);
  const [editVoucher, setEditVoucher] = useState<VoucherWithRelations | null>(null);
  const [deleteVoucher, setDeleteVoucher] = useState<Voucher | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { toast } = useToast();

  const { data: vouchers = [], isLoading } = useQuery<VoucherWithRelations[]>({
    queryKey: ["/api/vouchers"],
  });

  const { data: companies = [] } = useQuery<VoucherCompany[]>({
    queryKey: ["/api/voucher-companies"],
  });

  const { data: names = [] } = useQuery<Name[]>({
    queryKey: ["/api/names"],
  });

  const { data: references = [] } = useQuery<Reference[]>({
    queryKey: ["/api/references"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/vouchers/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDeleteVoucher(null);
      toast({
        title: "Voucher deleted",
        description: "The voucher has been removed successfully.",
      });
    },
    onError: (error: any) => {
      console.error('Delete voucher error:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to delete voucher. Please try again.",
        variant: "destructive",
      });
      setDeleteVoucher(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const responses = await Promise.all(ids.map(id => apiRequest("DELETE", `/api/vouchers/${id}`)));
      return responses;
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setSelectedIds([]);
      setShowBulkDeleteDialog(false);
      toast({
        title: "Vouchers deleted",
        description: `${ids.length} voucher(s) have been removed successfully.`,
      });
    },
    onError: (error: any) => {
      console.error('Bulk delete vouchers error:', error);
      setShowBulkDeleteDialog(false);
      toast({
        title: "Error",
        description: error?.message || "Failed to delete some vouchers. Please try again.",
        variant: "destructive",
      });
    },
  });

  const columns: Column<VoucherWithRelations>[] = [
    {
      key: "dateReceived",
      header: "Date",
      value: (voucher) => String(voucher.dateReceived),
      render: (voucher) => formatDate(voucher.dateReceived),
      className: "whitespace-nowrap",
    },
    {
      key: "receivedFrom",
      header: "Received From",
      value: (voucher) => voucher.receivedFrom?.name,
      render: (voucher) => voucher.receivedFrom?.name || "-",
    },
    {
      key: "reference",
      header: "Reference",
      value: (voucher) => voucher.reference?.reference,
      render: (voucher) => voucher.reference?.reference || "-",
    },
    {
      key: "voucherCompany",
      header: "Company",
      value: (voucher) => voucher.voucherCompany?.name,
      render: (voucher) => voucher.voucherCompany?.name || "-",
    },
    {
      key: "type",
      header: "Type",
    },
    {
      key: "voucherNumber",
      header: "Voucher #",
      render: (voucher) => voucher.voucherNumber || "-",
    },
    {
      key: "amount",
      header: "Amount",
      value: (voucher) => parseFloat(voucher.amount),
      render: (voucher) => formatCurrency(voucher.amount),
      className: "text-right",
    },
    {
      key: "quantity",
      header: "Qty",
      value: (voucher) => voucher.quantity,
      className: "text-center",
    },
    {
      key: "total",
      header: "Total",
      value: (voucher) => voucherTotal(voucher),
      render: (voucher) => formatCurrency(voucherTotal(voucher)),
      className: "text-right font-medium",
    },
    {
      key: "status",
      header: "Status",
      value: (voucher) => voucher.status,
      render: (voucher) => <StatusBadge status={voucher.status} />,
    },
    {
      key: "notes",
      header: "Notes",
      sortable: false,
      render: (voucher) => (
        <span className="block max-w-[180px] truncate text-muted-foreground" title={voucher.notes || undefined}>
          {voucher.notes || ""}
        </span>
      ),
    },
  ];

  const filters: FilterDef<VoucherWithRelations>[] = [
    { key: "status", label: "Status", type: "select", value: (v) => v.status },
    { key: "company", label: "Company", type: "select", value: (v) => v.voucherCompany?.name },
    { key: "type", label: "Type", type: "select", value: (v) => v.type },
    { key: "from", label: "Received From", type: "select", value: (v) => v.receivedFrom?.name },
    { key: "reference", label: "Reference", type: "select", value: (v) => v.reference?.reference },
    { key: "date", label: "Date", type: "dateRange", value: (v) => v.dateReceived },
    { key: "amount", label: "Amount", type: "numberRange", value: (v) => parseFloat(v.amount) },
  ];

  const handleFormSuccess = () => {
    setIsAddDialogOpen(false);
    setEditVoucher(null);
    queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
  };

  const selectedVouchers = vouchers.filter((v) => selectedIds.includes(v.id));
  const editableSelectedCount = selectedVouchers.filter(isBulkEditable).length;

  const deletableSelectedIds = selectedIds.filter(id => {
    const voucher = vouchers.find(v => v.id === id);
    return voucher && voucher.status !== "deposited" && voucher.status !== "posted";
  });

  if (!isLoading && vouchers.length === 0 && !isAddDialogOpen) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Receive Vouchers"
          description="Track and manage all received vouchers"
        >
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} data-testid="button-import-vouchers">
              <FileUp className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(true);
                setIsBatchDialogOpen(false);
              }}
              data-testid="button-add-single"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Single
            </Button>
            <Button
              onClick={() => {
                setIsBatchDialogOpen(true);
                setIsAddDialogOpen(false);
              }}
              data-testid="button-add-batch"
            >
              <Grid3X3 className="h-4 w-4 mr-2" />
              Batch Entry
            </Button>
          </div>
        </PageHeader>
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Receipt}
              title="No vouchers yet"
              description="Start tracking vouchers by adding your first one. Use batch entry for multiple vouchers at once."
            >
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(true);
                    setIsBatchDialogOpen(false);
                  }}
                  data-testid="button-add-first-single"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Single Voucher
                </Button>
                <Button
                  onClick={() => {
                    setIsBatchDialogOpen(true);
                    setIsAddDialogOpen(false);
                  }}
                  data-testid="button-add-first-batch"
                >
                  <Grid3X3 className="h-4 w-4 mr-2" />
                  Batch Entry
                </Button>
              </div>
            </EmptyState>
          </CardContent>
        </Card>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Voucher</DialogTitle>
              <DialogDescription>
                Enter the voucher details below. All fields marked with * are required.
              </DialogDescription>
            </DialogHeader>
            <VoucherForm
              companies={companies}
              names={names}
              references={references}
              onSuccess={handleFormSuccess}
              onCancel={() => setIsAddDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>

        <VoucherImportDialog
          open={isImportDialogOpen}
          onOpenChange={setIsImportDialogOpen}
          companies={companies}
          names={names}
          references={references}
          onImported={() => setIsImportDialogOpen(false)}
        />

        <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Batch Voucher Entry</DialogTitle>
              <DialogDescription>
                Enter multiple vouchers at once. Press Tab or Enter to navigate between rows.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              <BatchVoucherEntry
                companies={companies}
                names={names}
                references={references}
                onSaveAndClose={() => {
                  setIsBatchDialogOpen(false);
                }}
                onCancel={() => setIsBatchDialogOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receive Vouchers"
        description="Track and manage all received vouchers"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} data-testid="button-import-vouchers">
            <FileUp className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setIsAddDialogOpen(true);
              setIsBatchDialogOpen(false);
            }}
            data-testid="button-add-single"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Single
          </Button>
          <Button
            onClick={() => {
              setIsBatchDialogOpen(true);
              setIsAddDialogOpen(false);
            }}
            data-testid="button-add-batch"
          >
            <Grid3X3 className="h-4 w-4 mr-2" />
            Batch Entry
          </Button>
        </div>
      </PageHeader>

      {selectedIds.length > 0 && (
        <Card className="border-primary">
          <CardContent className="py-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <span className="text-sm font-medium">
                {selectedIds.length} voucher(s) selected
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                  data-testid="button-clear-selection"
                >
                  Clear Selection
                </Button>
                {editableSelectedCount > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setShowBulkEditDialog(true)}
                    data-testid="button-bulk-edit"
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit ({editableSelectedCount})
                  </Button>
                )}
                {deletableSelectedIds.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowBulkDeleteDialog(true)}
                    data-testid="button-bulk-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete ({deletableSelectedIds.length})
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <DataTable
            data={vouchers}
            columns={columns}
            isLoading={isLoading}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            searchPlaceholder="Search any column..."
            searchFields={["notes", "accountNumber"]}
            filters={filters}
            urlStateKey="v"
            stickyActions
            summary={(rows) => (
              <span data-testid="text-filtered-totals">
                Qty {rows.reduce((sum, v) => sum + (v.quantity || 0), 0)} · Total{" "}
                {formatCurrency(rows.reduce((sum, v) => sum + voucherTotal(v), 0))}
              </span>
            )}
            toolbar={(rows) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCSV(formatVouchersForExport(rows, names, companies, references), "vouchers")}
                disabled={rows.length === 0}
                data-testid="button-export-vouchers"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV ({rows.length})
              </Button>
            )}
            emptyMessage="No vouchers found"
            actions={(voucher) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewVoucher(voucher)}
                  aria-label={`View voucher ${voucher.voucherNumber || voucher.id}`}
                  title="View voucher"
                  data-testid={`button-view-${voucher.id}`}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditVoucher(voucher)}
                  disabled={voucher.status === "posted" || voucher.status === "deposited"}
                  data-testid={`button-edit-${voucher.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteVoucher(voucher)}
                  disabled={voucher.status === "deposited" || voucher.status === "posted"}
                  data-testid={`button-delete-${voucher.id}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Voucher</DialogTitle>
            <DialogDescription>
              Enter the voucher details below. All fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          <VoucherForm
            companies={companies}
            names={names}
            references={references}
            onSuccess={handleFormSuccess}
            onCancel={() => setIsAddDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <VoucherImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        companies={companies}
        names={names}
        references={references}
        onImported={() => setIsImportDialogOpen(false)}
      />

      <Dialog open={!!viewVoucher} onOpenChange={(open) => !open && setViewVoucher(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Voucher details</DialogTitle>
            <DialogDescription>
              {viewVoucher?.voucherCompany?.name || "Voucher"} · {viewVoucher?.voucherNumber || viewVoucher?.type}
            </DialogDescription>
          </DialogHeader>
          {viewVoucher && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div><p className="text-muted-foreground">Date received</p><p>{formatDate(viewVoucher.dateReceived)}</p></div>
              <div><p className="text-muted-foreground">Status</p><StatusBadge status={viewVoucher.status} /></div>
              <div><p className="text-muted-foreground">Received from</p><p>{viewVoucher.receivedFrom?.name || "-"}</p></div>
              <div><p className="text-muted-foreground">Reference</p><p>{viewVoucher.reference?.reference || "-"}</p></div>
              <div><p className="text-muted-foreground">Voucher company</p><p>{viewVoucher.voucherCompany?.name || "-"}</p></div>
              <div><p className="text-muted-foreground">Type</p><p>{viewVoucher.type}</p></div>
              <div><p className="text-muted-foreground">Account number</p><p>{viewVoucher.accountNumber || "-"}</p></div>
              <div><p className="text-muted-foreground">Voucher number</p><p>{viewVoucher.voucherNumber || "-"}</p></div>
              <div><p className="text-muted-foreground">Amount</p><p>{formatCurrency(viewVoucher.amount)}</p></div>
              <div><p className="text-muted-foreground">Quantity</p><p>{viewVoucher.quantity}</p></div>
              <div><p className="text-muted-foreground">Total</p><p>{formatCurrency(voucherTotal(viewVoucher))}</p></div>
              <div className="col-span-2"><p className="text-muted-foreground">Notes</p><p className="whitespace-pre-wrap">{viewVoucher.notes || "-"}</p></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewVoucher(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editVoucher} onOpenChange={(open) => !open && setEditVoucher(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Voucher</DialogTitle>
            <DialogDescription>
              Update the voucher details below.
            </DialogDescription>
          </DialogHeader>
          {editVoucher && (
            <VoucherForm
              voucher={editVoucher}
              companies={companies}
              names={names}
              references={references}
              onSuccess={handleFormSuccess}
              onCancel={() => setEditVoucher(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteVoucher} onOpenChange={(open) => !open && setDeleteVoucher(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voucher</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this voucher? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteVoucher && deleteMutation.mutate(deleteVoucher.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkEditVouchersDialog
        open={showBulkEditDialog}
        onOpenChange={setShowBulkEditDialog}
        vouchers={selectedVouchers}
        companies={companies}
        names={names}
        references={references}
        onDone={() => {
          setShowBulkEditDialog(false);
          setSelectedIds([]);
        }}
      />

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletableSelectedIds.length} Voucher(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletableSelectedIds.length} voucher(s)? This action cannot be undone.
              {selectedIds.length !== deletableSelectedIds.length && (
                <span className="block mt-2 text-muted-foreground">
                  Note: {selectedIds.length - deletableSelectedIds.length} voucher(s) cannot be deleted because they are posted or deposited.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(deletableSelectedIds)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${deletableSelectedIds.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Batch Voucher Entry</DialogTitle>
            <DialogDescription>
              Enter multiple vouchers at once. Press Tab or Enter to navigate between rows.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <BatchVoucherEntry
              companies={companies}
              names={names}
              references={references}
              onSaveAndClose={() => {
                setIsBatchDialogOpen(false);
              }}
              onCancel={() => setIsBatchDialogOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
