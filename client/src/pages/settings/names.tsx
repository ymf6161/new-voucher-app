import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
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
import type { Name } from "@shared/schema";

const nameFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

type NameFormValues = z.infer<typeof nameFormSchema>;

export default function Names() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editName, setEditName] = useState<Name | null>(null);
  const [deleteName, setDeleteName] = useState<Name | null>(null);
  const { toast } = useToast();

  const { data: names = [], isLoading } = useQuery<Name[]>({
    queryKey: ["/api/names"],
  });

  const form = useForm<NameFormValues>({
    resolver: zodResolver(nameFormSchema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      email: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: NameFormValues) => {
      const payload = {
        ...data,
        address: data.address || null,
        phone: data.phone || null,
        email: data.email || null,
      };
      if (editName) {
        return apiRequest("PATCH", `/api/names/${editName.id}`, payload);
      }
      return apiRequest("POST", "/api/names", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/names"] });
      toast({
        title: editName ? "Name updated" : "Name created",
        description: editName
          ? "The name has been updated successfully."
          : "The name has been added successfully.",
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
      const response = await apiRequest("DELETE", `/api/names/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/names"] });
      setDeleteName(null);
      toast({
        title: "Name archived",
        description: "The name has been archived and hidden from new entries.",
      });
    },
    onError: (error: any) => {
      console.error('Delete name error:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to delete name. It may have associated vouchers.",
        variant: "destructive",
      });
      setDeleteName(null);
    },
  });

  const handleClose = () => {
    setIsDialogOpen(false);
    setEditName(null);
    form.reset();
  };

  const handleEdit = (name: Name) => {
    setEditName(name);
    form.reset({
      name: name.name,
      address: name.address || "",
      phone: name.phone || "",
      email: name.email || "",
    });
    setIsDialogOpen(true);
  };

  const columns: Column<Name>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "address", header: "Address", render: (n) => n.address || "-" },
    { key: "phone", header: "Phone", render: (n) => n.phone || "-" },
    { key: "email", header: "Email", render: (n) => n.email || "-" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Names"
        description="Manage people or causes that submit vouchers"
      >
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-name">
          <Plus className="h-4 w-4 mr-2" />
          Add Name
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          {!isLoading && names.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No names yet"
              description="Add names to track who submits vouchers."
            >
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-first-name">
                <Plus className="h-4 w-4 mr-2" />
                Add First Name
              </Button>
            </EmptyState>
          ) : (
            <DataTable
              data={names}
              columns={columns}
              isLoading={isLoading}
              searchPlaceholder="Search names..."
              searchFields={["name", "email"]}
              emptyMessage="No names found"
              actions={(name) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(name)}
                    data-testid={`button-edit-${name.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteName(name)}
                    data-testid={`button-delete-${name.id}`}
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
            <DialogTitle>{editName ? "Edit Name" : "Add New Name"}</DialogTitle>
            <DialogDescription>
              {editName ? "Update the details below." : "Enter the details below."}
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
                  {mutation.isPending ? "Saving..." : editName ? "Update" : "Add Name"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteName} onOpenChange={(open) => !open && setDeleteName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Name</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteName?.name}"? This will archive the name and hide it from new entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteName && deleteMutation.mutate(deleteName.id)}
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
