import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AutoCompleteDropdown } from "@/components/auto-complete-dropdown";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Name, Reference, VoucherCompany, VoucherWithRelations } from "@shared/schema";

type FieldKey = "dateReceived" | "voucherCompanyId" | "receivedFromId" | "referenceId" | "type" | "status" | "notes";

interface BulkEditVouchersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vouchers: VoucherWithRelations[];
  companies: VoucherCompany[];
  names: Name[];
  references: Reference[];
  onDone: () => void;
}

export function isBulkEditable(voucher: VoucherWithRelations): boolean {
  return ["unposted", "cancelled", "completed"].includes(voucher.status) && !voucher.batchId && !voucher.depositId;
}

export function BulkEditVouchersDialog({
  open,
  onOpenChange,
  vouchers,
  companies,
  names,
  references,
  onDone,
}: BulkEditVouchersDialogProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [values, setValues] = useState<Partial<Record<FieldKey, string>>>({});
  const [labels, setLabels] = useState<Partial<Record<FieldKey, string>>>({});

  const editable = vouchers.filter(isBulkEditable);
  const lockedCount = vouchers.length - editable.length;

  const set = (field: FieldKey, value: string, label?: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (label !== undefined) setLabels((prev) => ({ ...prev, [field]: label }));
    setEnabled((prev) => ({ ...prev, [field]: true }));
  };

  const reset = () => {
    setEnabled({});
    setValues({});
    setLabels({});
  };

  const changes = Object.fromEntries(
    (Object.keys(enabled) as FieldKey[])
      .filter((field) => enabled[field])
      .map((field) => {
        const value = values[field] ?? "";
        // Optional links and notes can be cleared by leaving them empty.
        if (field === "receivedFromId" || field === "referenceId" || field === "notes") return [field, value || null];
        return [field, value];
      }),
  );
  const missingRequired =
    ["dateReceived", "voucherCompanyId", "type", "status"].some(
      (field) => enabled[field as FieldKey] && !values[field as FieldKey],
    ) ||
    // Typed a name/reference but didn't pick one from the list.
    (["receivedFromId", "referenceId"] as FieldKey[]).some(
      (field) => enabled[field] && !!labels[field] && !values[field],
    );

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/vouchers/bulk", { ids: editable.map((v) => v.id), changes });
      return (await res.json()) as { updated: number; skipped: string[] };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: `${result.updated} voucher(s) updated`,
        description: result.skipped.length ? `${result.skipped.length} skipped because they are posted or deposited.` : undefined,
      });
      reset();
      onDone();
    },
    onError: (error: any) => {
      toast({ title: "Bulk edit failed", description: error?.message, variant: "destructive" });
    },
  });

  const row = (field: FieldKey, label: string, editor: React.ReactNode) => (
    <div className="grid grid-cols-[auto_8rem_1fr] items-center gap-3">
      <Checkbox
        checked={!!enabled[field]}
        onCheckedChange={(checked) => setEnabled((prev) => ({ ...prev, [field]: !!checked }))}
        aria-label={`Change ${label}`}
        data-testid={`bulk-enable-${field}`}
      />
      <span className="text-sm font-medium">{label}</span>
      <div className={enabled[field] ? "" : "opacity-60"}>{editor}</div>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {editable.length} voucher(s)</DialogTitle>
          <DialogDescription>
            Tick the fields to change. Unticked fields keep their current values.
            {lockedCount > 0 && ` ${lockedCount} selected voucher(s) are posted or deposited and will not be changed.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {row("dateReceived", "Date received",
            <Input type="date" value={values.dateReceived || ""} onChange={(e) => set("dateReceived", e.target.value)} data-testid="bulk-dateReceived" />,
          )}
          {row("voucherCompanyId", "Company",
            <AutoCompleteDropdown
              value={values.voucherCompanyId || ""}
              displayValue={labels.voucherCompanyId || ""}
              options={companies.map((c) => ({ id: c.id, label: c.name }))}
              placeholder="Company..."
              onValueChange={(label, id) => set("voucherCompanyId", id, label)}
            />,
          )}
          {row("receivedFromId", "Received from",
            <AutoCompleteDropdown
              value={values.receivedFromId || ""}
              displayValue={labels.receivedFromId || ""}
              options={names.map((n) => ({ id: n.id, label: n.name }))}
              placeholder="Leave empty to clear"
              onValueChange={(label, id) => set("receivedFromId", id, label)}
            />,
          )}
          {row("referenceId", "Reference",
            <AutoCompleteDropdown
              value={values.referenceId || ""}
              displayValue={labels.referenceId || ""}
              options={references.map((r) => ({ id: r.id, label: r.reference }))}
              placeholder="Leave empty to clear"
              onValueChange={(label, id) => set("referenceId", id, label)}
            />,
          )}
          {row("type", "Type",
            <Select value={values.type || ""} onValueChange={(value) => set("type", value)}>
              <SelectTrigger data-testid="bulk-type"><SelectValue placeholder="Choose type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PPV">PPV</SelectItem>
                <SelectItem value="ACC">ACC</SelectItem>
              </SelectContent>
            </Select>,
          )}
          {row("status", "Status",
            <Select value={values.status || ""} onValueChange={(value) => set("status", value)}>
              <SelectTrigger data-testid="bulk-status"><SelectValue placeholder="Choose status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unposted">Unposted</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>,
          )}
          {row("notes", "Notes",
            <Input value={values.notes || ""} placeholder="Leave empty to clear" onChange={(e) => set("notes", e.target.value)} data-testid="bulk-notes" />,
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={editable.length === 0 || Object.keys(changes).length === 0 || missingRequired || mutation.isPending}
            data-testid="button-apply-bulk-edit"
          >
            {mutation.isPending ? "Saving..." : `Apply to ${editable.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
