import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Trash2, Send, FileDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { BatchDetailsDialog } from "@/components/batch-details-dialog";
import { BatchEditor } from "@/components/batch-editor";
import { downloadRemittancePDF } from "@/lib/pdf-generator";
import { formatCurrency, formatDate, batchSentTo } from "@/lib/format";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { downloadCSV, formatBatchesForExport } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";
import type { BatchWithRelations, CompanySettings } from "@shared/schema";

export default function Batches() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchWithRelations | null>(null);
  const [deleteBatch, setDeleteBatch] = useState<BatchWithRelations | null>(null);
  const [viewBatch, setViewBatch] = useState<BatchWithRelations | null>(null);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const { toast } = useToast();

  const { data: batches = [], isLoading } = useQuery<BatchWithRelations[]>({
    queryKey: ["/api/batches"],
  });

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/batches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers/unposted-by-company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDeleteBatch(null);
      toast({
        title: "Batch deleted",
        description: "The batch has been removed and vouchers marked as unposted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete batch. Please try again.",
        variant: "destructive",
      });
      setDeleteBatch(null);
    },
  });

  const bulkMarkPostedMutation = useMutation({
    mutationFn: async (batchIds: string[]) => {
      const pendingBatchIds = batches
        .filter((batch) => batchIds.includes(batch.id) && batch.status === "pending")
        .map((batch) => batch.id);

      await Promise.all(
        pendingBatchIds.map((id) => apiRequest("PATCH", `/api/batches/${id}`, { status: "sent" }))
      );

      return pendingBatchIds.length;
    },
    onSuccess: (updatedCount) => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setSelectedBatchIds([]);
      toast({
        title: "Batches updated",
        description: updatedCount > 0
          ? `${updatedCount} batch(es) marked as posted.`
          : "No pending batches were selected.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update selected batches.",
        variant: "destructive",
      });
    },
  });

  const openEditor = (batch: BatchWithRelations | null) => {
    setEditingBatch(batch);
    setEditorOpen(true);
  };

  const downloadRemittance = async (batch: BatchWithRelations) => {
    const res = await apiRequest("GET", `/api/vouchers?batchId=${batch.id}`);
    const vouchers = await res.json();
    await downloadRemittancePDF({ batch, vouchers, settings: settings || null });
  };

  const handleDownloadRemittance = async (batch: BatchWithRelations) => {
    try {
      await downloadRemittance(batch);
      toast({ title: "PDF downloaded", description: "Remittance advice has been downloaded." });
    } catch {
      toast({ title: "Error", description: "Failed to generate PDF. Please try again.", variant: "destructive" });
    }
  };

  const handleDownloadSelectedRemittances = async () => {
    const selectedBatches = batches.filter((batch) => selectedBatchIds.includes(batch.id));
    if (selectedBatches.length === 0) return;
    try {
      for (const batch of selectedBatches) await downloadRemittance(batch);
      toast({ title: "Remittances downloaded", description: `${selectedBatches.length} remittance file(s) downloaded.` });
    } catch {
      toast({ title: "Error", description: "Failed to download selected remittances.", variant: "destructive" });
    }
  };

  const batchFilters: FilterDef<BatchWithRelations>[] = [
    { key: "status", label: "Status", type: "select", value: (b) => b.status },
    { key: "sentTo", label: "Sent to", type: "select", value: (b) => b.recipient?.name || b.voucherCompany?.name },
    { key: "date", label: "Date Sent", type: "dateRange", value: (b) => b.dateSent },
  ];

  const columns: Column<BatchWithRelations>[] = [
    {
      key: "dateSent",
      header: "Date Sent",
      value: (batch) => String(batch.dateSent),
      render: (batch) => formatDate(batch.dateSent),
      className: "whitespace-nowrap",
    },
    {
      key: "reference",
      header: "Reference",
    },
    {
      key: "sentTo",
      header: "Sent to",
      value: (batch) => batchSentTo(batch),
      render: (batch) => (
        <div>
          <div>{batch.recipient?.name || batch.voucherCompany?.name || "-"}</div>
          {batch.recipient && (batch.companyNames?.length ?? 0) > 0 && (
            <div className="text-xs text-muted-foreground">{batch.companyNames!.join(", ")}</div>
          )}
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      value: (batch) => batch.vouchers?.reduce((sum, v) => sum + (v.quantity || 0), 0) ?? 0,
      render: (batch) => batch.vouchers?.reduce((sum, v) => sum + (v.quantity || 0), 0) ?? 0,
      className: "text-center",
    },
    {
      key: "amountSent",
      header: "Amount",
      value: (batch) => parseFloat(batch.amountSent),
      render: (batch) => formatCurrency(batch.amountSent),
      className: "text-right font-medium",
    },
    {
      key: "status",
      header: "Status",
      value: (batch) => batch.status,
      render: (batch) => <StatusBadge status={batch.status} />,
    },
    {
      key: "notes",
      header: "Notes",
      sortable: false,
      render: (batch) => (
        <span className="text-muted-foreground truncate max-w-[200px] block">
          {batch.notes || "-"}
        </span>
      ),
    },
  ];

  const selectedPendingCount = batches.filter(
    (batch) => selectedBatchIds.includes(batch.id) && batch.status === "pending"
  ).length;

  useEffect(() => {
    setSelectedBatchIds((prev) => prev.filter((id) => batches.some((batch) => batch.id === id)));
  }, [batches]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Post Vouchers"
        description="Batch vouchers and send them to a voucher company or a person"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {selectedBatchIds.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => bulkMarkPostedMutation.mutate(selectedBatchIds)}
                disabled={bulkMarkPostedMutation.isPending || selectedPendingCount === 0}
                data-testid="button-bulk-mark-posted"
              >
                <Send className="h-4 w-4 mr-2" />
                Mark Selected as Posted
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadSelectedRemittances}
                data-testid="button-bulk-download-remittance"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Download Selected Remittances
              </Button>
            </>
          )}
          <Button onClick={() => openEditor(null)} data-testid="button-create-batch">
            <Plus className="h-4 w-4 mr-2" />
            Create Batch
          </Button>
        </div>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          {!isLoading && batches.length === 0 ? (
            <EmptyState
              icon={Send}
              title="No batches yet"
              description="Create your first batch to post vouchers to a voucher company or a person."
            >
              <Button onClick={() => openEditor(null)} data-testid="button-create-first-batch">
                <Plus className="h-4 w-4 mr-2" />
                Create First Batch
              </Button>
            </EmptyState>
          ) : (
            <DataTable
              data={batches}
              columns={columns}
              selectable
              selectedIds={selectedBatchIds}
              onSelectionChange={setSelectedBatchIds}
              isLoading={isLoading}
              searchPlaceholder="Search any column..."
              searchFields={["notes"]}
              filters={batchFilters}
              urlStateKey="b"
              summary={(rows) => (
                <span>Total {formatCurrency(rows.reduce((sum, b) => sum + (parseFloat(b.amountSent) || 0), 0))}</span>
              )}
              toolbar={(rows) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCSV(formatBatchesForExport(rows), "batches")}
                  disabled={rows.length === 0}
                  data-testid="button-export-batches"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV ({rows.length})
                </Button>
              )}
              emptyMessage="No batches found"
              actions={(batch) => {
                const hasDeposited = batch.vouchers?.some((v) => v.status === "deposited");
                return (
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleDownloadRemittance(batch)} title="Download Remittance PDF" data-testid={`button-download-${batch.id}`}>
                      <FileDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setViewBatch(batch)} title="View Batch" data-testid={`button-view-${batch.id}`}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditor(batch)} disabled={hasDeposited} title="Edit Batch" data-testid={`button-edit-${batch.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteBatch(batch)} disabled={hasDeposited} title="Delete Batch" data-testid={`button-delete-${batch.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      <BatchEditor
        open={editorOpen}
        batch={editingBatch}
        onClose={() => {
          setEditorOpen(false);
          setEditingBatch(null);
        }}
      />

      <BatchDetailsDialog
        batch={viewBatch}
        onClose={() => setViewBatch(null)}
        settings={settings}
      />

      <AlertDialog open={!!deleteBatch} onOpenChange={(open) => !open && setDeleteBatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this batch? All vouchers in this batch will be marked as unposted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteBatch && deleteMutation.mutate(deleteBatch.id)}
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
