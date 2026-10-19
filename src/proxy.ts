import { NextResponse, type NextRequest } from "next/server";

/**
 * Captures a referral code from any `?ref=` link into a cookie.
 *
 * Done in the proxy so a shared link works wherever it's shared — a pricing
 * page, a guide article, the register page itself — rather than only on the one
 * URL the landlord copied. The marketer shares a link to whatever they're
 * talking about, not to a funnel.
 *
 * Only marketing routes are considered: a `?ref=` on a dashboard URL is a
 * bookmarklet or a mistake, and silently rewriting someone's cookie from there
 * would be odd.
 */
export function proxy(request: NextRequest) {
  const { searchParams, pathname } = request.nextUrl;

  // A `ref` that normalises to nothing isn't a code, and `ref=0` is the default
  // some link builders emit — treat both as absent rather than burning the
  // cookie on them.
  const raw = searchParams.get("ref");
  const code = (raw ?? "").trim().toUpperCase();
  if (!code || !/^[A-Z0-9]{4,16}$/.test(code)) return NextResponse.next();

  const isMarketing = /^\/(register|login|pricing|faq|guides|roadmap|pricing)/.test(
    pathname,
  );
  if (!isMarketing) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set("rb_ref", code, {
    // 30 days: long enough that someone who bookmarks the link and registers
    // next week is still attributed.
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    // Not httpOnly — the register page reads it in the browser to show "you
    // were invited by X" before the form is submitted. It is a public code, not
    // a credential.
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export const config = {
  // Skip static assets and the API surface; only page URLs carry a ref.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons/).*)"],
};