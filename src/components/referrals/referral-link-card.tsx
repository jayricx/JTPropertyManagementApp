"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The code and the link built from it, with a copy button for each.
 *
 * Copying the URL is the action that matters, so that's the primary button and
 * it comes first — most people who land here are about to paste a link into a
 * Facebook group or a landlord chat, and the raw code on its own is not the
 * thing they want.
 */
export function ReferralLinkCard({
  code,
  signupUrl,
  signups,
  paused,
  pausedReason,
}: {
  code: string;
  signupUrl: string;
  signups: number;
  paused: boolean;
  pausedReason: string | null;
}) {
  const [copied, setCopied] = useState<"url" | "code" | null>(null);

  async function copy(what: "url" | "code", text: string) {
    try {
      // Clipboard API needs a secure context; on plain http localhost it can be
      // unavailable, so the old path is kept as a fallback rather than the copy
      // silently doing nothing.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your link</CardTitle>
        <CardDescription>
          {paused
            ? "This link is paused, so new sign-ups through it won't be counted."
            : signups === 0
              ? "Nobody has signed up with it yet — paste it somewhere landlords actually talk."
              : `${signups} ${signups === 1 ? "person has" : "people have"} signed up with it.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {paused && pausedReason && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Paused: {pausedReason}
          </p>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="referral-url"
            className="text-sm font-medium"
          >
            Share this link
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="referral-url"
              readOnly
              value={signupUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-64 flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs"
            />
            <Button onClick={() => copy("url", signupUrl)} disabled={paused}>
              {copied === "url" ? <CheckIcon /> : <CopyIcon />}
              {copied === "url" ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Works on any page of the site — the code is remembered when they
            register, whether they followed this exact link or one of your blog
            links.
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">Your code</span>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm tracking-wider">
              {code}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copy("code", code)}
            >
              {copied === "code" ? <CheckIcon /> : <CopyIcon />}
              {copied === "code" ? "Copied" : "Copy code"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}