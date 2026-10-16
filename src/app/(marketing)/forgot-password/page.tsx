"use client";

import { useActionState } from "react";
import Link from "next/link";
import { MailCheckIcon } from "lucide-react";
import {
  requestPasswordResetAction,
  type PasswordActionState,
} from "@/app/(marketing)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Forgot-password form. The confirmation is intentionally the same whether
 * or not the address is registered — see the action's note on enumeration.
 */
export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<PasswordActionState, FormData>(
    requestPasswordResetAction,
    null,
  );

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a link to choose a new
            password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state?.sent ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <MailCheckIcon className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">Check your inbox</p>
                <p className="mt-1 text-emerald-700/90 dark:text-emerald-400/90">
                  If an account exists for that address, a reset link is on its
                  way. The link works once and expires in an hour.
                </p>
              </div>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              {state?.error && (
                <p className="text-sm font-medium text-destructive">
                  {state.error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}