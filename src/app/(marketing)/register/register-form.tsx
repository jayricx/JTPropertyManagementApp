"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { registerSchema, type RegisterFormValues } from "@/lib/validations";

type Step =
  | { name: "details" }
  | { name: "verify"; email: string; password: string };

/** Seconds to wait before the resend button unlocks again. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * `googleEnabled` comes from the server page: signing up with Google creates
 * the account (and verifies the address) in one step, so it is offered beside
 * the email form rather than in place of it.
 */
export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "details" });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  // Countdown for the resend cooldown. A ref-driven interval keeps this out of
  // a state-per-tick render storm.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(
      () => setResendIn((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [resendIn]);

  async function onSubmit(values: RegisterFormValues) {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 409) {
        setError(data.error ?? "An account with this email already exists.");
        return;
      }
      if (response.status === 429) {
        setError(
          data.error ?? "We just emailed a code to that address. Try again shortly.",
        );
        setResendIn(Math.max(1, Number(data.retryInSeconds) || RESEND_COOLDOWN_SECONDS));
        return;
      }
      if (!response.ok) {
        setError(data.error ?? "Could not start your account. Please try again.");
        return;
      }

      setCode("");
      setCodeError(null);
      setResendNote(null);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setStep({
        name: "verify",
        email: data.email ?? values.email,
        password: values.password,
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onVerifyCode(event: FormEvent) {
    event.preventDefault();
    if (step.name !== "verify") return;
    setCodeError(null);

    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setCodeError("Enter the 6-digit code from your email.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: step.email, code: trimmed }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCodeError(data.error ?? "That code didn't work. Try again.");
        if (data.code === "locked" || data.code === "not_found") {
          setStep({ name: "details" });
        }
        return;
      }

      // The account exists now, so the credentials sign-in will hold.
      const result = await signIn("credentials", {
        email: step.email,
        password: step.password,
        redirect: false,
      });
      if (result?.error) {
        router.push("/login");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setCodeError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onResend() {
    if (step.name !== "verify") return;
    setResendNote(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: step.email }),
      });
      const data = await response.json().catch(() => ({}));
      const wait = Number(data.retryInSeconds) || RESEND_COOLDOWN_SECONDS;
      setResendIn(wait);
      setResendNote(
        data.sent
          ? `We sent a new code to ${step.email}.`
          : `If a sign-up is waiting for ${step.email}, a code is already on its way.`,
      );
    } catch {
      setResendNote("Could not send another code. Try again in a moment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {step.name === "verify" ? "Confirm your email" : "Create account"}
          </CardTitle>
          <CardDescription>
            {step.name === "verify"
              ? `Enter the 6-digit code we sent to ${step.email}.`
              : "Start managing your properties in under a minute."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step.name === "verify" ? (
            <form onSubmit={onVerifyCode} className="space-y-4" noValidate>
              <div className="space-y-2">
                <label htmlFor="code" className="text-sm font-medium leading-none">
                  Verification code
                </label>
                <Input
                  id="code"
                  ref={codeRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  aria-invalid={codeError ? true : undefined}
                  className="text-center font-mono text-2xl tracking-[0.5em]"
                />
                {codeError && (
                  <p className="text-sm font-medium text-destructive">{codeError}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Checking…" : "Verify and continue"}
              </Button>

              <div className="space-y-2 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={onResend}
                  disabled={isSubmitting || resendIn > 0}
                >
                  {resendIn > 0 ? `Send a new code in ${resendIn}s` : "Send a new code"}
                </Button>
                {resendNote && (
                  <p className="text-sm text-muted-foreground">{resendNote}</p>
                )}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setStep({ name: "details" });
                    setCodeError(null);
                    setResendNote(null);
                  }}
                >
                  Use a different email
                </Button>
              </div>
            </form>
          ) : (
            <>
              {googleEnabled && <GoogleSignIn label="Sign up with Google" />}
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                  noValidate
                >
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Jane Doe"
                            autoComplete="name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                            autoComplete="new-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {error && <p className="text-sm font-medium text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Sending code…" : "Create account"}
                  </Button>
                </form>
              </Form>
            </>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
