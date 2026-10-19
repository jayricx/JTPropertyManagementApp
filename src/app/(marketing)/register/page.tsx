import { cookies } from "next/headers";
import { RegisterForm } from "./register-form";
import { googleSignInEnabled } from "@/lib/auth-providers";
import {
  looksLikeCode,
  normalizeCode,
  REFERRAL_COOKIE,
  resolveCode,
} from "@/lib/referrals";

export const metadata = {
  title: "Create an account — Renta-PH.net",
  description:
    "Property management for Philippine landlords — peso pricing, GCash and bank transfer rent collection, and a tenant portal.",
};

export default async function RegisterPage() {
  // Who referred this signup, resolved server-side. The client is told a *name*
  // rather than an id so it can render "you were referred by Maria" without
  // being trusted with anything — and the code itself still travels in the
  // cookie, which the API re-reads and re-resolves. The banner is a courtesy,
  // never the source of truth.
  const code = normalizeCode((await cookies()).get(REFERRAL_COOKIE)?.value);
  const affiliate = looksLikeCode(code) ? await resolveCode(code) : null;

  return (
    <RegisterForm
      googleEnabled={googleSignInEnabled()}
      referredBy={affiliate?.name ?? null}
    />
  );
}