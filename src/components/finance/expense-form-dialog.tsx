"use client";

import { useEffect, useTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  expenseCategories,
  expenseCategoryLabels,
  expenseSchema,
  type ExpenseFormParsed,
  type ExpenseFormValues,
} from "@/lib/validations";
import {
  createExpenseAction,
  updateExpenseAction,
} from "@/app/(dashboard)/finance/actions";

/** Today's date in the browser's local timezone, as an ISO date string. */
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export interface ExpenseUnitOption {
  id: string;
  propertyId: string;
  label: string;
}

interface ExpenseFormDialogProps {
  propertyOptions: { id: string; label: string }[];
  unitOptions: ExpenseUnitOption[];
  /** When present, the dialog edits this expense instead of creating one. */
  expense?: ExpenseFormValues & { id: string };
}

export function ExpenseFormDialog({
  propertyOptions,
  unitOptions,
  expense,
}: ExpenseFormDialogProps) {
  const action = expense ? updateExpenseAction : createExpenseAction;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const form = useForm<ExpenseFormValues, unknown, ExpenseFormParsed>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      propertyId: expense?.propertyId ?? "",
      unitId: expense?.unitId ?? "",
      category: expense?.category ?? "repair",
      amount: expense?.amount ?? "",
      expenseDate: expense?.expenseDate ?? "",
      vendor: expense?.vendor ?? "",
      notes: expense?.notes ?? "",
    },
  });

  const selectedPropertyId = form.watch("propertyId");
  const visibleUnits = unitOptions.filter(
    (u) => u.propertyId === selectedPropertyId,
  );

  // Prefill today's date when a fresh dialog opens (client-local date).
  useEffect(() => {
    if (!open || expense) return;
    if (!form.formState.dirtyFields.expenseDate) {
      form.setValue("expenseDate", todayIso());
    }
  }, [open, expense, form]);

  function onSubmit(values: ExpenseFormParsed) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });
    if (expense) formData.set("expenseId", expense.id);

    setError(null);
    startTransition(async () => {
      const result = await action(null, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // Success — close and reset the dialog.
      setOpen(false);
      form.reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant={expense ? "ghost" : "outline"}
            size={expense ? "icon-sm" : "sm"}
          />
        }
      >
        {expense ? (
          <>
            <PencilIcon />
            <span className="sr-only">Edit expense</span>
          </>
        ) : (
          <>
            <PlusIcon />
            Add expense
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>
            {expense
              ? "Update this expense record."
              : "Record a property expense — repairs, taxes, utilities, and more."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₱)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        placeholder="2500"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expenseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    items={expenseCategories.map((c) => ({
                      value: c,
                      label: expenseCategoryLabels[c],
                    }))}
                    value={field.value}
                    onValueChange={(v) => field.onChange(v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {expenseCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {expenseCategoryLabels[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="propertyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property</FormLabel>
                  <Select
                    items={propertyOptions.map((p) => ({
                      value: p.id,
                      label: p.label,
                    }))}
                    value={field.value || null}
                    onValueChange={(v) => {
                      field.onChange(v);
                      // Units from the previous property no longer apply.
                      const current = form.getValues("unitId");
                      if (
                        current &&
                        !unitOptions.some(
                          (u) => u.id === current && u.propertyId === v,
                        )
                      ) {
                        form.setValue("unitId", "");
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {propertyOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <Select
                    items={[
                      { value: "", label: "Whole property" },
                      ...visibleUnits.map((u) => ({
                        value: u.id,
                        label: u.label,
                      })),
                    ]}
                    value={field.value ?? ""}
                    onValueChange={(v) => field.onChange(v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Whole property</SelectItem>
                      {visibleUnits.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vendor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Home Repairs Manila" {...field} />
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
                    <Textarea placeholder="Optional notes…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : expense ? "Save changes" : "Add expense"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
