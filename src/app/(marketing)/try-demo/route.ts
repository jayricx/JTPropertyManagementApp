import { NextResponse, type NextRequest } from "next/server";
import { auth, signIn } from "@/auth";
import { demoCredentials, isDemoEmail } from "@/lib/demo";

/**
 * One-click entry into the demo account: the landing page's "Try the live
 * demo" button lands here with no fanfare and leaves already signed in.
 *
 * The password comes from the server's env, never the visitor, and a real
 * (non-demo) session is left untouched — someone already signed in doesn't
 * lose their own dashboard by clicking a curiosity button.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (session?.user && !isDemoEmail(session.user.email)) {
    // Already a real landlord or tenant: there is nothing a demo can show them.
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const demo = demoCredentials();
  if (!demo) {
    // The deployment hasn't configured the demo account; send visitors to the
    // real funnel rather than an error page.
    console.error("[demo] DEMO_EMAIL/DEMO_PASSWORD are not set — /try-demo disabled");
    return NextResponse.redirect(new URL("/register", request.url));
  }

  // redirect:false keeps control here instead of throwing NEXT_REDIRECT; the
  // session cookie is still written through next/headers like any action.
  let target = "/post-login";
  try {
    target =
      (await signIn("credentials", {
        email: demo.email,
        password: demo.password,
        redirect: false,
        redirectTo: "/post-login",
      })) ?? target;
  } catch (error) {
    console.error("[demo] demo sign-in failed:", error);
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // A failed authorize comes back as an error URL — fall back to the login
  // page (the likely cause is a reseed that changed the demo password while
  // this deployment's env still holds the old one).
  if (target.includes("error=")) target = "/login";

  return NextResponse.redirect(new URL(target, request.url), {
    headers: { "X-Robots-Tag": "noindex" },
  });
}
