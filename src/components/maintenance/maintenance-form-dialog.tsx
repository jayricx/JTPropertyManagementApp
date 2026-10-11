"use client";

import { useTransition, useState } from "react";
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
  maintenancePriorities,
  maintenancePriorityLabels,
  maintenanceSchema,
  maintenanceStatuses,
  maintenanceStatusLabels,
  type MaintenanceFormParsed,
  type MaintenanceFormValues,
} from "@/lib/validations";
import {
  createMaintenanceAction,
  updateMaintenanceAction,
} from "@/app/(dashboard)/maintenance/actions";

export interface MaintenanceUnitOption {
  id: string;
  propertyId: string;
  label: string;
}

interface MaintenanceFormDialogProps {
  propertyOptions: { id: string; label: string }[];
  unitOptions: MaintenanceUnitOption[];
  tenantOptions: { id: string; label: string }[];
  /** When present, the dialog edits this request instead of creating one. */
  request?: MaintenanceFormValues & { id: string };
}

export function MaintenanceFormDialog({
  propertyOptions,
  unitOptions,
  tenantOptions,
  request,
}: MaintenanceFormDialogProps) {
  const action = request ? updateMaintenanceAction : createMaintenanceAction;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const form = useForm<MaintenanceFormValues, unknown, MaintenanceFormParsed>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      propertyId: request?.propertyId ?? "",
      unitId: request?.unitId ?? "",
      tenantId: request?.tenantId ?? "",
      title: request?.title ?? "",
      description: request?.description ?? "",
      status: request?.status ?? "new",
      priority: request?.priority ?? "medium",
      cost: request?.cost ?? "",
    },
  });

  const selectedPropertyId = form.watch("propertyId");
  const visibleUnits = unitOptions.filter(
    (u) => u.propertyId === selectedPropertyId,
  );

  function onSubmit(values: MaintenanceFormParsed) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });
    if (request) formData.set("requestId", request.id);

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
            variant={request ? "ghost" : "outline"}
            size={request ? "icon-sm" : "sm"}
          />
        }
      >
        {request ? (
          <>
            <PencilIcon />
            <span className="sr-only">Edit request</span>
          </>
        ) : (
          <>
            <PlusIcon />
            New request
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {request ? "Edit request" : "New request"}
          </DialogTitle>
          <DialogDescription>
            {request
              ? "Update this maintenance request."
              : "Log a repair or maintenance issue for one of your units."}
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
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Leaking kitchen sink" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
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
                      items={visibleUnits.map((u) => ({
                        value: u.id,
                        label: u.label,
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tenantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenant</FormLabel>
                    <Select
                      items={[
                        { value: "", label: "No tenant reported" },
                        ...tenantOptions.map((t) => ({
                          value: t.id,
                          label: t.label,
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
                        <SelectItem value="">No tenant reported</SelectItem>
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
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select
                      items={maintenancePriorities.map((p) => ({
                        value: p,
                        label: maintenancePriorityLabels[p],
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
                        {maintenancePriorities.map((p) => (
                          <SelectItem key={p} value={p}>
                            {maintenancePriorityLabels[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      items={maintenanceStatuses.map((s) => ({
                        value: s,
                        label: maintenanceStatusLabels[s],
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
                        {maintenanceStatuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {maintenanceStatusLabels[s]}
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
                name="cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost (₱)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        placeholder="Optional"
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional details — what's broken, access notes…"
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
                {pending ? "Saving…" : request ? "Save changes" : "Create request"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
