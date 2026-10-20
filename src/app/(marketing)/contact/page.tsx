import type { Metadata } from "next";
import Link from "next/link";
import {
  MailIcon,
  MessageSquareIcon,
  LightbulbIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contact us — Renta-PH.net",
  description:
    "Get in touch with the Renta-PH.net team. We read every message and reply within a few days.",
};

const FACEBOOK_URL = "https://www.facebook.com/share/1LfhDZj49R/";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-primary">Contact</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Talk to a person, not a bot
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          We&apos;re a small team building Renta-PH.net for Filipino landlords.
          We read every message and reply within a few days, depending on the
          request. English or Filipino — either is fine.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {/* Support */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareIcon className="size-5 text-primary" />
              Something isn&apos;t working
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-6 text-sm text-muted-foreground">
              A bug, a confusing screen, or you can&apos;t figure out how to do
              something. Tell us what happened and what you expected. If you can,
              include your lease or property name — it speeds things up.
            </p>
            <ContactForm />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Feature request */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LightbulbIcon className="size-5 text-primary" />
                Have an idea?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Feature requests go through your account so we can come back to
                you when something ships. Create a free account and send it in
                from there.
              </p>
              <Button render={<Link href="/register" />} size="sm">
                Create a free account
              </Button>
              <p>
                Already asked?{" "}
                <Link
                  href="/roadmap"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  See what others have requested
                </Link>
                .
              </p>
            </CardContent>
          </Card>

          {/* Other ways */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MailIcon className="size-5 text-primary" />
                Other ways to reach us
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                For partnerships, press, billing disputes, or account deletion
                requests, email us directly.
              </p>
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline"
              >
                Facebook page
              </a>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-12 rounded-lg border bg-muted/40 p-6">
        <h2 className="font-semibold">Before you write</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Most questions are answered in the FAQ. Check there first — it might
          save you a wait.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          render={<Link href="/faq" />}
        >
          Read the FAQ
        </Button>
      </div>
    </div>
  );
}