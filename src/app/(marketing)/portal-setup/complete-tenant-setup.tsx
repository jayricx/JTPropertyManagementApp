"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTransition } from "react";
import { KeyRoundIcon } from "lucide-react";
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

interface CompleteTenantSetupProps {
  /** The emailed token, read on the server. Empty when the link is incomplete. */
  token: string;
}

/**
 * The "set your own password" page for a tenant who was invited. It exists only
 * for the link in an invite email — no other route links here — so the token
 * arrives as a prop rather than through `useSearchParams()`, keeping the route
 * statically renderable.
 */
export function CompleteTenantSetup({ token }: CompleteTenantSetupProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/auth/complete-portal-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "That link is invalid or has expired.");
        return;
      }
      const signedIn = await signIn("credentials", {
        email: result.email,
        password,
        redirect: false,
      });
      if (signedIn.error) {
        router.push("/login");
        return;
      }
      router.push("/portal");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set up your portal</CardTitle>
          <CardDescription>
            Choose a password to finish setting up your tenant portal. It works
            once — after that, sign in with your email and this password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p className="text-sm text-muted-foreground">
              This link is incomplete. Ask your landlord for a new invite.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium leading-none"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  className="sm:flex-1"
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="confirm"
                  className="text-sm font-medium leading-none"
                >
                  Confirm password
                </label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm font-medium text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Setting up…" : "Set up my portal"}
              </Button>
              <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                <KeyRoundIcon className="size-4" />
                Your landlord gave you this link so you can start using your
                tenant portal.
              </p>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
            {" — if you already have an account"}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}