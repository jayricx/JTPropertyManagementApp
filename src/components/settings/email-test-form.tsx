"use client";

import { useActionState } from "react";
import { MailIcon, SendIcon } from "lucide-react";
import {
  sendTestEmailAction,
  type TestEmailState,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";

/**
 * Delivery self-test. Shows the sender and link target the server is actually
 * using, then reports the provider's verdict — the usual causes of a silent
 * failure (no API key, an unverified sender, a shared sender that only reaches
 * one address, links pointing at the wrong host) are all visible here.
 */
export function EmailTestForm({
  sender,
  sharedSender,
  configured,
  appUrl,
}: {
  sender: string;
  sharedSender: boolean;
  configured: boolean;
  appUrl: string;
}) {
  const [state, formAction, pending] = useActionState<TestEmailState, FormData>(
    sendTestEmailAction,
    null,
  );

  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">Sending as</dt>
        <dd className="font-medium break-all">{sender}</dd>

        <dt className="text-muted-foreground">Links point to</dt>
        <dd className="font-medium break-all">{appUrl}</dd>
      </dl>

      {!configured && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          No <code>RESEND_API_KEY</code> is set, so emails are only written to the
          server log — nothing is actually sent.
        </p>
      )}

      {configured && sharedSender && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Using Resend&apos;s shared sender, which only delivers to the address
          on your Resend account. Any other recipient is refused. Verify a domain
          and set <code>EMAIL_FROM</code> to reach everyone else.
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="intent" value="test-email" />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <MailIcon /> : <SendIcon />}
          {pending ? "Sending…" : "Send a test email to me"}
        </Button>
      </form>

      {state && (
        <div
          className={
            state.status === "sent"
              ? "flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          }
        >
          {state.status === "sent" ? (
            <CircleCheckIcon className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          )}
          <p>{state.detail}</p>
        </div>
      )}
    </div>
  );
}