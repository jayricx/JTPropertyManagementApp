"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/**
 * One landing spot for both roles: the dashboard layout forwards a `tenant`
 * account on to the portal, the same way the password form routes by role.
 */
const AFTER_SIGN_IN = "/post-login";

/**
 * "Continue with Google" with an "or" rule beneath it. Rendered only when the
 * server has reported that Google is configured, so this file never probes for
 * credentials and no secret ever reaches the browser bundle.
 *
 * `callbackUrl` defaults to the shared dashboard landing. The tenant invite
 * page overrides it to return to `/portal-setup` with its token, where the
 * invite is then linked to the freshly signed-in account.
 */
export function GoogleSignIn({
  label = "Continue with Google",
  callbackUrl = AFTER_SIGN_IN,
}: {
  label?: string;
  callbackUrl?: string;
}) {
  const [redirecting, setRedirecting] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={redirecting}
        onClick={() => {
          setRedirecting(true);
          // A full-page navigation to Google, so there is no local state to
          // unwind on the way out.
          void signIn("google", { callbackUrl });
        }}
      >
        <GoogleMark />
        {redirecting ? "Redirecting…" : label}
      </Button>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Separator />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator />
      </div>
    </>
  );
}

/** The four-colour Google "G", inlined so no icon asset or font is needed. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.6-.21-2.36H12v4.47h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.26-2.08 3.58-5.15 3.58-8.74z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.94-2.99l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.1-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.21a7.2 7.2 0 0 1 0-4.6v-3.1H1.28a12 12 0 0 0 0 10.79l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.36.61 4.61 1.8l3.43-3.43C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.28 6.51l4 3.1C6.22 6.85 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}
