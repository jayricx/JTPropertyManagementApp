import { LoginForm } from "./login-form";
import { googleSignInEnabled } from "@/lib/auth-providers";

/**
 * Server component so the Google flag can be read from the environment
 * (secrets the browser must not see) and `?error=` can be read from the URL.
 * Both are request-time values, so this route renders per request — the
 * provider list in the browser then always matches the running server config.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <LoginForm
      googleEnabled={googleSignInEnabled()}
      errorCode={error ?? null}
    />
  );
}
