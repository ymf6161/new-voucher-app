import { useState, useRef, useCallback, useEffect, MouseEvent as ReactMouseEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Save, X, Check, Calendar as CalendarIcon, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { AutoCompleteDropdown } from "@/components/auto-complete-dropdown";
import type { VoucherCompany, Name, Reference } from "@shared/schema";

interface VoucherRow {
  id: string;
  dateReceived: Date;
  receivedFromId: string;
  referenceId: string;
  voucherCompanyId: string;
  type: "PPV" | "ACC";
  accountNumber: string;
  voucherNumber: string;
  amount: string;
  // "" while the user is mid-edit (e.g. backspaced the last digit); restored to 1 on blur.
  quantity: number | "";
  notes: string;
  companyName: string;
  receivedFromName: string;
  referenceName: string;
  isNewCompany: boolean;
  isNewName: boolean;
  isNewReference: boolean;
}

interface BatchVoucherEntryProps {
  companies: VoucherCompany[];
  names: Name[];
  references: Reference[];
  onSaveAndClose: () => void;
  onCancel: () => void;
}

const createRowId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeLabel = (value: string) => value.trim().toLowerCase();

const createEmptyRow = (): VoucherRow => ({
  id: createRowId(),
  dateReceived: new Date(),
  receivedFromId: "",
  referenceId: "",
  voucherCompanyId: "",
  type: "PPV",
  accountNumber: "",
  voucherNumber: "PPV",
  amount: "",
  quantity: 1,
  notes: "",
  companyName: "",
  receivedFromName: "",
  referenceName: "",
  isNewCompany: false,
  isNewName: false,
  isNewReference: false,
});

type DragFillState = {
  active: boolean;
  startRowIndex: number;
  startField: keyof VoucherRow;
  startValue: any;
  currentRowIndex: number;
};

export function BatchVoucherEntry({
  companies,
  names,
  references,
  onSaveAndClose,
  onCancel,
}: BatchVoucherEntryProps) {
  const [rows, setRows] = useState<VoucherRow[]>([createEmptyRow()]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [globalDate, setGlobalDate] = useState<Date>(new Date());
  const [localCompanies, setLocalCompanies] = useState<VoucherCompany[]>(companies);
  const [localNames, setLocalNames] = useState<Name[]>(names);
  const [localReferences, setLocalReferences] = useState<Reference[]>(references);
  const [dragFill, setDragFill] = useState<DragFillState | null>(null);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement | HTMLButtonElement>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    const handleMouseUp = () => {
      if (dragFill?.active) {
        handleDragEnd();
      }
    };

    if (dragFill?.active) {
      document.addEventListener('mouseup', handleMouseUp);
      return () => document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [dragFill]);

  const saveVouchersMutation = useMutation({
    mutationFn: async (vouchers: VoucherRow[]) => {
      const validVouchers = vouchers.filter(v => v.voucherCompanyId && v.amount);

      const usedTempCompanyIds = new Set(
        validVouchers
          .map(v => v.voucherCompanyId)
          .filter(id => id.startsWith("temp-company-"))
      );
      const usedTempNameIds = new Set(
        validVouchers
          .map(v => v.receivedFromId)
          .filter((id): id is string => !!id && id.startsWith("temp-name-"))
      );
      const usedTempReferenceIds = new Set(
        validVouchers
          .map(v => v.referenceId)
          .filter((id): id is string => !!id && id.startsWith("temp-reference-"))
      );

      const tempCompanies = localCompanies.filter(c => usedTempCompanyIds.has(c.id));
      const tempNames = localNames.filter(n => usedTempNameIds.has(n.id));
      const tempReferences = localReferences.filter(r => usedTempReferenceIds.has(r.id));

      const companyIdMap = new Map<string, string>();
      const nameIdMap = new Map<string, string>();
      const referenceIdMap = new Map<string, string>();
      const createdCompanies: VoucherCompany[] = [];
      const createdNames: Name[] = [];
      const createdReferences: Reference[] = [];

      const existingCompaniesByLabel = new Map(
        localCompanies
          .filter(c => !c.id.startsWith("temp-company-"))
          .map(c => [normalizeLabel(c.name), c])
      );
      const existingNamesByLabel = new Map(
        localNames
          .filter(n => !n.id.startsWith("temp-name-"))
          .map(n => [normalizeLabel(n.name), n])
      );
      const existingReferencesByLabel = new Map(
        localReferences
          .filter(r => !r.id.startsWith("temp-reference-"))
          .map(r => [normalizeLabel(r.reference), r])
      );

      const tempCompaniesByLabel = new Map<string, VoucherCompany[]>();
      for (const tempCompany of tempCompanies) {
        const label = normalizeLabel(tempCompany.name);
        if (!label) continue;
        const list = tempCompaniesByLabel.get(label) || [];
        list.push(tempCompany);
        tempCompaniesByLabel.set(label, list);
      }

      for (const [label, companyGroup] of tempCompaniesByLabel.entries()) {
        const existing = existingCompaniesByLabel.get(label);
        if (existing) {
          companyGroup.forEach(item => companyIdMap.set(item.id, existing.id));
          continue;
        }
        const companyResponse = await apiRequest("POST", "/api/voucher-companies", { name: companyGroup[0].name });
        const newCompany = await companyResponse.json();
        createdCompanies.push(newCompany);
        companyGroup.forEach(item => companyIdMap.set(item.id, newCompany.id));
      }

      const tempNamesByLabel = new Map<string, Name[]>();
      for (const tempName of tempNames) {
        const label = normalizeLabel(tempName.name);
        if (!label) continue;
        const list = tempNamesByLabel.get(label) || [];
        list.push(tempName);
        tempNamesByLabel.set(label, list);
      }

      for (const [label, nameGroup] of tempNamesByLabel.entries()) {
        const existing = existingNamesByLabel.get(label);
        if (existing) {
          nameGroup.forEach(item => nameIdMap.set(item.id, existing.id));
          continue;
        }
        const nameResponse = await apiRequest("POST", "/api/names", { name: nameGroup[0].name });
        const newName = await nameResponse.json();
        createdNames.push(newName);
        nameGroup.forEach(item => nameIdMap.set(item.id, newName.id));
      }

      const tempReferencesByLabel = new Map<string, Reference[]>();
      for (const tempReference of tempReferences) {
        const label = normalizeLabel(tempReference.reference);
        if (!label) continue;
        const list = tempReferencesByLabel.get(label) || [];
        list.push(tempReference);
        tempReferencesByLabel.set(label, list);
      }

      for (const [label, referenceGroup] of tempReferencesByLabel.entries()) {
        const existing = existingReferencesByLabel.get(label);
        if (existing) {
          referenceGroup.forEach(item => referenceIdMap.set(item.id, existing.id));
          continue;
        }
        const referenceResponse = await apiRequest("POST", "/api/references", { reference: referenceGroup[0].reference });
        const newReference = await referenceResponse.json();
        createdReferences.push(newReference);
        referenceGroup.forEach(item => referenceIdMap.set(item.id, newReference.id));
      }

      const promises = validVouchers.map(voucher => {
        const payload = {
          dateReceived: globalDate.toISOString(),
          receivedFromId: voucher.receivedFromId ? (nameIdMap.get(voucher.receivedFromId) || voucher.receivedFromId) : null,
          referenceId: voucher.referenceId ? (referenceIdMap.get(voucher.referenceId) || voucher.referenceId) : null,
          voucherCompanyId: companyIdMap.get(voucher.voucherCompanyId) || voucher.voucherCompanyId,
          type: voucher.type,
          accountNumber: voucher.accountNumber || null,
          voucherNumber: voucher.voucherNumber || null,
          amount: voucher.amount,
          quantity: voucher.quantity || 1,
          notes: voucher.notes || null,
          status: "unposted",
        };
        return apiRequest("POST", "/api/vouchers", payload);
      });
      const savedVouchers = await Promise.all(promises);
      return {
        savedVouchers,
        createdCompanies,
        createdNames,
        createdReferences,
        savedTempCompanyIds: [...usedTempCompanyIds],
        savedTempNameIds: [...usedTempNameIds],
        savedTempReferenceIds: [...usedTempReferenceIds],
      };
    },
    onSuccess: (result, vouchers) => {
      const validCount = vouchers.filter(v => v.voucherCompanyId && v.amount).length;
      toast({
        title: "Vouchers saved",
        description: `${validCount} voucher(s) have been added successfully.`,
      });
      if (result) {
        setLocalCompanies(prev => [
          ...prev.filter(c => !result.savedTempCompanyIds.includes(c.id)),
          ...result.createdCompanies,
        ]);
        setLocalNames(prev => [
          ...prev.filter(n => !result.savedTempNameIds.includes(n.id)),
          ...result.createdNames,
        ]);
        setLocalReferences(prev => [
          ...prev.filter(r => !result.savedTempReferenceIds.includes(r.id)),
          ...result.createdReferences,
        ]);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voucher-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/names"] });
      queryClient.invalidateQueries({ queryKey: ["/api/references"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save vouchers. Please try again.",
        variant: "destructive",
      });
    },
  });

  const addRow = useCallback(() => {
    const newRow = createEmptyRow();
    setRows(prev => [...prev, newRow]);
    setTimeout(() => {
      const firstInput = inputRefs.current.get(`${newRow.id}-company`);
      firstInput?.focus();
    }, 50);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => {
      if (prev.length === 1) {
        return [createEmptyRow()];
      }
      return prev.filter(row => row.id !== id);
    });
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const removeSelectedRows = useCallback(() => {
    if (selectedRows.size === 0) return;
    setRows(prev => {
      const remaining = prev.filter(row => !selectedRows.has(row.id));
      return remaining.length > 0 ? remaining : [createEmptyRow()];
    });
    setSelectedRows(new Set());
  }, [selectedRows]);

  const updateRow = useCallback((id: string, field: keyof VoucherRow, value: any) => {
    setRows(prev => prev.map(row =>
      row.id === id ? { ...row, [field]: value } : row
    ));
  }, []);

  const toggleRowSelection = useCallback((id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAllSelection = useCallback(() => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map(r => r.id)));
    }
  }, [rows, selectedRows.size]);

  const setInputRef = useCallback((key: string, element: HTMLInputElement | HTMLButtonElement | null) => {
    if (element) {
      inputRefs.current.set(key, element);
    } else {
      inputRefs.current.delete(key);
    }
  }, []);

  const fieldOrder = ["company", "receivedFrom", "reference", "type", "voucherNumber", "amount", "quantity", "notes"];

  const advanceToNextField = useCallback((rowId: string, currentField: string) => {
    const currentFieldIndex = fieldOrder.indexOf(currentField);
    const rowIndex = rows.findIndex(r => r.id === rowId);
    const isLastField = currentFieldIndex === fieldOrder.length - 1;
    const isLastRow = rowIndex === rows.length - 1;

    if (isLastField) {
      if (isLastRow) {
        addRow();
      } else {
        const nextRow = rows[rowIndex + 1];
        const firstInput = inputRefs.current.get(`${nextRow.id}-company`);
        setTimeout(() => firstInput?.focus(), 0);
      }
    } else {
      const nextField = fieldOrder[currentFieldIndex + 1];
      const nextInput = inputRefs.current.get(`${rowId}-${nextField}`);
      setTimeout(() => nextInput?.focus(), 0);
    }
  }, [rows, addRow, fieldOrder]);

  const handleCompanyCreate = async (rowId: string, name: string) => {
    const normalized = normalizeLabel(name);
    const existing = localCompanies.find(
      (company) => normalizeLabel(company.name) === normalized
    );
    if (existing) {
      updateRow(rowId, "companyName", existing.name);
      updateRow(rowId, "voucherCompanyId", existing.id);
      updateRow(rowId, "isNewCompany", existing.id.startsWith("temp-company-"));
      return;
    }

    const tempId = `temp-company-${createRowId()}`;
    const tempCompany = { id: tempId, name, address: null, city: null, postcode: null, phone: null, email: null };
    setLocalCompanies(prev => [...prev, tempCompany]);
    updateRow(rowId, "companyName", name);
    updateRow(rowId, "voucherCompanyId", tempId);
    updateRow(rowId, "isNewCompany", true);
  };

  const handleNameCreate = async (rowId: string, name: string) => {
    const normalized = normalizeLabel(name);
    const existing = localNames.find(
      (entry) => normalizeLabel(entry.name) === normalized
    );
    if (existing) {
      updateRow(rowId, "receivedFromName", existing.name);
      updateRow(rowId, "receivedFromId", existing.id);
      updateRow(rowId, "isNewName", existing.id.startsWith("temp-name-"));
      return;
    }

    const tempId = `temp-name-${createRowId()}`;
    const tempName = { id: tempId, name, address: null, phone: null, email: null };
    setLocalNames(prev => [...prev, tempName]);
    updateRow(rowId, "receivedFromName", name);
    updateRow(rowId, "receivedFromId", tempId);
    updateRow(rowId, "isNewName", true);
  };

  const handleReferenceCreate = async (rowId: string, reference: string) => {
    const normalized = normalizeLabel(reference);
    const existing = localReferences.find(
      (entry) => normalizeLabel(entry.reference) === normalized
    );
    if (existing) {
      updateRow(rowId, "referenceName", existing.reference);
      updateRow(rowId, "referenceId", existing.id);
      updateRow(rowId, "isNewReference", existing.id.startsWith("temp-reference-"));
      return;
    }

    const tempId = `temp-reference-${createRowId()}`;
    const tempReference = { id: tempId, reference, notes: null, contact: null };
    setLocalReferences(prev => [...prev, tempReference]);
    updateRow(rowId, "referenceName", reference);
    updateRow(rowId, "referenceId", tempId);
    updateRow(rowId, "isNewReference", true);
  };

  const handleSaveAndClose = async () => {
    const validVouchers = rows.filter(v => v.voucherCompanyId && v.amount);
    if (validVouchers.length === 0) {
      toast({
        title: "No valid vouchers",
        description: "Please add at least one voucher with a company and amount.",
        variant: "destructive",
      });
      return;
    }
    await saveVouchersMutation.mutateAsync(rows);
    onSaveAndClose();
  };

  const handleSaveForLater = async () => {
    const validVouchers = rows.filter(v => v.voucherCompanyId && v.amount);
    if (validVouchers.length === 0) {
      toast({
        title: "No valid vouchers",
        description: "Please add at least one voucher with a company and amount.",
        variant: "destructive",
      });
      return;
    }
    await saveVouchersMutation.mutateAsync(rows);
    setRows([createEmptyRow()]);
    setSelectedRows(new Set());
    toast({
      title: "Ready for more",
      description: "Saved vouchers and ready to add more.",
    });
  };

  const getRowTotal = (row: VoucherRow) => {
    const amount = parseFloat(row.amount) || 0;
    return amount * (row.quantity || 0);
  };

  const grandTotal = rows.reduce((sum, row) => sum + getRowTotal(row), 0);

  const handleDragStart = (e: ReactMouseEvent, rowIndex: number, field: keyof VoucherRow, value: any) => {
    e.preventDefault();
    e.stopPropagation();
    setDragFill({
      active: true,
      startRowIndex: rowIndex,
      startField: field,
      startValue: value,
      currentRowIndex: rowIndex,
    });
  };

  const handleDragOver = (rowIndex: number) => {
    if (dragFill?.active) {
      setDragFill(prev => prev ? { ...prev, currentRowIndex: rowIndex } : null);
    }
  };

  const handleDragEnd = () => {
    if (dragFill?.active) {
      const startIdx = Math.min(dragFill.startRowIndex, dragFill.currentRowIndex);
      const endIdx = Math.max(dragFill.startRowIndex, dragFill.currentRowIndex);

      for (let i = startIdx + 1; i <= endIdx; i++) {
        if (i < rows.length) {
          const sourceRow = rows[dragFill.startRowIndex];
          const targetRow = rows[i];

          if (dragFill.startField === "voucherCompanyId") {
            updateRow(targetRow.id, "voucherCompanyId", sourceRow.voucherCompanyId);
            updateRow(targetRow.id, "companyName", sourceRow.companyName);
            updateRow(targetRow.id, "isNewCompany", sourceRow.isNewCompany);
          } else if (dragFill.startField === "receivedFromId") {
            updateRow(targetRow.id, "receivedFromId", sourceRow.receivedFromId);
            updateRow(targetRow.id, "receivedFromName", sourceRow.receivedFromName);
            updateRow(targetRow.id, "isNewName", sourceRow.isNewName);
          } else if (dragFill.startField === "referenceId") {
            updateRow(targetRow.id, "referenceId", sourceRow.referenceId);
            updateRow(targetRow.id, "referenceName", sourceRow.referenceName);
            updateRow(targetRow.id, "isNewReference", sourceRow.isNewReference);
          } else {
            updateRow(targetRow.id, dragFill.startField, dragFill.startValue);
          }
        }
      }
    }
    setDragFill(null);
  };

  const getCellKey = (rowId: string, field: string) => `${rowId}-${field}`;

  const isCellInDragRange = (rowIndex: number, field: keyof VoucherRow) => {
    if (!dragFill?.active || dragFill.startField !== field) return false;
    const startIdx = Math.min(dragFill.startRowIndex, dragFill.currentRowIndex);
    const endIdx = Math.max(dragFill.startRowIndex, dragFill.currentRowIndex);
    return rowIndex >= startIdx && rowIndex <= endIdx;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border">
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        <label className="text-sm font-medium">Date Received:</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 font-normal",
                !globalDate && "text-muted-foreground"
              )}
            >
              {format(globalDate, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={globalDate}
              onSelect={(date) => date && setGlobalDate(date)}
              disabled={(date) => date > new Date()}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground ml-auto">
          Applied to all vouchers when saved
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" />
            Add Row
          </Button>
          {selectedRows.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={removeSelectedRows}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete ({selectedRows.size})
            </Button>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {rows.length} row{rows.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="w-10 p-0 border-r">
                  <button
                    onClick={toggleAllSelection}
                    className="w-full h-10 flex items-center justify-center hover:bg-muted/80 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRows.size === rows.length && rows.length > 0}
                      onChange={() => {}}
                      className="h-4 w-4 rounded"
                    />
                  </button>
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 border-r min-w-[180px]">
                  Company <span className="text-destructive">*</span>
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 border-r min-w-[150px]">
                  Received From
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 border-r min-w-[150px]">
                  Reference
                </th>
                <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-2 border-r w-24">
                  Type
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 border-r min-w-[120px]">
                  Voucher #
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-2 border-r w-28">
                  Amount <span className="text-destructive">*</span>
                </th>
                <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-2 border-r w-20">
                  Qty
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-2 border-r w-28">
                  Total
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 border-r min-w-[200px]">
                  Notes
                </th>
                <th className="w-10 border-r"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b hover:bg-muted/30 transition-colors group",
                    selectedRows.has(row.id) && "bg-blue-50 dark:bg-blue-950/20"
                  )}
                >
                  <td className="border-r p-0 bg-muted/20">
                    <div className="flex items-center justify-center h-full px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.id)}
                        onChange={() => toggleRowSelection(row.id)}
                        className="h-4 w-4 rounded"
                      />
                    </div>
                  </td>
                  <td
                    className={cn(
                      "border-r p-0 relative",
                      isCellInDragRange(index, "voucherCompanyId") && "bg-blue-100 dark:bg-blue-900/30"
                    )}
                    onMouseEnter={() => setHoveredCell(getCellKey(row.id, "company"))}
                    onMouseLeave={() => setHoveredCell(null)}
                    onMouseOver={() => handleDragOver(index)}
                  >
                    <AutoCompleteDropdown
                      value={row.voucherCompanyId}
                      displayValue={row.companyName}
                      options={localCompanies.filter(c => c?.name).map(c => ({ id: c.id, label: c.name }))}
                      placeholder="Select company..."
                      className="h-10 border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                      onValueChange={(label, id) => {
                        updateRow(row.id, "companyName", label);
                        updateRow(row.id, "voucherCompanyId", id);
                        if (id) {
                          updateRow(row.id, "isNewCompany", id.startsWith("temp-company-"));
                        } else {
                          updateRow(row.id, "isNewCompany", false);
                        }
                      }}
                      onCreateNew={(name) => handleCompanyCreate(row.id, name)}
                      onAdvance={() => advanceToNextField(row.id, "company")}
                      inputRef={(el) => setInputRef(`${row.id}-company`, el as any)}
                      showNewBadge={row.isNewCompany}
                    />
                    {hoveredCell === getCellKey(row.id, "company") && (
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 cursor-ns-resize bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => handleDragStart(e, index, "voucherCompanyId", row.voucherCompanyId)}
                      />
                    )}
                  </td>
                  <td
                    className={cn(
                      "border-r p-0 relative",
                      isCellInDragRange(index, "receivedFromId") && "bg-blue-100 dark:bg-blue-900/30"
                    )}
                    onMouseEnter={() => setHoveredCell(getCellKey(row.id, "receivedFrom"))}
                    onMouseLeave={() => setHoveredCell(null)}
                    onMouseOver={() => handleDragOver(index)}
                  >
                    <AutoCompleteDropdown
                      value={row.receivedFromId}
                      displayValue={row.receivedFromName}
                      options={localNames.filter(n => n?.name).map(n => ({ id: n.id, label: n.name }))}
                      placeholder="Select name..."
                      className="h-10 border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                      onValueChange={(label, id) => {
                        updateRow(row.id, "receivedFromName", label);
                        updateRow(row.id, "receivedFromId", id);
                        if (id) {
                          updateRow(row.id, "isNewName", id.startsWith("temp-name-"));
                        } else {
                          updateRow(row.id, "isNewName", false);
                        }
                      }}
                      onCreateNew={(name) => handleNameCreate(row.id, name)}
                      onAdvance={() => advanceToNextField(row.id, "receivedFrom")}
                      inputRef={(el) => setInputRef(`${row.id}-receivedFrom`, el as any)}
                      showNewBadge={row.isNewName}
                    />
                    {hoveredCell === getCellKey(row.id, "receivedFrom") && (
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 cursor-ns-resize bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => handleDragStart(e, index, "receivedFromId", row.receivedFromId)}
                      />
                    )}
                  </td>
                  <td
                    className={cn(
                      "border-r p-0 relative",
                      isCellInDragRange(index, "referenceId") && "bg-blue-100 dark:bg-blue-900/30"
                    )}
                    onMouseEnter={() => setHoveredCell(getCellKey(row.id, "reference"))}
                    onMouseLeave={() => setHoveredCell(null)}
                    onMouseOver={() => handleDragOver(index)}
                  >
                    <AutoCompleteDropdown
                      value={row.referenceId}
                      displayValue={row.referenceName}
                      options={localReferences.filter(r => r?.reference).map(r => ({ id: r.id, label: r.reference }))}
                      placeholder="Select reference..."
                      className="h-10 border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                      onValueChange={(label, id) => {
                        updateRow(row.id, "referenceName", label);
                        updateRow(row.id, "referenceId", id);
                        if (id) {
                          updateRow(row.id, "isNewReference", id.startsWith("temp-reference-"));
                        } else {
                          updateRow(row.id, "isNewReference", false);
                        }
                      }}
                      onCreateNew={(reference) => handleReferenceCreate(row.id, reference)}
                      onAdvance={() => advanceToNextField(row.id, "reference")}
                      inputRef={(el) => setInputRef(`${row.id}-reference`, el as any)}
                      showNewBadge={row.isNewReference}
                    />
                    {hoveredCell === getCellKey(row.id, "reference") && (
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 cursor-ns-resize bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => handleDragStart(e, index, "referenceId", row.referenceId)}
                      />
                    )}
                  </td>
                  <td className="border-r p-0">
                    <div className="flex items-center justify-center gap-2 h-10 px-2">
                      <span className={cn(
                        "text-xs font-medium",
                        row.type === "PPV" ? "text-foreground" : "text-muted-foreground"
                      )}>
                        PPV
                      </span>
                      <Switch
                        checked={row.type === "ACC"}
                        onCheckedChange={(checked) => {
                          const newType = checked ? "ACC" : "PPV";
                          updateRow(row.id, "type", newType);
                          if (newType === "PPV") {
                            updateRow(row.id, "voucherNumber", "PPV");
                          } else {
                            updateRow(row.id, "voucherNumber", "");
                          }
                        }}
                        ref={(el) => setInputRef(`${row.id}-type`, el as any)}
                        className="scale-75"
                      />
                      <span className={cn(
                        "text-xs font-medium",
                        row.type === "ACC" ? "text-foreground" : "text-muted-foreground"
                      )}>
                        ACC
                      </span>
                    </div>
                  </td>
                  <td
                    className={cn(
                      "border-r p-0 relative",
                      isCellInDragRange(index, "voucherNumber") && "bg-blue-100 dark:bg-blue-900/30"
                    )}
                    onMouseEnter={() => setHoveredCell(getCellKey(row.id, "voucherNumber"))}
                    onMouseLeave={() => setHoveredCell(null)}
                    onMouseOver={() => handleDragOver(index)}
                  >
                    <Input
                      className="h-10 border-0 rounded-none shadow-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-offset-0 bg-transparent"
                      placeholder="Number"
                      value={row.voucherNumber}
                      onChange={(e) => updateRow(row.id, "voucherNumber", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                          e.preventDefault();
                          advanceToNextField(row.id, "voucherNumber");
                        }
                      }}
                      ref={(el) => setInputRef(`${row.id}-voucherNumber`, el as any)}
                    />
                    {hoveredCell === getCellKey(row.id, "voucherNumber") && (
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 cursor-ns-resize bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => handleDragStart(e, index, "voucherNumber", row.voucherNumber)}
                      />
                    )}
                  </td>
                  <td
                    className={cn(
                      "border-r p-0 relative",
                      isCellInDragRange(index, "amount") && "bg-blue-100 dark:bg-blue-900/30"
                    )}
                    onMouseEnter={() => setHoveredCell(getCellKey(row.id, "amount"))}
                    onMouseLeave={() => setHoveredCell(null)}
                    onMouseOver={() => handleDragOver(index)}
                  >
                    <Input
                      className="h-10 border-0 rounded-none shadow-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-offset-0 bg-transparent text-right"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={row.amount}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "" || parseFloat(value) >= 0) {
                          updateRow(row.id, "amount", value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                          e.preventDefault();
                          advanceToNextField(row.id, "amount");
                        }
                      }}
                      ref={(el) => setInputRef(`${row.id}-amount`, el as any)}
                    />
                    {hoveredCell === getCellKey(row.id, "amount") && (
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 cursor-ns-resize bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => handleDragStart(e, index, "amount", row.amount)}
                      />
                    )}
                  </td>
                  <td
                    className={cn(
                      "border-r p-0 relative",
                      isCellInDragRange(index, "quantity") && "bg-blue-100 dark:bg-blue-900/30"
                    )}
                    onMouseEnter={() => setHoveredCell(getCellKey(row.id, "quantity"))}
                    onMouseLeave={() => setHoveredCell(null)}
                    onMouseOver={() => handleDragOver(index)}
                  >
                    <Input
                      className="h-10 border-0 rounded-none shadow-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-offset-0 bg-transparent text-center"
                      type="number"
                      min="1"
                      value={row.quantity}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        if (e.target.value === "") {
                          updateRow(row.id, "quantity", "");
                          return;
                        }
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value >= 1) {
                          updateRow(row.id, "quantity", value);
                        }
                      }}
                      onBlur={() => {
                        if (row.quantity === "") {
                          updateRow(row.id, "quantity", 1);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                          e.preventDefault();
                          advanceToNextField(row.id, "quantity");
                        }
                      }}
                      ref={(el) => setInputRef(`${row.id}-quantity`, el as any)}
                    />
                    {hoveredCell === getCellKey(row.id, "quantity") && (
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 cursor-ns-resize bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => handleDragStart(e, index, "quantity", row.quantity)}
                      />
                    )}
                  </td>
                  <td className="border-r px-3 py-2 text-right font-medium text-sm bg-muted/10">
                    {formatCurrency(getRowTotal(row).toString())}
                  </td>
                  <td
                    className={cn(
                      "border-r p-0 relative",
                      isCellInDragRange(index, "notes") && "bg-blue-100 dark:bg-blue-900/30"
                    )}
                    onMouseEnter={() => setHoveredCell(getCellKey(row.id, "notes"))}
                    onMouseLeave={() => setHoveredCell(null)}
                    onMouseOver={() => handleDragOver(index)}
                  >
                    <Input
                      className="h-10 border-0 rounded-none shadow-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-offset-0 bg-transparent"
                      placeholder="Notes..."
                      value={row.notes}
                      onChange={(e) => updateRow(row.id, "notes", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                          e.preventDefault();
                          advanceToNextField(row.id, "notes");
                        }
                      }}
                      ref={(el) => setInputRef(`${row.id}-notes`, el as any)}
                    />
                    {hoveredCell === getCellKey(row.id, "notes") && (
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 cursor-ns-resize bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => handleDragStart(e, index, "notes", row.notes)}
                      />
                    )}
                  </td>
                  <td className="border-r p-0 bg-muted/20">
                    <button
                      onClick={() => removeRow(row.id)}
                      className="w-full h-10 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted/30">
              <tr>
                <td colSpan={8} className="px-3 py-3 text-right font-semibold text-sm">
                  Grand Total:
                </td>
                <td className="px-3 py-3 text-right font-bold text-base border-l">
                  {formatCurrency(grandTotal.toString())}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg space-y-1">
        <p><strong>Tips:</strong></p>
        <p>• Type to search dropdowns, use <kbd className="px-1 py-0.5 text-xs border rounded bg-background">↓</kbd> <kbd className="px-1 py-0.5 text-xs border rounded bg-background">↑</kbd> to navigate</p>
        <p>• Press <kbd className="px-1 py-0.5 text-xs border rounded bg-background">Enter</kbd> or <kbd className="px-1 py-0.5 text-xs border rounded bg-background">Tab</kbd> to move to next field</p>
        <p>• Hover cells and drag the small blue handle in the bottom-right corner to fill values down</p>
      </div>

      <div className="flex justify-end gap-3 pt-3 border-t">
        <Button variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={handleSaveForLater}
          disabled={saveVouchersMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          Save & Add More
        </Button>
        <Button
          onClick={handleSaveAndClose}
          disabled={saveVouchersMutation.isPending}
        >
          <Check className="h-4 w-4 mr-2" />
          {saveVouchersMutation.isPending ? "Saving..." : "Save & Close"}
        </Button>
      </div>
    </div>
  );
}
