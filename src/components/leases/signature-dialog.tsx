"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  EraserIcon,
  MailCheckIcon,
  PenLineIcon,
  ShieldCheckIcon,
  TypeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SIGNATURE_FONT_FAMILY } from "@/components/leases/signature-display";
import type { SignatureCodeState } from "@/lib/signature-verification";
import { cn } from "@/lib/utils";

export type SignatureActionState = { error?: string; ok?: boolean } | null;

interface SignatureDialogProps {
  /** Landlord or tenant server action — same signature, different scoping. */
  action: (
    prev: SignatureActionState,
    formData: FormData,
  ) => Promise<SignatureActionState>;
  leaseId: string;
  /**
   * Set when signing a specific contract version instead of the bare lease.
   * The two actions key off different form fields, so exactly one is posted.
   */
  contractId?: string;
  /**
   * The emailed signing link's token. Only present on the account-free
   * `/contract/[token]` page, where it is the authorisation.
   */
  token?: string;
  /** Prefilled from the roster (landlord account name / tenant name). */
  defaultName: string;
  triggerLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default";
  /** Shown when replacing an existing signature. */
  resigning?: boolean;
  /** Submitted label — "Sign contract" rather than "Sign lease". */
  submitLabel?: string;
  /** Attestation wording, which has to name the right document. */
  attestation?: string;
  /**
   * Present only when the signer has no account to identify them — the emailed
   * link. They prove they control the contract's address by entering a code
   * mailed to it; the code is posted with the signature and spent server-side.
   */
  verification?: {
    /** Already masked for display. */
    email: string;
    sendCode: (
      contractId: string,
      token: string,
    ) => Promise<SignatureCodeState>;
  };
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;

/**
 * Sign a lease without a third-party e-sign vendor: type a name in a script
 * face, or draw a mark on the pad. Both go through the same attestation
 * checkbox, which is what makes either one an electronic signature.
 */
export function SignatureDialog(props: SignatureDialogProps) {
  const [open, setOpen] = useState(false);
  /**
   * Bumped on every open so the form below is a fresh mount next time. A
   * settled `useActionState` result can't be cleared any other way, and
   * carrying a spent email code into a re-sign would only produce "code
   * already used".
   */
  const [session, setSession] = useState(0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setSession((current) => current + 1);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button variant={props.variant ?? "outline"} size={props.size ?? "sm"} />}
      >
        <PenLineIcon />
        {props.resigning ? "Re-sign" : props.triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.dialogTitle}</DialogTitle>
          <DialogDescription>{props.dialogDescription}</DialogDescription>
        </DialogHeader>
        <SignatureForm
          key={session}
          {...props}
          onFinished={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function SignatureForm({
  action,
  leaseId,
  contractId,
  token,
  defaultName,
  submitLabel = "Sign lease",
  attestation = "I agree that this electronic signature is the legal equivalent of my handwritten signature on this lease.",
  verification,
  onFinished,
}: SignatureDialogProps & { onFinished: () => void }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const [name, setName] = useState(defaultName);
  const [dataUrl, setDataUrl] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const [code, setCode] = useState("");
  const [codeState, setCodeState] = useState<SignatureCodeState | null>(null);
  const [sendingCode, startSendingCode] = useTransition();
  // Controlled: React resets uncontrolled fields when a form action settles,
  // which would silently clear the attestation before a second submit.
  const [attested, setAttested] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    canvasRef.current!.setPointerCapture(event.pointerId);
    const { x, y } = pointFrom(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function continueStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointFrom(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endStroke() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Snapshot the pad on every stroke so the hidden input always matches.
    setDataUrl(canvas.toDataURL("image/png"));
    setHasInk(true);
  }

  function clearPad() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDataUrl("");
    setHasInk(false);
  }

  function requestCode() {
    if (!verification || !contractId || !token) return;
    startSendingCode(async () => {
      setCodeState(await verification.sendCode(contractId, token));
    });
  }

  // The code is spent and the signature written — anything more to submit from
  // here could only fail, so the dialog becomes a confirmation.
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-4 text-sm">
          Signed — your signature and the evidence behind it have been recorded.
        </div>
        <DialogFooter>
          <Button type="button" onClick={onFinished}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="leaseId" value={leaseId} />
      {contractId && <input type="hidden" name="contractId" value={contractId} />}
      {token && <input type="hidden" name="token" value={token} />}
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="drawnSignature" value={dataUrl} />
      {verification && <input type="hidden" name="code" value={code} />}

      <div className="space-y-2">
        <Label htmlFor="signerName">Full name</Label>
        <Input
          id="signerName"
          name="signerName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={255}
          autoComplete="name"
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={method === "typed" ? "default" : "outline"}
          size="sm"
          onClick={() => setMethod("typed")}
        >
          <TypeIcon />
          Type it
        </Button>
        <Button
          type="button"
          variant={method === "drawn" ? "default" : "outline"}
          size="sm"
          onClick={() => setMethod("drawn")}
        >
          <PenLineIcon />
          Draw it
        </Button>
      </div>

      {method === "typed" ? (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p
            className="truncate text-3xl leading-tight"
            style={{ fontFamily: SIGNATURE_FONT_FAMILY }}
          >
            {name || "Your name"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg border bg-white">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              aria-label="Draw your signature"
              className="h-32 w-full touch-none cursor-crosshair rounded-lg"
              onPointerDown={startStroke}
              onPointerMove={continueStroke}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {hasInk ? "Signature captured." : "Draw with a finger or mouse."}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={clearPad}>
              <EraserIcon />
              Clear
            </Button>
          </div>
        </div>
      )}

      {verification && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4 text-primary" />
              <p className="text-sm font-medium">Confirm it&apos;s you</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={requestCode}
              disabled={sendingCode}
            >
              <MailCheckIcon />
              {sendingCode
                ? "Sending..."
                : codeState?.ok
                  ? "Send a new code"
                  : "Email me a code"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            We&apos;ll email a 6-digit code to {verification.email}. Enter it
            below to prove the address is yours before you sign.
          </p>
          <div className="space-y-2">
            <Label htmlFor="signatureCode">Email code</Label>
            <Input
              id="signatureCode"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              className="max-w-40 font-mono tracking-[0.35em]"
              required
            />
          </div>
          {codeState?.ok && (
            <p
              className={cn(
                "text-xs",
                codeState.delivered
                  ? "text-muted-foreground"
                  : "font-medium text-destructive",
              )}
            >
              {codeState.delivered
                ? `Code sent to ${codeState.email}. It expires in 15 minutes.`
                : "The code could not be emailed. Ask your landlord to check the address on the contract, then try again."}
            </p>
          )}
          {codeState && !codeState.ok && (
            <p className="text-xs font-medium text-destructive">
              {codeState.error}
            </p>
          )}
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="attestation"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          className={cn("mt-0.5 size-4 shrink-0 accent-primary")}
        />
        <span className="text-muted-foreground">{attestation}</span>
      </label>

      {/* Once the box is ticked the attestation complaint is stale — don't nag. */}
      {state?.error &&
        !(state.error.startsWith("Tick the agreement") && attested) && (
          <p className="text-sm font-medium text-destructive">{state.error}</p>
        )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onFinished}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending || Boolean(verification && code.length !== 6)}
        >
          {pending ? "Signing..." : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
