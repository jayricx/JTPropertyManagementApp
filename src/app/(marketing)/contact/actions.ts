"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { contactMessages } from "@/db/schema";
import { contactSchema, type ContactFormParsed } from "@/lib/validations";
import { emailShell, escapeHtml, sendEmail } from "@/lib/email";

export type ContactActionState =
  | { error?: string; success?: boolean }
  | null;

/**
 * Where contact form submissions go. Defaults to the Resend/Gmail account's
 * own address when unset, so a fresh deployment still delivers somewhere.
 */
function contactRecipient(): string {
  return (
    process.env.CONTACT_EMAIL?.trim() ||
    process.env.GMAIL_USER?.trim() ||
    "notifications@renta-ph.net"
  );
}

/**
 * Public contact form submission. No auth required — prospects and tenants
 * don't have accounts. Rate limiting is handled by the honeypot field plus a
 * simple IP-based throttle in the route (TODO: add when traffic warrants).
 */
export async function submitContactAction(
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    website: formData.get("website") ?? "",
  };

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Please check the form and try again." };
  }

  const data: ContactFormParsed = parsed.data;

  // Honeypot tripped — pretend success so bots don't retry.
  if (data.website && data.website.length > 0) {
    return { success: true };
  }

  await db.insert(contactMessages).values({
    name: data.name,
    email: data.email,
    subject: data.subject,
    message: data.message,
  });

  // Fire-and-forget: the message is already stored, so a failed email doesn't
  // lose the submission. The operator can still read it in /admin/contact.
  void sendEmail({
    to: contactRecipient(),
    subject: `[Contact] ${data.subject}`,
    text: `From: ${data.name} <${data.email}>\n\n${data.message}`,
    html: emailShell(
      "New contact message",
      `<p><strong>From:</strong> ${escapeHtml(data.name)} &lt;${escapeHtml(data.email)}&gt;</p>
       <p><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>
       <hr />
       <p style="white-space: pre-wrap;">${escapeHtml(data.message)}</p>`,
    ),
  }).catch((err) => {
    console.error("[contact] email send failed:", err);
  });

  revalidatePath("/admin/contact");
  return { success: true };
}