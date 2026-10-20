"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { unlinkGoogleAction } from "@/app/(dashboard)/settings/actions";

/**
 * Link / unlink a Google identity from the signed-in account.
 *
 * Linking goes through the normal OAuth flow with a `callbackUrl` back to
 * settings: Auth.js sees an authenticated session and links the returned
 * identity instead of creating a new user. Unlinking deletes the `accounts`
 * row, which is only allowed when a password is still set (enforced server-side).
 */
export function GoogleAccountLink({
  linked,
  hasPassword,
}: {
  linked: boolean;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function link() {
    setError(null);
    // Full-page redirect to Google; Auth.js links on return.
    void signIn("google", { callbackUrl: "/settings" });
  }

  function unlink() {
    setError(null);
    startTransition(async () => {
      const result = await unlinkGoogleAction();
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (linked) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Google is connected to this account.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={unlink}
          disabled={pending || !hasPassword}
        >
          {pending ? "Disconnecting…" : "Disconnect Google"}
        </Button>
        {!hasPassword && (
          <p className="text-xs text-muted-foreground">
            Set a password first — otherwise you&apos;d lock yourself out.
          </p>
        )}
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Google is not connected. Linking it lets you sign in either way.
      </p>
      <Button size="sm" onClick={link}>
        Connect Google
      </Button>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}