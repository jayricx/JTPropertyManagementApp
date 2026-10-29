/**
 * The public demo account.
 *
 * A landing-page button drops prospects straight into a pre-seeded account
 * ("Try the live demo") — no signup form, no email code, nothing to type. The
 * credentials live in env vars only (`DEMO_EMAIL`, `DEMO_PASSWORD`) and the
 * /try-demo route signs the visitor in server-side, so no password is ever
 * published: nobody can change it and lock out every future visitor, and demo
 * sessions are distinguishable from real signups in analytics.
 *
 * Nothing here grants the demo account access to anything real. It is a
 * normal business-plan account that happens to hold sample data and to be
 * reseeded by script; a "demo mode" flag across every mutation would be the
 * only way to make its writes read-only, and someone changing sample data is
 * part of trying it.
 */

/** The demo account, or null while the deployment hasn't configured it. */
export function demoCredentials(): { email: string; password: string } | null {
  const email = (process.env.DEMO_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD ?? "";
  return email && password ? { email, password } : null;
}

/** True when a signed-in session is sitting in the demo account. */
export function isDemoEmail(email: string | null | undefined): boolean {
  const configured = (process.env.DEMO_EMAIL ?? "").trim().toLowerCase();
  return Boolean(configured && email && email.trim().toLowerCase() === configured);
}
