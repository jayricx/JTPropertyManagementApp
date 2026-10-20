"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginFormValues } from "@/lib/validations";

/**
 * Auth.js sends the browser back to `/login?error=…` when an attempt fails
 * before our own code runs — a refused Google callback, a missing client
 * secret, a link that expired. Translate the ones a visitor can actually hit
 * into something readable, and never show them a raw code.
 */
const SIGN_IN_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    "That email already has a password account. Sign in with your password, then link Google from Settings — or use a different Google account.",
  OAuthSignin: "We couldn't start the Google sign-in. Please try again.",
  OAuthCallback: "Google sent back something unexpected. Please try again.",
  OAuthCreateAccount: "We couldn't finish creating your account. Please try again.",
  AccessDenied: "That account can't sign in here.",
  Configuration: "Sign-in is misconfigured. Please contact support.",
  Verification: "That sign-in link has expired. Please try again.",
};

function noticeFor(errorCode: string | null): string | null {
  if (!errorCode) return null;
  return SIGN_IN_ERRORS[errorCode] ?? "We couldn't sign you in. Please try again.";
}

/**
 * `googleEnabled` is decided by the server page (it depends on env vars the
 * browser must never see); everything interactive lives here.
 */
export function LoginForm({
  googleEnabled,
  errorCode,
}: {
  googleEnabled: boolean;
  errorCode: string | null;
}) {
  const router = useRouter();
  // Seeded from the URL, then cleared once a new attempt starts so an old
  // Google failure doesn't sit above a fresh error.
  const [notice, setNotice] = useState(() => noticeFor(errorCode));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        ...values,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password.");
        return;
      }
      // Landlords land on the dashboard, tenant accounts on the portal.
      let destination = "/dashboard";
      try {
        const res = await fetch("/api/auth/session");
        const sess = await res.json();
        if (sess?.user?.role === "tenant") destination = "/portal";
      } catch {
        // Fall through to the dashboard; the layout guard bounces tenants.
      }
      router.push(destination);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Enter your email and password to access your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice && (
            <p className="text-sm font-medium text-destructive">{notice}</p>
          )}
          {googleEnabled && <GoogleSignIn />}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Register
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
