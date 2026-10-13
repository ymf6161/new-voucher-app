import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Edit2, Plus, Minus, Save, X, AlertTriangle } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, formatDate } from "@/lib/format";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DepositWithRelations, VoucherWithRelations } from "@shared/schema";

interface DepositDetailsDialogProps {
  deposit: DepositWithRelations | null;
  onClose: () => void;
}

export function DepositDetailsDialog({ deposit, onClose }: DepositDetailsDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedAmount, setEditedAmount] = useState("");
  const [editedNotes, setEditedNotes] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [showRemoveVoucherConfirm, setShowRemoveVoucherConfirm] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: depositVouchers = [], isLoading: isLoadingVouchers } = useQuery<VoucherWithRelations[]>({
    queryKey: ["/api/vouchers", "deposit", deposit?.id],
    queryFn: async () => {
      if (!deposit) return [];
      const res = await apiRequest("GET", `/api/vouchers?depositId=${deposit.id}`);
      return res.json();
    },
    enabled: !!deposit,
    staleTime: 0,
  });

  const { data: availableVouchers = [] } = useQuery<VoucherWithRelations[]>({
    queryKey: ["/api/vouchers", "posted", deposit?.recipientNameId || deposit?.voucherCompanyId, "forAdd"],
    queryFn: async () => {
      if (!deposit) return [];
      const filter = deposit.recipientNameId ? `recipientId=${deposit.recipientNameId}` : `companyId=${deposit.voucherCompanyId}`;
      const res = await apiRequest("GET", `/api/vouchers?${filter}&status=posted`);
      return res.json();
    },
    enabled: !!deposit && isEditing,
    staleTime: 0,
  });

  useEffect(() => {
    if (deposit) {
      setEditedAmount(deposit.amountBanked);
      setEditedNotes(deposit.notes || "");
      setAdjustmentAmount("");
      setAdjustmentReason("");
      setSelectedVoucherIds([]);
    }
  }, [deposit]);

  const updateDepositMutation = useMutation({
    mutationFn: async () => {
      if (!deposit) return;
      return apiRequest("PATCH", `/api/deposits/${deposit.id}`, {
        amountBanked: editedAmount,
        notes: editedNotes,
        adjustmentAmount: adjustmentAmount || null,
        adjustmentReason: adjustmentReason || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Deposit updated",
        description: "The deposit has been updated successfully.",
      });
      setIsEditing(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update deposit. Please try again.",
        variant: "destructive",
      });
    },
  });

  const addVouchersMutation = useMutation({
    mutationFn: async (voucherIds: string[]) => {
      if (!deposit) return;
      return apiRequest("POST", `/api/deposits/${deposit.id}/vouchers`, { voucherIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Vouchers added",
        description: "The vouchers have been added to the deposit.",
      });
      setSelectedVoucherIds([]);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add vouchers. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeVoucherMutation = useMutation({
    mutationFn: async (voucherId: string) => {
      if (!deposit) return;
      return apiRequest("DELETE", `/api/deposits/${deposit.id}/vouchers/${voucherId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Voucher removed",
        description: "The voucher has been removed from the deposit and marked as posted.",
      });
      setShowRemoveVoucherConfirm(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove voucher. Please try again.",
        variant: "destructive",
      });
    },
  });

  const voucherTotal = depositVouchers.reduce(
    (sum, v) => sum + parseFloat(v.amount) * v.quantity,
    0
  );

  const handleClose = () => {
    setIsEditing(false);
    onClose();
  };

  if (!deposit) return null;

  return (
    <>
      <Dialog open={!!deposit} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>Deposit: {deposit.reference || "No Reference"}</span>
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit-deposit"
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              Deposited to {deposit.bank?.name} on {formatDate(deposit.dateDeposited)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-md">
              <div>
                <Label className="text-muted-foreground text-xs">From</Label>
                <p className="font-medium">{deposit.recipient?.name || deposit.voucherCompany?.name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Voucher Total</Label>
                <p className="font-medium">{formatCurrency(voucherTotal)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Banked Amount</Label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={editedAmount}
                    onChange={(e) => setEditedAmount(e.target.value)}
                    className="h-8"
                    data-testid="input-edit-banked-amount"
                  />
                ) : (
                  <p className={`font-medium ${
                    Math.abs(voucherTotal - parseFloat(deposit.amountBanked)) > 0.01
                      ? "text-amber-600"
                      : ""
                  }`}>
                    {formatCurrency(deposit.amountBanked)}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Difference</Label>
                <p className={`font-medium ${
                  Math.abs(voucherTotal - parseFloat(deposit.amountBanked)) > 0.01
                    ? "text-amber-600"
                    : "text-emerald-600"
                }`}>
                  {formatCurrency(parseFloat(deposit.amountBanked) - voucherTotal)}
                </p>
              </div>
            </div>

            {isEditing && (
              <div className="p-4 border rounded-md space-y-4 bg-amber-50 dark:bg-amber-950/20">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  <Label className="font-medium">Adjustment (if bank amount differs)</Label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="adjustmentAmount" className="text-sm">Adjustment Amount</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="adjustmentAmount"
                        type="number"
                        step="0.01"
                        value={adjustmentAmount}
                        onChange={(e) => setAdjustmentAmount(e.target.value)}
                        placeholder="-5.00 or 10.00"
                        className="flex-1"
                        data-testid="input-adjustment-amount"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use negative for fees/deductions, positive for extra payments
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="adjustmentReason" className="text-sm">Reason</Label>
                    <Input
                      id="adjustmentReason"
                      value={adjustmentReason}
                      onChange={(e) => setAdjustmentReason(e.target.value)}
                      placeholder="e.g., Bank fee, Chargeback, Interest"
                      data-testid="input-adjustment-reason"
                    />
                  </div>
                </div>
              </div>
            )}

            {isEditing && (
              <div>
                <Label htmlFor="notes" className="text-sm">Notes</Label>
                <Textarea
                  id="notes"
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  placeholder="Add notes about this deposit..."
                  className="resize-none"
                  data-testid="input-edit-notes"
                />
              </div>
            )}

            {!isEditing && deposit.notes && (
              <div className="p-3 border rounded-md">
                <Label className="text-muted-foreground text-xs">Notes</Label>
                <p className="text-sm mt-1">{deposit.notes}</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium">Vouchers in this Deposit</Label>
                {isEditing && (
                  <span className="text-xs text-muted-foreground">
                    {depositVouchers.length} voucher(s)
                  </span>
                )}
              </div>
              <div className="border rounded-md max-h-[250px] overflow-y-auto">
                {isLoadingVouchers ? (
                  <div className="p-8 text-center text-muted-foreground">Loading vouchers...</div>
                ) : depositVouchers.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No vouchers in this deposit</div>
                ) : (
                  depositVouchers.map((voucher) => (
                    <div
                      key={voucher.id}
                      className="p-3 border-b last:border-0 flex items-center gap-3"
                    >
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
                      {isEditing && depositVouchers.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowRemoveVoucherConfirm(voucher.id)}
                          title="Remove from deposit"
                          data-testid={`button-remove-voucher-${voucher.id}`}
                        >
                          <Minus className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {isEditing && availableVouchers.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-3 block">Add More Vouchers</Label>
                <div className="border rounded-md max-h-[200px] overflow-y-auto">
                  {availableVouchers.map((voucher) => (
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
                        data-testid={`checkbox-add-voucher-${voucher.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">#{voucher.voucherNumber || "N/A"}</span>
                          <span className="text-muted-foreground">{voucher.type}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(voucher.dateReceived)}
                        </div>
                      </div>
                      <div className="font-medium">{formatCurrency(voucher.amount)}</div>
                    </div>
                  ))}
                </div>
                {selectedVoucherIds.length > 0 && (
                  <Button
                    className="mt-2"
                    size="sm"
                    onClick={() => addVouchersMutation.mutate(selectedVoucherIds)}
                    disabled={addVouchersMutation.isPending}
                    data-testid="button-add-selected-vouchers"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add {selectedVoucherIds.length} Voucher(s)
                  </Button>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-wrap gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  data-testid="button-cancel-edit"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={() => updateDepositMutation.mutate()}
                  disabled={updateDepositMutation.isPending}
                  data-testid="button-save-deposit"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={handleClose} data-testid="button-close-deposit-details">
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!showRemoveVoucherConfirm} onOpenChange={(open) => !open && setShowRemoveVoucherConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Remove Voucher from Deposit
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this voucher from the deposit? 
              The voucher will be marked as "posted" and can be added to another deposit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showRemoveVoucherConfirm && removeVoucherMutation.mutate(showRemoveVoucherConfirm)}
              disabled={removeVoucherMutation.isPending}
              data-testid="button-confirm-remove-voucher"
            >
              {removeVoucherMutation.isPending ? "Removing..." : "Remove Voucher"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
