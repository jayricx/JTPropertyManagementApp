/**
 * Sign-in methods beyond email + password. Google is optional and turns on
 * purely by configuration, so local dev and previews behave exactly as before
 * until both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set (see
 * `.env.example`).
 *
 * Both `@/auth` (to register the provider) and the sign-in screens (to decide
 * whether to draw the button) read these, which is what keeps the button in
 * step with the running provider list. Server-only: the values are secrets, so
 * never import this into a `"use client"` file.
 */

/** OAuth client id from a Google Cloud Console "Web application" client. */
export function googleClientId(): string | undefined {
  return (process.env.AUTH_GOOGLE_ID ?? "").trim() || undefined;
}

/** Client secret paired with {@link googleClientId}. */
export function googleClientSecret(): string | undefined {
  return (process.env.AUTH_GOOGLE_SECRET ?? "").trim() || undefined;
}

/** True when Google sign-in is configured; the button is hidden otherwise. */
export function googleSignInEnabled(): boolean {
  return Boolean(googleClientId() && googleClientSecret());
}
