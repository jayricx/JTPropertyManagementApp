/**
 * The deployment's canonical origin, used to build absolute URLs handed to
 * external services: payment-gateway redirect targets, webhook callbacks, and
 * emailed links. A blank value counts as unset (a bare AUTH_URL would build
 * links that point nowhere). Falls back to NEXT_PUBLIC_APP_URL, then localhost
 * for dev.
 */
export function appUrl(): string {
  const raw =
    (process.env.AUTH_URL ?? "").trim() ||
    (process.env.NEXT_PUBLIC_APP_URL ?? "").trim() ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
