import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
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
import type { VoucherCompany } from "@shared/schema";

const companyFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

type CompanyFormValues = z.infer<typeof companyFormSchema>;

export default function Companies() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<VoucherCompany | null>(null);
  const [deleteCompany, setDeleteCompany] = useState<VoucherCompany | null>(null);
  const { toast } = useToast();

  const { data: companies = [], isLoading } = useQuery<VoucherCompany[]>({
    queryKey: ["/api/voucher-companies"],
  });

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      postcode: "",
      phone: "",
      email: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: CompanyFormValues) => {
      const payload = {
        ...data,
        address: data.address || null,
        city: data.city || null,
        postcode: data.postcode || null,
        phone: data.phone || null,
        email: data.email || null,
      };
      if (editCompany) {
        return apiRequest("PATCH", `/api/voucher-companies/${editCompany.id}`, payload);
      }
      return apiRequest("POST", "/api/voucher-companies", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voucher-companies"] });
      toast({
        title: editCompany ? "Company updated" : "Company created",
        description: editCompany
          ? "The company has been updated successfully."
          : "The company has been added successfully.",
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
      const response = await apiRequest("DELETE", `/api/voucher-companies/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voucher-companies"] });
      setDeleteCompany(null);
      toast({
        title: "Company archived",
        description: "The company has been archived and hidden from new entries.",
      });
    },
    onError: (error: any) => {
      console.error('Delete company error:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to delete company. It may have associated vouchers.",
        variant: "destructive",
      });
      setDeleteCompany(null);
    },
  });

  const handleClose = () => {
    setIsDialogOpen(false);
    setEditCompany(null);
    form.reset();
  };

  const handleEdit = (company: VoucherCompany) => {
    setEditCompany(company);
    form.reset({
      name: company.name,
      address: company.address || "",
      city: company.city || "",
      postcode: company.postcode || "",
      phone: company.phone || "",
      email: company.email || "",
    });
    setIsDialogOpen(true);
  };

  const columns: Column<VoucherCompany>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "address", header: "Address", render: (c) => c.address || "-" },
    { key: "city", header: "City", render: (c) => c.city || "-" },
    { key: "postcode", header: "Postcode", render: (c) => c.postcode || "-" },
    { key: "phone", header: "Phone", render: (c) => c.phone || "-" },
    { key: "email", header: "Email", render: (c) => c.email || "-" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voucher Companies"
        description="Manage organizations that process vouchers"
      >
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-company">
          <Plus className="h-4 w-4 mr-2" />
          Add Company
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          {!isLoading && companies.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No companies yet"
              description="Add voucher companies to start tracking vouchers."
            >
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-first-company">
                <Plus className="h-4 w-4 mr-2" />
                Add First Company
              </Button>
            </EmptyState>
          ) : (
            <DataTable
              data={companies}
              columns={columns}
              isLoading={isLoading}
              searchPlaceholder="Search companies..."
              searchFields={["name", "city", "email"]}
              emptyMessage="No companies found"
              actions={(company) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(company)}
                    data-testid={`button-edit-${company.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteCompany(company)}
                    data-testid={`button-delete-${company.id}`}
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
            <DialogTitle>{editCompany ? "Edit Company" : "Add New Company"}</DialogTitle>
            <DialogDescription>
              {editCompany
                ? "Update the company details below."
                : "Enter the company details below."}
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
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-city" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="postcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postcode</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-postcode" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-email" />
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
                  {mutation.isPending ? "Saving..." : editCompany ? "Update" : "Add Company"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCompany} onOpenChange={(open) => !open && setDeleteCompany(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Company</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteCompany?.name}"? This will archive the company and hide it from new entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCompany && deleteMutation.mutate(deleteCompany.id)}
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
