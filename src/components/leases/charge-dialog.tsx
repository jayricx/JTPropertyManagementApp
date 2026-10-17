"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
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
import {
  chargeSchema,
  chargeTypeLabels,
  chargeTypes,
  type ChargeFormParsed,
  type ChargeFormValues,
} from "@/lib/validations";
import { formatPeriodMonth } from "@/lib/utils";
import { createChargeAction } from "@/app/(dashboard)/leases/actions";

interface ChargeDialogProps {
  leaseId: string;
  defaultMonth: string;
  monthOptions: string[];
}

export function ChargeDialog({
  leaseId,
  defaultMonth,
  monthOptions,
}: ChargeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const defaults: ChargeFormValues = {
    leaseId,
    periodMonth: defaultMonth,
    type: "dues",
    description: "",
    amount: "",
  };

  const form = useForm<ChargeFormValues, unknown, ChargeFormParsed>({
    resolver: zodResolver(chargeSchema),
    defaultValues: defaults,
  });

  function onSubmit(values: ChargeFormParsed) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });

    setError(null);
    startTransition(async () => {
      const result = await createChargeAction(null, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // Success — close, reset, and refresh the statement table.
      setOpen(false);
      form.reset(defaults);
      router.refresh();
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PlusIcon />
        Add charge
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a charge</DialogTitle>
          <DialogDescription>
            Bill the tenant for something other than rent — association dues, a
            penalty, or a manually split utility share.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      items={chargeTypes.map((t) => ({
                        value: t,
                        label: chargeTypeLabels[t],
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
                        {chargeTypes.map((t) => (
                          <SelectItem key={t} value={t}>
                            {chargeTypeLabels[t]}
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
                name="periodMonth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Month</FormLabel>
                    <Select
                      items={monthOptions.map((m) => ({
                        value: m,
                        label: formatPeriodMonth(m),
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
                        {monthOptions.map((m) => (
                          <SelectItem key={m} value={m}>
                            {formatPeriodMonth(m)}
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. October association dues"
                      {...field}
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
                  <FormLabel>Amount (₱)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="500"
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
                {pending ? "Adding…" : "Add charge"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
