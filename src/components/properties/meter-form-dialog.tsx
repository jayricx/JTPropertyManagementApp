"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import {
  meterConsumptionUnits,
  meterSchema,
  meterTypeLabels,
  meterTypes,
  type MeterFormParsed,
  type MeterFormValues,
  type MeterType,
} from "@/lib/validations";
import { saveMeterAction } from "@/app/(dashboard)/properties/utility-actions";

interface MeterFormDialogProps {
  propertyId: string;
  unitOptions: { id: string; label: string }[];
  /** When present, the dialog edits this meter instead of creating one. */
  meter?: {
    id: string;
    unitId: string;
    type: MeterType;
    label: string | null;
    rate: number;
  };
  /** "button" for the card header, "icon" for a table row. */
  trigger?: "button" | "icon";
}

export function MeterFormDialog({
  propertyId,
  unitOptions,
  meter,
  trigger = "button",
}: MeterFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Tracked locally so the rate label can follow the type without a
  // `form.watch()` call (which React Compiler can't memoize safely).
  const [meterType, setMeterType] = useState<MeterType>(meter?.type ?? "electric");

  const form = useForm<MeterFormValues, unknown, MeterFormParsed>({
    resolver: zodResolver(meterSchema),
    defaultValues: {
      unitId: meter?.unitId ?? unitOptions[0]?.id ?? "",
      type: meter?.type ?? "electric",
      label: meter?.label ?? "",
      rate: meter?.rate ?? "",
    },
  });

  function onSubmit(values: MeterFormParsed) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });
    formData.set("propertyId", propertyId);
    if (meter) formData.set("meterId", meter.id);

    setError(null);
    startTransition(async () => {
      const result = await saveMeterAction(null, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // Success — close, reset, and refresh the server components behind us.
      setOpen(false);
      form.reset();
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
      <DialogTrigger
        render={
          <Button
            variant={trigger === "icon" ? "ghost" : "outline"}
            size={trigger === "icon" ? "icon-sm" : "sm"}
          />
        }
      >
        {trigger === "icon" ? (
          <>
            <PencilIcon />
            <span className="sr-only">Edit meter</span>
          </>
        ) : (
          <>
            <PlusIcon />
            Add meter
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{meter ? "Edit meter" : "Add utility meter"}</DialogTitle>
          <DialogDescription>
            {meter
              ? "Update this meter's unit, type, or default rate."
              : "Track electricity or water consumed by a unit and bill the tenant for it."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="unitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <Select
                    items={unitOptions.map((u) => ({
                      value: u.id,
                      label: u.label,
                    }))}
                    value={field.value}
                    onValueChange={(v) => field.onChange(v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a unit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {unitOptions.map((u) => (
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      items={meterTypes.map((t) => ({
                        value: t,
                        label: meterTypeLabels[t],
                      }))}
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        setMeterType(v as MeterType);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {meterTypes.map((t) => (
                          <SelectItem key={t} value={t}>
                            {meterTypeLabels[t]}
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
                name="rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Rate (₱/{meterConsumptionUnits[meterType]})
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.0001"
                        placeholder="12.50"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Meralco submeter" {...field} />
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
                {pending ? "Saving…" : meter ? "Save changes" : "Add meter"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
