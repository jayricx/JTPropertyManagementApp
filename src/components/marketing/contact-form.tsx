"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2Icon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  contactSchema,
  type ContactFormValues,
  type ContactFormParsed,
} from "@/lib/validations";
import { submitContactAction, type ContactActionState } from "@/app/(marketing)/contact/actions";

const defaults: ContactFormValues = {
  name: "",
  email: "",
  subject: "",
  message: "",
  website: "",
};

export function ContactForm() {
  const [state, formAction, pending] = useActionState<ContactActionState, FormData>(
    submitContactAction,
    null,
  );

  const form = useForm<ContactFormValues, unknown, ContactFormParsed>({
    resolver: zodResolver(contactSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit((data) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });
    formAction(formData);
  });

  if (state?.success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/40 p-8 text-center">
        <CheckCircle2Icon className="size-8 text-primary" />
        <p className="font-medium">Got it — thanks for writing.</p>
        <p className="text-sm text-muted-foreground">
          We&apos;ll reply to your email within a few days, depending on the
          request. If it&apos;s urgent, reach out on Facebook.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your name</FormLabel>
                <FormControl>
                  <Input placeholder="Juan dela Cruz" {...field} />
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
                  <Input
                    type="email"
                    placeholder="you@example.com"
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
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Can't add a tenant to my lease" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea
                  rows={5}
                  placeholder="What happened, and what did you expect?"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Honeypot — visually hidden, must stay empty. */}
        <div className="hidden" aria-hidden="true">
          <Input
            tabIndex={-1}
            autoComplete="off"
            {...form.register("website")}
          />
        </div>

        {state?.error && (
          <p className="text-sm font-medium text-destructive">{state.error}</p>
        )}

        <Button type="submit" disabled={pending}>
          <SendIcon />
          {pending ? "Sending…" : "Send message"}
        </Button>
      </form>
    </Form>
  );
}