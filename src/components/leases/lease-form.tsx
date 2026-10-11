"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
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
  leaseSchema,
  leaseStatuses,
  leaseStatusLabels,
  type LeaseFormParsed,
  type LeaseFormValues,
} from "@/lib/validations";
import {
  createLeaseAction,
  updateLeaseAction,
  type ActionState,
} from "@/app/(dashboard)/leases/actions";

export interface LeaseUnitOption {
  id: string;
  label: string;
  /** Unit's listed rent — pre-fills the rent field when still pristine. */
  rentAmount: string | null;
}

export interface LeaseTenantOption {
  id: string;
  label: string;
}

interface LeaseFormProps {
  /** When present, the form edits this lease instead of creating one. */
  lease?: LeaseFormValues & { id: string };
  unitOptions: LeaseUnitOption[];
  tenantOptions: LeaseTenantOption[];
}

export function LeaseForm({ lease, unitOptions, tenantOptions }: LeaseFormProps) {
  const action = lease ? updateLeaseAction : createLeaseAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );

  const form = useForm<LeaseFormValues, unknown, LeaseFormParsed>({
    resolver: zodResolver(leaseSchema),
    defaultValues: {
      unitId: lease?.unitId ?? "",
      tenantId: lease?.tenantId ?? "",
      startDate: lease?.startDate ?? "",
      endDate: lease?.endDate ?? "",
      rentAmount: lease?.rentAmount ?? "",
      depositAmount: lease?.depositAmount ?? "",
      depositReturned: lease?.depositReturned ?? "",
      status: lease?.status ?? "active",
      notes: lease?.notes ?? "",
    },
  });

  function onSubmit(values: LeaseFormParsed) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });
    if (lease) formData.set("leaseId", lease.id);
    formAction(formData);
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{lease ? "Edit lease" : "Add lease"}</CardTitle>
        <CardDescription>
          {lease
            ? "Update this lease's terms. Active leases keep the unit marked occupied."
            : "Assign a tenant to a unit. Active leases keep the unit marked occupied."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="tenantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenant</FormLabel>
                    <Select
                      items={tenantOptions.map((t) => ({
                        value: t.id,
                        label: t.label,
                      }))}
                      value={field.value || null}
                      onValueChange={(v) => field.onChange(v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tenantOptions.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
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
                      items={unitOptions.map((u) => ({
                        value: u.id,
                        label: u.label,
                      }))}
                      value={field.value || null}
                      onValueChange={(v) => {
                        field.onChange(v);
                        // Prefill the rent from the unit's listed amount —
                        // but never overwrite what the user already typed.
                        const unit = unitOptions.find((u) => u.id === v);
                        if (
                          unit?.rentAmount &&
                          !form.formState.dirtyFields.rentAmount
                        ) {
                          form.setValue("rentAmount", unit.rentAmount, {
                            shouldDirty: false,
                          });
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
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
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>Leave empty for open-ended.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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
                name="depositAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Security deposit (₱)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        placeholder="3000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      items={leaseStatuses.map((s) => ({
                        value: s,
                        label: leaseStatusLabels[s],
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
                        {leaseStatuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {leaseStatusLabels[s]}
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
                name="depositReturned"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-end gap-2 pb-2">
                    <FormControl>
                      <input
                        type="checkbox"
                        name={field.name}
                        ref={field.ref}
                        checked={field.value === "on"}
                        onChange={(e) =>
                          field.onChange(e.target.checked ? "on" : "")
                        }
                        className="size-4 rounded border-input accent-primary"
                      />
                    </FormControl>
                    <FormLabel className="mb-0 font-normal">
                      Deposit returned to tenant
                    </FormLabel>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional notes about this lease…"
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
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : lease ? "Save changes" : "Create lease"}
              </Button>
              <Button variant="outline" render={<Link href="/leases" />}>
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
