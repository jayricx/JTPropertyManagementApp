"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { KeyRoundIcon } from "lucide-react";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
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
  /** Whether Google is configured; the button is hidden when it is not. */
  googleEnabled: boolean;
  /**
   * The email of the account already signed in, if any. Set on the return trip
   * from "Continue with Google" (and for an owner who happens to be signed in)
   * — the invite is then linked to it without a password.
   */
  signedInEmail: string | null;
}

/**
 * The "set your own password" page for a tenant who was invited. It exists only
 * for the link in an invite email — no other route links here — so the token
 * arrives as a prop rather than through `useSearchParams()`, keeping the route
 * statically renderable.
 *
 * A tenant can either choose a password or bring their own identity with
 * Google. The Google path leaves this page for Google's consent screen and
 * comes back signed in, at which point the effect below attaches the invite.
 */
export function CompleteTenantSetup({
  token,
  googleEnabled,
  signedInEmail,
}: CompleteTenantSetupProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkedExisting, setLinkedExisting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [claimError, setClaimError] = useState<string | null>(null);
  const claimed = useRef(false);

  // Returning from Google: the account is signed in, so finish the link here
  // instead of asking for a password. A ref guards the single-use token against
  // a double invocation from a re-render.
  useEffect(() => {
    if (!token || !signedInEmail || claimed.current) return;
    claimed.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/complete-portal-setup/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setClaimError(
            result.error ?? "We couldn't link this invite to your account.",
          );
          return;
        }
        router.replace("/portal");
        router.refresh();
      } catch {
        setClaimError("Something went wrong. Please try again.");
      }
    })();
  }, [token, signedInEmail, router]);

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
      // The address already belongs to an account (e.g. an owner who rents
      // from another owner). The invite is linked to it, but their password is
      // theirs — send them to sign in rather than signing in as them here.
      if (result.linkedExisting) {
        setLinkedExisting(true);
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

  if (!token) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Set up your portal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This link is incomplete. Ask your landlord for a new invite.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // An already-signed-in visitor: the invite is being attached to their
  // account right now. Errors here are almost always "wrong Google account",
  // so offer to sign out and try again rather than a password field they may
  // not want.
  if (signedInEmail) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              {claimError ? "Could not link this invite" : "Finishing your setup"}
            </CardTitle>
            <CardDescription>
              {claimError ?? "Linking this invite to your account."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You are signed in as <span className="font-medium">{signedInEmail}</span>.
            </p>
            {claimError ? (
              <>
                <Button
                  className="w-full"
                  onClick={() =>
                    void signOut({
                      callbackUrl: `/portal-setup?token=${encodeURIComponent(token)}`,
                    })
                  }
                >
                  Use a different account
                </Button>
                <p className="text-xs text-muted-foreground">
                  Signing out brings you back here to try another email or set a
                  password instead.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Hang on a moment…</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (linkedExisting) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invite linked</CardTitle>
            <CardDescription>
              This tenant portal is now linked to your existing account. Sign in
              with the password you already use to see it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" render={<Link href="/login" />}>
              Sign in to continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set up your portal</CardTitle>
          <CardDescription>
            {googleEnabled
              ? "Continue with Google, or choose a password. "
              : "Choose a password. "}
            If your email already has a Renta-PH account, the invite is simply
            linked to it and you keep your usual sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {googleEnabled && (
            <GoogleSignIn
              callbackUrl={`/portal-setup?token=${encodeURIComponent(token)}`}
            />
          )}
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
