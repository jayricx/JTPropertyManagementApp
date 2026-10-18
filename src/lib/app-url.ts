/**
 * The deployment's canonical origin, used to build absolute URLs handed to
 * external services: payment-gateway redirect targets, webhook callbacks, and
 * emailed links. A blank value counts as unset (a bare AUTH_URL would build
 * links that point nowhere). Falls back to NEXT_PUBLIC_APP_URL, then the
 * deployment's own Vercel domain, then localhost for dev.
 *
 * The localhost guard matters more than it looks. `AUTH_URL=http://localhost:3000`
 * is correct in development and fatal in production: the signing link a tenant
 * receives in a contract email would open nothing on their machine, and every
 * recipient would get it at once. So on Vercel a local or blank value falls
 * back to the deployment domain rather than quietly mailing dead links.
 */
export function appUrl(): string {
  const configured =
    (process.env.AUTH_URL ?? "").trim() ||
    (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();

  if (isLocalOrigin(configured)) {
    const vercelHost = (process.env.VERCEL_URL ?? "").trim().replace(/\/+$/, "");
    if (vercelHost) return `https://${vercelHost}`;
  }

  return (configured || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * True when links built from this origin won't open for anyone else. Surfaced
 * on the settings page, because a wrong app URL fails silently for every
 * recipient rather than reporting an error to the sender.
 */
export function appUrlLooksLocal(): boolean {
  return isLocalOrigin(
    (process.env.AUTH_URL ?? "").trim() || (process.env.NEXT_PUBLIC_APP_URL ?? "").trim(),
  ) && !(process.env.VERCEL_URL ?? "").trim();
}

function isLocalOrigin(value: string): boolean {
  return (
    value === "" ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value)
  );
}