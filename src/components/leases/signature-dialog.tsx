"use client";

import { useActionState, useRef, useState } from "react";
import { EraserIcon, PenLineIcon, TypeIcon } from "lucide-react";
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
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;

/**
 * Sign a lease without a third-party e-sign vendor: type a name in a script
 * face, or draw a mark on the pad. Both go through the same attestation
 * checkbox, which is what makes either one an electronic signature.
 */
export function SignatureDialog({
  action,
  leaseId,
  contractId,
  token,
  defaultName,
  triggerLabel,
  dialogTitle,
  dialogDescription,
  variant = "outline",
  size = "sm",
  resigning = false,
  submitLabel = "Sign lease",
  attestation = "I agree that this electronic signature is the legal equivalent of my handwritten signature on this lease.",
}: SignatureDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const [name, setName] = useState(defaultName);
  const [dataUrl, setDataUrl] = useState("");
  const [hasInk, setHasInk] = useState(false);
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} size={size} />}>
        <PenLineIcon />
        {resigning ? "Re-sign" : triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="leaseId" value={leaseId} />
          {contractId && <input type="hidden" name="contractId" value={contractId} />}
          {token && <input type="hidden" name="token" value={token} />}
          <input type="hidden" name="method" value={method} />
          <input type="hidden" name="drawnSignature" value={dataUrl} />

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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearPad}
                >
                  <EraserIcon />
                  Clear
                </Button>
              </div>
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
              <p className="text-sm font-medium text-destructive">
                {state.error}
              </p>
            )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Signing..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}