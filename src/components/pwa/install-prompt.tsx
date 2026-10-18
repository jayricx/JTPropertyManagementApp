"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { DownloadIcon, ShareIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Chromium fires this before the mini-infobar; Safari never does. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "jt-install-dismissed";

/**
 * One stable string describing what the visitor's browser can offer. Read via
 * useSyncExternalStore so the server render stays static (it returns
 * "server") and no setState happens in an effect.
 */
type InstallState = "server" | "standalone" | "dismissed" | "ios" | "web";

function readInstallState(): InstallState {
  if (typeof window === "undefined") return "server";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;
  if (standalone) return "standalone";
  try {
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return "dismissed";
  } catch {
    // Private mode can throw on localStorage — treat as not dismissed.
  }
  const ua = window.navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) &&
    !(window.navigator as Navigator & { MSStream?: boolean }).MSStream;
  return ios ? "ios" : "web";
}

/**
 * "Add to home screen" prompt. Chromium browsers get the native install
 * sheet; iOS (which has no such API) gets the Share → Add to Home Screen
 * instructions. Never shown once installed, and the dismissal sticks.
 */
export function InstallPrompt() {
  const [state, setState] = useState<InstallState>("server");
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  // Subscribe to state changes the browser controls (display mode).
  useEffect(() => {
    const query = window.matchMedia?.("(display-mode: standalone)");
    const update = () => setState(readInstallState());
    update();
    if (!query) return;
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setState("standalone");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "server" || state === "standalone" || state === "dismissed") {
    return null;
  }
  // iOS gets the manual instructions; other browsers only when Chromium
  // actually offered the native sheet.
  if (state === "ios" && !promptEvent) return <IosHint onDone={dismiss} />;
  if (!promptEvent) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm md:inset-x-auto md:right-6",
        "flex items-start gap-3 rounded-xl border bg-card p-3 shadow-lg",
        "pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3",
      )}
    >
      <Image
        src="/icons/icon-192.png"
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install RentBase-PH</p>
        <p className="text-xs text-muted-foreground">
          Add it to your home screen for full-screen, app-like access.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          onClick={async () => {
            await promptEvent.prompt();
            await promptEvent.userChoice;
            setPromptEvent(null);
            dismiss();
          }}
        >
          <DownloadIcon />
          Install
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss install prompt"
          onClick={dismiss}
        >
          <XIcon />
        </Button>
      </div>
    </div>
  );

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage failures — the prompt just reappears next visit.
    }
    setState("dismissed");
  }
}

/** Safari/iOS has no install API, so spell the two taps out. */
function IosHint({ onDone }: { onDone: () => void }) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-xl border bg-card p-4 shadow-lg md:inset-x-auto md:right-6">
      <div className="flex items-start gap-3">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Add RentBase-PH to Home Screen</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tap the{" "}
            <ShareIcon className="inline size-3.5 align-text-bottom" /> Share
            button, then choose{" "}
            <strong className="font-medium text-foreground">
              Add to Home Screen
            </strong>
            .
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss install hint"
          onClick={onDone}
        >
          <XIcon />
        </Button>
      </div>
    </div>
  );
}