import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, CreditCard } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PageHeader } from "@/components/page-header";
import { DataTable, Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Bank } from "@shared/schema";

const bankFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  accountNumber: z.string().optional(),
  sortCode: z.string().optional(),
});

type BankFormValues = z.infer<typeof bankFormSchema>;

export default function Banks() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editBank, setEditBank] = useState<Bank | null>(null);
  const [deleteBank, setDeleteBank] = useState<Bank | null>(null);
  const { toast } = useToast();

  const { data: banks = [], isLoading } = useQuery<Bank[]>({
    queryKey: ["/api/banks"],
  });

  const form = useForm<BankFormValues>({
    resolver: zodResolver(bankFormSchema),
    defaultValues: {
      name: "",
      accountNumber: "",
      sortCode: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: BankFormValues) => {
      const payload = {
        ...data,
        accountNumber: data.accountNumber || null,
        sortCode: data.sortCode || null,
      };
      if (editBank) {
        return apiRequest("PATCH", `/api/banks/${editBank.id}`, payload);
      }
      return apiRequest("POST", "/api/banks", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/banks"] });
      toast({
        title: editBank ? "Bank updated" : "Bank created",
        description: editBank
          ? "The bank has been updated successfully."
          : "The bank has been added successfully.",
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/banks/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/banks"] });
      setDeleteBank(null);
      toast({
        title: "Bank archived",
        description: "The bank has been archived and hidden from new entries.",
      });
    },
    onError: (error: any) => {
      console.error('Delete bank error:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to delete bank. It may have associated deposits.",
        variant: "destructive",
      });
      setDeleteBank(null);
    },
  });

  const handleClose = () => {
    setIsDialogOpen(false);
    setEditBank(null);
    form.reset();
  };

  const handleEdit = (bank: Bank) => {
    setEditBank(bank);
    form.reset({
      name: bank.name,
      accountNumber: bank.accountNumber || "",
      sortCode: bank.sortCode || "",
    });
    setIsDialogOpen(true);
  };

  const columns: Column<Bank>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "accountNumber", header: "Account Number", render: (b) => b.accountNumber || "-" },
    { key: "sortCode", header: "Sort Code", render: (b) => b.sortCode || "-" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banks"
        description="Manage destination bank accounts for deposits"
      >
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-bank">
          <Plus className="h-4 w-4 mr-2" />
          Add Bank
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          {!isLoading && banks.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No banks yet"
              description="Add bank accounts where vouchers are deposited."
            >
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-first-bank">
                <Plus className="h-4 w-4 mr-2" />
                Add First Bank
              </Button>
            </EmptyState>
          ) : (
            <DataTable
              data={banks}
              columns={columns}
              isLoading={isLoading}
              searchPlaceholder="Search banks..."
              searchFields={["name", "accountNumber"]}
              emptyMessage="No banks found"
              actions={(bank) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(bank)}
                    data-testid={`button-edit-${bank.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteBank(bank)}
                    data-testid={`button-delete-${bank.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editBank ? "Edit Bank" : "Add New Bank"}</DialogTitle>
            <DialogDescription>
              {editBank ? "Update the bank details below." : "Enter the bank details below."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-account-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sortCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Code</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-sort-code" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={mutation.isPending} data-testid="button-save">
                  {mutation.isPending ? "Saving..." : editBank ? "Update" : "Add Bank"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteBank} onOpenChange={(open) => !open && setDeleteBank(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bank</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteBank?.name}"? This will archive the bank and hide it from new entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteBank && deleteMutation.mutate(deleteBank.id)}
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
