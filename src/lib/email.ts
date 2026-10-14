import { Resend } from "resend";

/**
 * Email delivery via Resend. When RESEND_API_KEY is not configured (local
 * development), emails are logged to the server console instead of sent, so
 * the whole flow stays testable without credentials.
 */

const FROM =
  process.env.EMAIL_FROM ?? "JT Property Management <onboarding@resend.dev>";

const APP_URL = process.env.AUTH_URL ?? "http://localhost:3000";

let resendClient: Resend | null = null;

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendResult {
  /** True when the provider accepted the email. */
  delivered: boolean;
  /** Why it wasn't delivered (missing key, provider error). */
  reason?: string;
}

/** Minimal HTML escaping for values interpolated into email bodies. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Wrap body content in the JT-branded email shell. */
function emailShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background-color:#f4f5f7;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:linear-gradient(135deg,#0f172a,#2563eb);padding:20px 24px;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">JT Property Management</span>
      </div>
      <div style="padding:24px;color:#111827;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 12px;font-size:18px;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">
        Sent by JT Property Management
      </div>
    </div>
  </body>
</html>`;
}

export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  const client = getClient();

  if (!client) {
    // No API key (local dev) — log the email so flows remain testable.
    console.log(
      `[email:dev] To: ${payload.to}\n[email:dev] Subject: ${payload.subject}\n[email:dev] Body:\n${payload.text}`,
    );
    return { delivered: false, reason: "RESEND_API_KEY not set — logged instead" };
  }

  const { error } = await client.emails.send({
    from: FROM,
    to: [payload.to],
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  if (error) {
    console.error("[email:error]", error);
    return { delivered: false, reason: error.message };
  }
  return { delivered: true };
}

export interface LeaseEndAlert {
  landlordEmail: string;
  landlordName: string | null;
  tenantName: string;
  tenantEmail: string | null;
  unitName: string;
  propertyName: string;
  endDate: Date;
  daysLeft: number;
  rentAmount: string;
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Notify the landlord that one of their leases is ending soon, and email the
 * tenant too when they have an address on file. Returns how many emails were
 * actually accepted by the provider.
 */
export async function sendLeaseEndAlerts(
  alert: LeaseEndAlert,
): Promise<number> {
  const {
    landlordEmail,
    landlordName,
    tenantName,
    tenantEmail,
    unitName,
    propertyName,
    endDate,
    daysLeft,
    rentAmount,
  } = alert;

  const endDateText = formatDateShort(endDate);
  const unitLabel = escapeHtml(`${unitName} (${propertyName})`);
  const tenantLabel = escapeHtml(tenantName);
  const leaseUrl = `${APP_URL}/leases`;
  const daysText =
    daysLeft === 1 ? "in 1 day" : `in ${daysLeft} days`;

  const results: SendResult[] = [];

  // Landlord — action-oriented, links to the leases page.
  results.push(
    await sendEmail({
      to: landlordEmail,
      subject: `Lease ending soon: ${tenantName} — ${unitName}`,
      text: `Hi ${landlordName ?? "there"},\n\nThe lease for ${tenantName} at ${unitName} (${propertyName}) ends on ${endDateText} (${daysText}).\n\nMonthly rent: ₱${rentAmount}\n\nReview or renew the lease: ${leaseUrl}\n\n— JT Property Management`,
      html: emailShell(
        "Lease ending soon",
        `<p>Hi ${escapeHtml(landlordName ?? "there")},</p>
         <p>The lease for <strong>${tenantLabel}</strong> at <strong>${unitLabel}</strong> ends on <strong>${endDateText}</strong> (${daysText}).</p>
         <p>Monthly rent: <strong>₱${escapeHtml(rentAmount)}</strong></p>
         <p><a href="${leaseUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Review lease</a></p>`,
      ),
    }),
  );

  // Tenant — a courtesy heads-up when we have their email.
  if (tenantEmail) {
    results.push(
      await sendEmail({
        to: tenantEmail,
        subject: `Your lease ends on ${endDateText}`,
        text: `Hi ${tenantName},\n\nThis is a reminder that your lease for ${unitName} (${propertyName}) ends on ${endDateText} (${daysText}).\n\nContact your landlord to discuss renewal or move-out arrangements.\n\n— JT Property Management`,
        html: emailShell(
          "Your lease ends soon",
          `<p>Hi ${tenantLabel},</p>
           <p>This is a reminder that your lease for <strong>${unitLabel}</strong> ends on <strong>${endDateText}</strong> (${daysText}).</p>
           <p>Contact your landlord to discuss renewal or move-out arrangements.</p>`,
        ),
      }),
    );
  }

  return results.filter((r) => r.delivered).length;
}

export interface PaymentReceipt {
  to: string;
  tenantName: string;
  /** Preformatted display amount, e.g. "₱3,000". */
  amountText: string;
  paidDate: Date;
  unitName: string;
  propertyName: string;
}

/** Confirm to the tenant that a rent payment was received. */
export async function sendPaymentReceipt(r: PaymentReceipt): Promise<SendResult> {
  const dateText = formatDateShort(r.paidDate);
  const unitLabel = escapeHtml(`${r.unitName} (${r.propertyName})`);
  const tenantLabel = escapeHtml(r.tenantName);
  const amountLabel = escapeHtml(r.amountText);
  const portalUrl = `${APP_URL}/portal`;

  return sendEmail({
    to: r.to,
    subject: `Payment received: ${r.amountText} rent`,
    text: `Hi ${r.tenantName},\n\nWe received your rent payment of ${r.amountText} on ${dateText} for ${r.unitName} (${r.propertyName}).\n\nView your payment history: ${portalUrl}\n\n— JT Property Management`,
    html: emailShell(
      "Payment received",
      `<p>Hi ${tenantLabel},</p>
       <p>We received your rent payment of <strong>${amountLabel}</strong> on <strong>${dateText}</strong> for <strong>${unitLabel}</strong>.</p>
       <p><a href="${portalUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">View payment history</a></p>`,
    ),
  });
}
