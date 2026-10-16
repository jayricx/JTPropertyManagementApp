"use client";

import { useActionState, useEffect, useState } from "react";
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
  unitSchema,
  unitStatuses,
  unitStatusLabels,
  type UnitFormParsed,
  type UnitFormValues,
} from "@/lib/validations";
import {
  createUnitAction,
  suggestRentAction,
  updateUnitAction,
  type ActionState,
} from "@/app/(dashboard)/properties/actions";
import { SuggestionChip } from "@/components/ai/suggestion-chip";
import type { RentSuggestion } from "@/lib/rent-insights";

interface UnitFormDialogProps {
  propertyId: string;
  /** When present, the dialog edits this unit instead of creating one. */
  unit?: UnitFormValues & { id: string };
}

export function UnitFormDialog({ propertyId, unit }: UnitFormDialogProps) {
  const action = unit ? updateUnitAction : createUnitAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );

  // Rent suggestion from comparable units in this property (or the wider
  // city when the property has too few of them).
  const unitId = unit?.id;
  const [rentHint, setRentHint] = useState<RentSuggestion | null>(null);
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    suggestRentAction(unitId ? { unitId } : { propertyId })
      .then((result) => {
        if (!cancelled) setRentHint(result);
      })
      .catch(() => {
        if (!cancelled) setRentHint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, unitId]);

  const form = useForm<UnitFormValues, unknown, UnitFormParsed>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      name: unit?.name ?? "",
      bedrooms: unit?.bedrooms ?? "",
      bathrooms: unit?.bathrooms ?? "",
      rentAmount: unit?.rentAmount ?? "",
      sqft: unit?.sqft ?? "",
      status: unit?.status ?? "vacant",
      notes: unit?.notes ?? "",
    },
  });

  function onSubmit(values: UnitFormParsed) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });
    formData.set("propertyId", propertyId);
    if (unit) formData.set("unitId", unit.id);
    formAction(formData);
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant={unit ? "ghost" : "outline"}
            size={unit ? "icon-sm" : "sm"}
          />
        }
      >
        {unit ? (
          <>
            <PencilIcon />
            <span className="sr-only">Edit unit {unit.name}</span>
          </>
        ) : (
          <>
            <PlusIcon />
            Add unit
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{unit ? "Edit unit" : "Add unit"}</DialogTitle>
          <DialogDescription>
            {unit
              ? "Update this unit's details."
              : "Add a new unit to this property."}
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit name</FormLabel>
                  <FormControl>
                    <Input placeholder="Apt 1B" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="bedrooms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bedrooms</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder="2"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bathrooms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bathrooms</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.5"
                        placeholder="1.5"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {rentHint && !applied && !form.formState.dirtyFields.rentAmount && (
                <div className="col-span-full">
                  <SuggestionChip
                    title={rentHint.headline}
                    detail={`Range ₱${rentHint.low.toLocaleString("en-PH")}–₱${rentHint.high.toLocaleString("en-PH")} · ${rentHint.reasons[0] ?? ""}`}
                    source={rentHint.source}
                    onApply={() => {
                      form.setValue("rentAmount", String(rentHint.suggestedRent), {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      setApplied(true);
                    }}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="rentAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly rent (₱)</FormLabel>
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
                name="sqft"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Square feet</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder="850"
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
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select
                    items={unitStatuses.map((s) => ({
                      value: s,
                      label: unitStatusLabels[s],
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
                      {unitStatuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {unitStatusLabels[s]}
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
                      placeholder="Optional notes about this unit…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {state?.error && (
              <p className="text-sm font-medium text-destructive">
                {state.error}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : unit ? "Save changes" : "Add unit"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
