import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDate, batchSentTo } from "@/lib/format";
import { downloadRemittancePDF } from "@/lib/pdf-generator";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BatchWithRelations, VoucherWithRelations, CompanySettings } from "@shared/schema";

interface BatchDetailsDialogProps {
  batch: BatchWithRelations | null;
  onClose: () => void;
  settings?: CompanySettings | null;
}

export function BatchDetailsDialog({ batch, onClose, settings }: BatchDetailsDialogProps) {
  const { toast } = useToast();

  const { data: batchVouchers = [], isLoading } = useQuery<VoucherWithRelations[]>({
    queryKey: ["/api/vouchers", "batch", batch?.id],
    queryFn: async () => {
      if (!batch) return [];
      const res = await apiRequest("GET", `/api/vouchers?batchId=${batch.id}`);
      return res.json();
    },
    enabled: !!batch,
    staleTime: 0,
  });

  const handleDownloadRemittance = async () => {
    if (!batch) return;

    try {
      await downloadRemittancePDF({
        batch,
        vouchers: batchVouchers,
        settings: settings || null,
      });

      toast({
        title: "PDF downloaded",
        description: "Remittance advice has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!batch) return null;

  const totalQty = batchVouchers.reduce((sum, voucher) => sum + voucher.quantity, 0);

  return (
    <Dialog open={!!batch} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>Batch: {batch.reference}</span>
            <StatusBadge status={batch.status} />
          </DialogTitle>
          <DialogDescription>
            Sent to {batchSentTo(batch)} on {formatDate(batch.batchDate || batch.dateSent)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-md">
            <div>
              <Label className="text-muted-foreground text-xs">Total Amount</Label>
              <p className="font-semibold text-lg">{formatCurrency(batch.amountSent)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Voucher Lines</Label>
              <p className="font-semibold text-lg">{batchVouchers.length}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Total Quantity</Label>
              <p className="font-semibold text-lg">{totalQty}</p>
            </div>
          </div>

          {batch.notes && (
            <div className="p-3 border rounded-md">
              <Label className="text-muted-foreground text-xs">Notes</Label>
              <p className="text-sm mt-1">{batch.notes}</p>
            </div>
          )}

          <div>
            <Label className="text-sm font-medium mb-3 block">Vouchers in this Batch</Label>
            <div className="border rounded-md max-h-[320px] overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading vouchers...</div>
              ) : batchVouchers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No vouchers found</div>
              ) : (
                batchVouchers.map((voucher) => (
                  <div key={voucher.id} className="p-3 border-b last:border-0 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">#{voucher.voucherNumber || "N/A"}</span>
                        <span className="text-muted-foreground">{voucher.type}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(voucher.dateReceived)}
                        {voucher.receivedFrom && ` - ${voucher.receivedFrom.name}`}
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
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadRemittance} data-testid="button-download-remittance">
            <FileDown className="h-4 w-4 mr-2" />
            Download Remittance
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="button-close-batch-details">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
