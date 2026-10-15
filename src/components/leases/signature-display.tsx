import { cn } from "@/lib/utils";
import type { LeaseSignature } from "@/lib/signatures";

/**
 * Script-ish stack resolved locally — a signature must never depend on a web
 * font, and the signed-lease copy has to render without a network.
 */
export const SIGNATURE_FONT_FAMILY =
  '"Segoe Script", "Bradley Hand", "Snell Roundhand", "Brush Script MT", cursive';

/** Renders a stored signature: typed in a script face, drawn as its image. */
export function SignatureDisplay({
  signature,
  className,
}: {
  signature: LeaseSignature;
  className?: string;
}) {
  if (signature.method === "drawn") {
    return (
      // A data URL captured at sign time — next/image cannot optimize one.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={signature.signature}
        alt={`Signature of ${signature.signerName}`}
        className={cn("h-12 max-w-full object-contain", className)}
      />
    );
  }
  return (
    <span
      style={{ fontFamily: SIGNATURE_FONT_FAMILY }}
      className={cn("text-2xl leading-none", className)}
    >
      {signature.signature}
    </span>
  );
}