"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setAffiliatePausedAction } from "@/app/(dashboard)/referrals/actions";

/**
 * Pausing needs a reason, so it is a small inline form rather than a
 * confirmation dialog — a bare "are you sure?" here produces mystery pauses that
 * nobody can explain six months later.
 */
export function ReferralPauseButton({
  affiliateId,
  code,
  paused,
  pausedReason,
}: {
  affiliateId: string;
  code: string;
  paused: boolean;
  pausedReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(pausedReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function submit(nextPaused: boolean) {
    setError(null);
    start(async () => {
      const result = await setAffiliatePausedAction(
        affiliateId,
        nextPaused,
        nextPaused ? reason : "",
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        {paused ? <PlayIcon /> : <PauseIcon />}
        {paused ? "Restore" : "Pause"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={paused ? "Why it was paused" : "Reason for pausing"}
        maxLength={500}
        autoFocus
        aria-label={`Reason for pausing ${code}`}
        className="h-7 w-44 text-xs"
      />
      <Button size="sm" onClick={() => submit(!paused)} disabled={pending}>
        {paused ? "Restore" : "Pause"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        disabled={pending}
      >
        Cancel
      </Button>
      {error && (
        <span className="text-xs font-medium text-destructive">{error}</span>
      )}
    </div>
  );
}