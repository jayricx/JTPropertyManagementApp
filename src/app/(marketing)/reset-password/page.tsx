"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheckIcon, KeyRoundIcon } from "lucide-react";
import {
  resetPasswordAction,
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
 * Sets a new password from an emailed link. The token is burned by the
 * action, so reloading this page after success just re-shows the form with
 * a spent link — hence the redirect to sign-in on success.
 */
export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, formAction, pending] = useActionState<PasswordActionState, FormData>(
    resetPasswordAction,
    null,
  );

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            {state?.ok
              ? "Your password has been changed."
              : "Pick something you haven't used before. You'll sign in with it everywhere, including your phone."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state?.ok ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <CircleCheckIcon className="mt-0.5 size-5 shrink-0" />
              <p>
                Password updated. Any other signed-in devices have been signed
                out for safety.
              </p>
            </div>
          ) : !token ? (
            <p className="text-sm text-muted-foreground">
              This link is missing its reset code.{" "}
              <Link
                href="/forgot-password"
                className="font-medium text-primary hover:underline"
              >
                Request a new link
              </Link>
              .
            </p>
          ) : (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              {state?.error && (
                <p className="text-sm font-medium text-destructive">
                  {state.error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                <KeyRoundIcon />
                {pending ? "Saving…" : "Set new password"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Go to sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}