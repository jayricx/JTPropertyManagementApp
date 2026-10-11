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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  tenantSchema,
  type TenantFormParsed,
  type TenantFormValues,
} from "@/lib/validations";
import {
  createTenantAction,
  updateTenantAction,
  type ActionState,
} from "@/app/(dashboard)/tenants/actions";

interface TenantFormProps {
  /** When present, the form edits this tenant instead of creating one. */
  tenant?: TenantFormValues & { id: string };
}

export function TenantForm({ tenant }: TenantFormProps) {
  const action = tenant ? updateTenantAction : createTenantAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );

  const form = useForm<TenantFormValues, unknown, TenantFormParsed>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      firstName: tenant?.firstName ?? "",
      lastName: tenant?.lastName ?? "",
      email: tenant?.email ?? "",
      phone: tenant?.phone ?? "",
      notes: tenant?.notes ?? "",
    },
  });

  function onSubmit(values: TenantFormParsed) {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });
    if (tenant) formData.set("tenantId", tenant.id);
    formAction(formData);
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{tenant ? "Edit tenant" : "Add tenant"}</CardTitle>
        <CardDescription>
          {tenant
            ? "Update this tenant's contact details."
            : "Add a tenant to your roster. You can assign them a lease afterwards."}
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
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input placeholder="Juan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input placeholder="Dela Cruz" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="juan@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+63 917 123 4567" {...field} />
                    </FormControl>
                    <FormMessage />
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
                      placeholder="Optional notes about this tenant…"
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
                {pending
                  ? "Saving…"
                  : tenant
                    ? "Save changes"
                    : "Create tenant"}
              </Button>
              <Button
                variant="outline"
                render={<Link href="/tenants" />}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
