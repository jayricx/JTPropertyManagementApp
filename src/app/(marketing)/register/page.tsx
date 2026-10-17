import { connection } from "next/server";
import { RegisterForm } from "./register-form";
import { googleSignInEnabled } from "@/lib/auth-providers";

/**
 * Server component so the Google flag can be read from the environment — a
 * secret the browser must not see. `connection()` defers that read to the
 * request (the page has no other request-time data), so Google sign-up can be
 * switched on or off without a rebuild.
 */
export default async function RegisterPage() {
  await connection();
  return <RegisterForm googleEnabled={googleSignInEnabled()} />;
}
