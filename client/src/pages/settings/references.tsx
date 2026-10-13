import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import type { Reference } from "@shared/schema";

const referenceFormSchema = z.object({
  reference: z.string().min(1, "Reference is required"),
  notes: z.string().optional(),
  contact: z.string().optional(),
});

type ReferenceFormValues = z.infer<typeof referenceFormSchema>;

export default function References() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editReference, setEditReference] = useState<Reference | null>(null);
  const [deleteReference, setDeleteReference] = useState<Reference | null>(null);
  const { toast } = useToast();

  const { data: references = [], isLoading } = useQuery<Reference[]>({
    queryKey: ["/api/references"],
  });

  const form = useForm<ReferenceFormValues>({
    resolver: zodResolver(referenceFormSchema),
    defaultValues: {
      reference: "",
      notes: "",
      contact: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: ReferenceFormValues) => {
      const payload = {
        ...data,
        notes: data.notes || null,
        contact: data.contact || null,
      };
      if (editReference) {
        return apiRequest("PATCH", `/api/references/${editReference.id}`, payload);
      }
      return apiRequest("POST", "/api/references", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/references"] });
      toast({
        title: editReference ? "Reference updated" : "Reference created",
        description: editReference
          ? "The reference has been updated successfully."
          : "The reference has been added successfully.",
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
      const response = await apiRequest("DELETE", `/api/references/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/references"] });
      setDeleteReference(null);
      toast({
        title: "Reference archived",
        description: "The reference has been archived and hidden from new entries.",
      });
    },
    onError: (error: any) => {
      console.error('Delete reference error:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to delete reference. It may have associated vouchers.",
        variant: "destructive",
      });
      setDeleteReference(null);
    },
  });

  const handleClose = () => {
    setIsDialogOpen(false);
    setEditReference(null);
    form.reset();
  };

  const handleEdit = (reference: Reference) => {
    setEditReference(reference);
    form.reset({
      reference: reference.reference,
      notes: reference.notes || "",
      contact: reference.contact || "",
    });
    setIsDialogOpen(true);
  };

  const columns: Column<Reference>[] = [
    { key: "reference", header: "Reference", sortable: true },
    { key: "contact", header: "Contact", render: (r) => r.contact || "-" },
    {
      key: "notes",
      header: "Notes",
      render: (r) => (
        <span className="text-muted-foreground truncate max-w-[300px] block">
          {r.notes || "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="References"
        description="Manage tracking references for vouchers"
      >
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-reference">
          <Plus className="h-4 w-4 mr-2" />
          Add Reference
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          {!isLoading && references.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No references yet"
              description="Add references to categorize and track vouchers."
            >
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-first-reference">
                <Plus className="h-4 w-4 mr-2" />
                Add First Reference
              </Button>
            </EmptyState>
          ) : (
            <DataTable
              data={references}
              columns={columns}
              isLoading={isLoading}
              searchPlaceholder="Search references..."
              searchFields={["reference", "notes", "contact"]}
              emptyMessage="No references found"
              actions={(reference) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(reference)}
                    data-testid={`button-edit-${reference.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteReference(reference)}
                    data-testid={`button-delete-${reference.id}`}
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
            <DialogTitle>{editReference ? "Edit Reference" : "Add New Reference"}</DialogTitle>
            <DialogDescription>
              {editReference ? "Update the details below." : "Enter the details below."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-reference" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-contact" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        className="resize-none"
                        {...field}
                        data-testid="input-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={mutation.isPending} data-testid="button-save">
                  {mutation.isPending ? "Saving..." : editReference ? "Update" : "Add Reference"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteReference} onOpenChange={(open) => !open && setDeleteReference(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reference</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteReference?.reference}"? This will archive the reference and hide it from new entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteReference && deleteMutation.mutate(deleteReference.id)}
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
