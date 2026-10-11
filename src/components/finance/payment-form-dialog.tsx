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
  paymentMethods,
  paymentMethodLabels,
  paymentSchema,
  paymentTypes,
  paymentTypeLabels,
  type PaymentFormParsed,
  type PaymentFormValues,
} from "@/lib/validations";
import {
  createPaymentAction,
  updatePaymentAction,
} from "@/app/(dashboard)/finance/actions";

/** Today's date in the browser's local timezone, as an ISO date string. */
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

interface PaymentFormDialogProps {
  leaseOptions: { id: string; label: string }[];
  /** When present, the dialog edits this payment instead of creating one. */
  payment?: PaymentFormValues & { id: string };
}

export function PaymentFormDialog({ leaseOptions, payment }: PaymentFormDialogProps) {
  const action = payment ? updatePaymentAction : createPaymentAction;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const form = useForm<PaymentFormValues, unknown, PaymentFormParsed>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      leaseId: payment?.leaseId ?? "",
      amount: payment?.amount ?? "",
      paidDate: payment?.paidDate ?? "",
      method: payment?.method ?? "cash",
      type: payment?.type ?? "rent",
      notes: payment?.notes ?? "",
    },
  });

  // Prefill today's date when a fresh dialog opens (client-local date).
  useEffect(() => {
    if (!open || payment) return;
    if (!form.formState.dirtyFields.paidDate) {
      form.setValue("paidDate", todayIso());
    }
  }, [open, payment, form]);

  function onSubmit(values: PaymentFormParsed) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });
    if (payment) formData.set("paymentId", payment.id);

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
            variant={payment ? "ghost" : "outline"}
            size={payment ? "icon-sm" : "sm"}
          />
        }
      >
        {payment ? (
          <>
            <PencilIcon />
            <span className="sr-only">Edit payment</span>
          </>
        ) : (
          <>
            <PlusIcon />
            Add payment
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{payment ? "Edit payment" : "Add payment"}</DialogTitle>
          <DialogDescription>
            {payment
              ? "Update this income record."
              : "Record rent or other income received from a tenant."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-2 gap-4">
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
                        placeholder="1500"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paidDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date received</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      items={paymentTypes.map((t) => ({
                        value: t,
                        label: paymentTypeLabels[t],
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
                        {paymentTypes.map((t) => (
                          <SelectItem key={t} value={t}>
                            {paymentTypeLabels[t]}
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
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Method</FormLabel>
                    <Select
                      items={paymentMethods.map((m) => ({
                        value: m,
                        label: paymentMethodLabels[m],
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
                        {paymentMethods.map((m) => (
                          <SelectItem key={m} value={m}>
                            {paymentMethodLabels[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="leaseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lease</FormLabel>
                  <Select
                    items={[
                      { value: "", label: "Not linked to a lease" },
                      ...leaseOptions.map((l) => ({
                        value: l.id,
                        label: l.label,
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
                      <SelectItem value="">Not linked to a lease</SelectItem>
                      {leaseOptions.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.label}
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional notes…"
                      {...field}
                    />
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
                {pending ? "Saving…" : payment ? "Save changes" : "Add payment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
