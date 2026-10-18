"use client";

import { useActionState, useSyncExternalStore } from "react";
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
  transport,
  sender,
  sharedSender,
  configured,
  appUrl,
  appUrlLooksLocal,
}: {
  transport: "gmail" | "resend" | "log";
  sender: string;
  sharedSender: boolean;
  configured: boolean;
  appUrl: string;
  appUrlLooksLocal: boolean;
}) {
  const transportLabel =
    transport === "gmail"
      ? "Gmail SMTP — reaches any recipient"
      : transport === "resend"
        ? "Resend"
        : "Not configured — logging only";
  const [state, formAction, pending] = useActionState<TestEmailState, FormData>(
    sendTestEmailAction,
    null,
  );

  // The site being viewed, resolved after hydration. Compared against
  // AUTH_URL below: a mismatch means every link in every email points at a
  // different host than the one people are actually using.
  const currentHost = useSyncExternalStore(
    () => () => {},
    () => window.location.host,
    () => null,
  );
  const linkHost = (() => {
    try {
      return new URL(appUrl).host;
    } catch {
      return null;
    }
  })();
  const hostMismatch =
    currentHost !== null && linkHost !== null && currentHost !== linkHost;

  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">Sending via</dt>
        <dd className="font-medium break-all">{transportLabel}</dd>

        <dt className="text-muted-foreground">Sending as</dt>
        <dd className="font-medium break-all">{sender}</dd>

        <dt className="text-muted-foreground">Links point to</dt>
        <dd className="font-medium break-all">{appUrl}</dd>
      </dl>

      {hostMismatch && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Links inside emails point to <strong>{linkHost}</strong>, but this
          site is <strong>{currentHost}</strong>. Every password-reset link will
          land on the wrong address — fix <code>AUTH_URL</code> and redeploy.
        </p>
      )}

      {!configured && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Email isn&apos;t configured, so messages are only written to the server
          log — nothing is actually sent. Set <code>GMAIL_USER</code> and{" "}
          <code>GMAIL_APP_PASSWORD</code> to send from your own Gmail address,
          or set <code>RESEND_API_KEY</code> to send through Resend.
        </p>
      )}

      {configured && sharedSender && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Using Resend&apos;s shared sender, which only delivers to the address
          on your Resend account. Any other recipient is refused. Verify a domain
          and set <code>EMAIL_FROM</code> to reach everyone else.
        </p>
      )}

      {/* Every emailed link is built from this host, so a wrong one breaks
          contract signing for all recipients at once — and the failure shows up
          as "the link does nothing" in someone else's inbox. */}
      {appUrlLooksLocal && configured && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Links inside emails point at <code>{appUrl}</code>, which only works on
          your own machine. Set <code>AUTH_URL</code> to this deployment&apos;s
          public address, or tenants will receive links that open nothing.
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