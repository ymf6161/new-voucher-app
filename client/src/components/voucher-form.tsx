import { useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AutoCompleteDropdown } from "@/components/auto-complete-dropdown";
import type { VoucherWithRelations, VoucherCompany, Name, Reference } from "@shared/schema";

const voucherFormSchema = z.object({
  dateReceived: z.date(),
  receivedFromId: z.string().optional(),
  referenceId: z.string().optional(),
  voucherCompanyId: z.string().min(1, "Voucher company is required"),
  type: z.enum(["PPV", "ACC"]),
  voucherNumber: z.string().optional(),
  // The API returns decimal columns as numbers; coerce so editing a saved voucher validates.
  amount: z.coerce.string().min(1, "Amount is required"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  notes: z.string().optional(),
  status: z.enum(["unposted", "posted", "deposited", "cancelled", "completed"]).optional(),
});

type VoucherFormValues = z.infer<typeof voucherFormSchema>;

interface VoucherFormProps {
  voucher?: VoucherWithRelations;
  companies: VoucherCompany[];
  names: Name[];
  references: Reference[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function VoucherForm({
  voucher,
  companies,
  names,
  references,
  onSuccess,
  onCancel,
}: VoucherFormProps) {
  const { toast } = useToast();
  const isEditing = !!voucher;
  const [localCompanies, setLocalCompanies] = useState<VoucherCompany[]>(companies);
  const [localNames, setLocalNames] = useState<Name[]>(names);
  const [localReferences, setLocalReferences] = useState<Reference[]>(references);
  const [companyDisplay, setCompanyDisplay] = useState(voucher?.voucherCompany?.name || "");
  const [receivedFromDisplay, setReceivedFromDisplay] = useState(
    voucher?.receivedFrom?.name || ""
  );
  const [referenceDisplay, setReferenceDisplay] = useState(
    voucher?.reference?.reference || ""
  );
  const [isNewCompany, setIsNewCompany] = useState(false);
  const [isNewName, setIsNewName] = useState(false);
  const [isNewReference, setIsNewReference] = useState(false);
  const inputRefs = useRef<Map<string, HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>>(new Map());

  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues: {
      dateReceived: voucher ? new Date(voucher.dateReceived) : new Date(),
      receivedFromId: voucher?.receivedFromId || undefined,
      referenceId: voucher?.referenceId || undefined,
      voucherCompanyId: voucher?.voucherCompanyId || "",
      type: (voucher?.type as "PPV" | "ACC") || "PPV",
      voucherNumber: voucher?.voucherNumber || (voucher?.type === "PPV" ? "PPV" : ""),
      amount: voucher?.amount != null ? String(voucher.amount) : "",
      quantity: voucher?.quantity || 1,
      notes: voucher?.notes || "",
      status: (voucher?.status as any) || "unposted",
    },
  });

  const fieldOrder = [
    "dateReceived",
    "company",
    "receivedFrom",
    "reference",
    "type",
    "voucherNumber",
    "amount",
    "quantity",
    "notes",
  ];

  const advanceToNextField = useCallback((currentField: string) => {
    const currentFieldIndex = fieldOrder.indexOf(currentField);
    const nextField = fieldOrder[currentFieldIndex + 1];
    if (!nextField) {
      return;
    }
    const nextInput = inputRefs.current.get(nextField);
    setTimeout(() => nextInput?.focus(), 0);
  }, [fieldOrder]);

  const setInputRef = useCallback((key: string, element: HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement | null) => {
    if (element) {
      inputRefs.current.set(key, element);
    } else {
      inputRefs.current.delete(key);
    }
  }, []);

  const createRowId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const normalizeLabel = (value: string) => value.trim().toLowerCase();

  const handleCompanyCreate = async (name: string) => {
    const normalized = normalizeLabel(name);
    const existing = localCompanies.find(
      (company) => normalizeLabel(company.name) === normalized
    );
    if (existing) {
      form.setValue("voucherCompanyId", existing.id);
      setCompanyDisplay(existing.name);
      setIsNewCompany(existing.id.startsWith("temp-company-"));
      return;
    }

    const tempId = `temp-company-${createRowId()}`;
    const tempCompany = { id: tempId, name, address: null, city: null, postcode: null, phone: null, email: null };
    setLocalCompanies(prev => [...prev, tempCompany]);
    form.setValue("voucherCompanyId", tempId);
    setCompanyDisplay(name);
    setIsNewCompany(true);
  };

  const handleNameCreate = async (name: string) => {
    const normalized = normalizeLabel(name);
    const existing = localNames.find(
      (entry) => normalizeLabel(entry.name) === normalized
    );
    if (existing) {
      form.setValue("receivedFromId", existing.id);
      setReceivedFromDisplay(existing.name);
      setIsNewName(existing.id.startsWith("temp-name-"));
      return;
    }

    const tempId = `temp-name-${createRowId()}`;
    const tempName = { id: tempId, name, address: null, phone: null, email: null };
    setLocalNames(prev => [...prev, tempName]);
    form.setValue("receivedFromId", tempId);
    setReceivedFromDisplay(name);
    setIsNewName(true);
  };

  const handleReferenceCreate = async (reference: string) => {
    const normalized = normalizeLabel(reference);
    const existing = localReferences.find(
      (entry) => normalizeLabel(entry.reference) === normalized
    );
    if (existing) {
      form.setValue("referenceId", existing.id);
      setReferenceDisplay(existing.reference);
      setIsNewReference(existing.id.startsWith("temp-reference-"));
      return;
    }

    const tempId = `temp-reference-${createRowId()}`;
    const tempReference = { id: tempId, reference, notes: null, contact: null };
    setLocalReferences(prev => [...prev, tempReference]);
    form.setValue("referenceId", tempId);
    setReferenceDisplay(reference);
    setIsNewReference(true);
  };

  const mutation = useMutation({
    mutationFn: async (data: VoucherFormValues) => {
      const usedTempCompanyIds = new Set<string>();
      const usedTempNameIds = new Set<string>();
      const usedTempReferenceIds = new Set<string>();

      if (data.voucherCompanyId.startsWith("temp-company-")) {
        usedTempCompanyIds.add(data.voucherCompanyId);
      }
      if (data.receivedFromId && data.receivedFromId.startsWith("temp-name-")) {
        usedTempNameIds.add(data.receivedFromId);
      }
      if (data.referenceId && data.referenceId.startsWith("temp-reference-")) {
        usedTempReferenceIds.add(data.referenceId);
      }

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

      const resolvedCompanyId = companyIdMap.get(data.voucherCompanyId) || data.voucherCompanyId;
      const resolvedNameId = data.receivedFromId
        ? (nameIdMap.get(data.receivedFromId) || data.receivedFromId)
        : null;
      const resolvedReferenceId = data.referenceId
        ? (referenceIdMap.get(data.referenceId) || data.referenceId)
        : null;

      const payload = {
        ...data,
        dateReceived: data.dateReceived.toISOString(),
        receivedFromId: resolvedNameId,
        referenceId: resolvedReferenceId,
        voucherNumber: data.voucherNumber || null,
        notes: data.notes || null,
        status: isEditing ? data.status : "unposted",
        voucherCompanyId: resolvedCompanyId,
      };

      if (isEditing) {
        return apiRequest("PATCH", `/api/vouchers/${voucher.id}`, payload);
      }
      const response = await apiRequest("POST", "/api/vouchers", payload);
      const savedVoucher = await response.json();

      if (createdCompanies.length > 0) {
        setLocalCompanies(prev => [
          ...prev.filter(c => !usedTempCompanyIds.has(c.id)),
          ...createdCompanies,
        ]);
      }
      if (createdNames.length > 0) {
        setLocalNames(prev => [
          ...prev.filter(n => !usedTempNameIds.has(n.id)),
          ...createdNames,
        ]);
      }
      if (createdReferences.length > 0) {
        setLocalReferences(prev => [
          ...prev.filter(r => !usedTempReferenceIds.has(r.id)),
          ...createdReferences,
        ]);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/voucher-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/names"] });
      queryClient.invalidateQueries({ queryKey: ["/api/references"] });

      return savedVoucher;
    },
    onSuccess: () => {
      toast({
        title: isEditing ? "Voucher updated" : "Voucher created",
        description: isEditing
          ? "The voucher has been updated successfully."
          : "The voucher has been added successfully.",
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VoucherFormValues) => {
    mutation.mutate(data);
  };

  const total = parseFloat(form.watch("amount") || "0") * (form.watch("quantity") || 1);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="dateReceived"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date Received *</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        data-testid="button-date-picker"
                        ref={(el) => setInputRef("dateReceived", el as any)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
                            event.preventDefault();
                            advanceToNextField("dateReceived");
                          }
                        }}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="voucherCompanyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Voucher Company *</FormLabel>
                <AutoCompleteDropdown
                  value={field.value}
                  displayValue={companyDisplay}
                  options={localCompanies.filter(c => c?.name).map(c => ({ id: c.id, label: c.name }))}
                  placeholder="Company name..."
                  className="h-10"
                  onValueChange={(label, id) => {
                    setCompanyDisplay(label);
                    field.onChange(id);
                    if (id) {
                      setIsNewCompany(id.startsWith("temp-company-"));
                    } else {
                      setIsNewCompany(false);
                    }
                  }}
                  onCreateNew={handleCompanyCreate}
                  onAdvance={() => advanceToNextField("company")}
                  inputRef={(el) => setInputRef("company", el)}
                  showNewBadge={isNewCompany}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="receivedFromId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Received From</FormLabel>
                <AutoCompleteDropdown
                  value={field.value || ""}
                  displayValue={receivedFromDisplay}
                  options={localNames.filter(n => n?.name).map(n => ({ id: n.id, label: n.name }))}
                  placeholder="Received from..."
                  className="h-10"
                  onValueChange={(label, id) => {
                    setReceivedFromDisplay(label);
                    field.onChange(id || undefined);
                    if (id) {
                      setIsNewName(id.startsWith("temp-name-"));
                    } else {
                      setIsNewName(false);
                    }
                  }}
                  onCreateNew={handleNameCreate}
                  onAdvance={() => advanceToNextField("receivedFrom")}
                  inputRef={(el) => setInputRef("receivedFrom", el)}
                  showNewBadge={isNewName}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="referenceId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reference</FormLabel>
                <AutoCompleteDropdown
                  value={field.value || ""}
                  displayValue={referenceDisplay}
                  options={localReferences.filter(r => r?.reference).map(r => ({ id: r.id, label: r.reference }))}
                  placeholder="Reference..."
                  className="h-10"
                  onValueChange={(label, id) => {
                    setReferenceDisplay(label);
                    field.onChange(id || undefined);
                    if (id) {
                      setIsNewReference(id.startsWith("temp-reference-"));
                    } else {
                      setIsNewReference(false);
                    }
                  }}
                  onCreateNew={handleReferenceCreate}
                  onAdvance={() => advanceToNextField("reference")}
                  inputRef={(el) => setInputRef("reference", el)}
                  showNewBadge={isNewReference}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type *</FormLabel>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className={cn(
                    "text-sm font-medium",
                    field.value === "PPV" ? "text-foreground" : "text-muted-foreground"
                  )}>
                    PPV
                  </span>
                  <Switch
                    checked={field.value === "ACC"}
                    onCheckedChange={(checked) => {
                      const newType = checked ? "ACC" : "PPV";
                      field.onChange(newType);
                      if (newType === "PPV") {
                        form.setValue("voucherNumber", "PPV");
                      } else if (form.getValues("voucherNumber") === "PPV") {
                        form.setValue("voucherNumber", "");
                      }
                    }}
                    ref={(el) => setInputRef("type", el as any)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
                        event.preventDefault();
                        advanceToNextField("type");
                      }
                    }}
                    data-testid="switch-type"
                  />
                  <span className={cn(
                    "text-sm font-medium",
                    field.value === "ACC" ? "text-foreground" : "text-muted-foreground"
                  )}>
                    ACC
                  </span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="voucherNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Voucher Number</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter voucher number"
                    {...field}
                    data-testid="input-voucher-number"
                    ref={(el) => setInputRef("voucherNumber", el)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
                        event.preventDefault();
                        advanceToNextField("voucherNumber");
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...field}
                    data-testid="input-amount"
                    ref={(el) => setInputRef("amount", el)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
                        event.preventDefault();
                        advanceToNextField("amount");
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    {...field}
                    data-testid="input-quantity"
                    ref={(el) => setInputRef("quantity", el)}
                    onFocus={(event) => event.currentTarget.select()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
                        event.preventDefault();
                        advanceToNextField("quantity");
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-end">
            <div className="w-full p-3 bg-muted rounded-md">
              <div className="text-sm text-muted-foreground">Total</div>
              <div className="text-lg font-semibold" data-testid="text-total">
                £{total.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {isEditing && (
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="unposted">Unposted</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add any additional notes..."
                  className="resize-none"
                  {...field}
                  data-testid="input-notes"
                  ref={(el) => setInputRef("notes", el)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
                      event.preventDefault();
                      advanceToNextField("notes");
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save">
            {mutation.isPending ? "Saving..." : isEditing ? "Update Voucher" : "Save Voucher"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
