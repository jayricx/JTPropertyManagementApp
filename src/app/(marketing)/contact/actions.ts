"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { contactMessages } from "@/db/schema";
import { contactSchema, type ContactFormParsed } from "@/lib/validations";

export type ContactActionState =
  | { error?: string; success?: boolean }
  | null;

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

  revalidatePath("/admin/contact");
  return { success: true };
}