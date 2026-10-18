import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { Resend } from "resend";

/**
 * Email delivery. Two transports are supported and chosen automatically:
 *
 *  - Gmail SMTP — set GMAIL_USER and GMAIL_APP_PASSWORD. Sends from your own
 *    Gmail (or Google Workspace) address, so it reaches any recipient before
 *    you own a sending domain.
 *  - Resend — set RESEND_API_KEY. Until EMAIL_FROM names a verified domain it
 *    delivers only to the Resend account's own address.
 *
 * Gmail is preferred when both are configured because it has no domain
 * requirement. With neither (local development) emails are logged to the
 * server console instead of sent, so every flow stays testable.
 */

/** Google's SMTP endpoint, shared by Gmail and Google Workspace accounts. */
const GMAIL_HOST = "smtp.gmail.com";
/** 465 is implicit TLS; 587 (STARTTLS) also works but needs more config. */
const GMAIL_PORT = 465;

/**
 * Resend's shared testing sender. It works without a domain of your own, but
 * Resend only delivers it to the address on your Resend account — every other
 * recipient is refused. Replace EMAIL_FROM with an address on a verified
 * domain once you have one.
 */
const SHARED_SENDER = "RentBase-PH <onboarding@resend.dev>";

// Treat a blank or whitespace-only value as unset: an empty variable in
// .env.local or the Vercel dashboard must not blank out the sender.
const gmailUser = (process.env.GMAIL_USER ?? "").trim();
// Google shows app passwords as four space-separated groups ("abcd efgh ijkl
// mnop") and copy-paste keeps the spaces, so strip them — the password itself
// is always 16 non-space characters.
const gmailPassword = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");
const resendKey = (process.env.RESEND_API_KEY ?? "").trim();
const explicitFrom = (process.env.EMAIL_FROM ?? "").trim();

export type EmailTransport = "gmail" | "resend" | "log";

const gmailConfigured = Boolean(gmailUser && gmailPassword);
const resendConfigured = Boolean(resendKey);

const TRANSPORT: EmailTransport = gmailConfigured
  ? "gmail"
  : resendConfigured
    ? "resend"
    : "log";

/** Pull the bare address out of `Name <addr@host>` (or return the value). */
function addressOf(value: string): string {
  const angled = value.match(/<([^>]+)>/);
  return (angled ? angled[1] : value).trim().toLowerCase();
}

/**
 * Gmail only lets you send as the authenticated account (or a verified
 * "send mail as" alias), so unless EMAIL_FROM is exactly that address it is
 * ignored rather than handed to Google to bounce.
 */
const gmailFromMatches =
  explicitFrom !== "" && addressOf(explicitFrom) === gmailUser.toLowerCase();

const FROM =
  TRANSPORT === "gmail"
    ? gmailFromMatches
      ? explicitFrom
      : `RentBase-PH <${gmailUser}>`
    : explicitFrom || SHARED_SENDER;

const usingSharedSender = TRANSPORT === "resend" && !explicitFrom;

let warnedAboutSharedSender = false;
let warnedAboutGmailFrom = false;

// Same blank-means-unset rule as EMAIL_FROM: a bare AUTH_URL would build links
// that point nowhere.
const appUrl = (process.env.AUTH_URL ?? "").trim();
const APP_URL = appUrl || "http://localhost:3000";

/**
 * What the server is actually configured to send with. Surfaced on the
 * settings page so a misconfigured sender, app URL or missing key is visible in
 * the UI instead of only in server logs.
 */
export function emailDiagnostics() {
  return {
    /** Which delivery path the server picked for this deployment. */
    transport: TRANSPORT,
    sender: FROM,
    /** True when Resend's shared sender is in use (owner address only). */
    sharedSender: usingSharedSender,
    /** False when emails are only logged to the server console. */
    configured: TRANSPORT !== "log",
    /** The host that links inside emails point back to. */
    appUrl: APP_URL,
  };
}

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!resendConfigured) return null;
  if (!resendClient) resendClient = new Resend(resendKey);
  return resendClient;
}

let gmailTransporter: Transporter | null = null;

function getGmailTransporter(): Transporter {
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      host: GMAIL_HOST,
      port: GMAIL_PORT,
      secure: true, // implicit TLS on 465
      auth: { user: gmailUser, pass: gmailPassword },
      // Fail fast: a stuck socket must not hang the request that sent it.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return gmailTransporter;
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
export function emailShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background-color:#f4f5f7;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:linear-gradient(135deg,#064e3b,#10b981);padding:20px 24px;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">RentBase-PH</span>
      </div>
      <div style="padding:24px;color:#111827;font-size:15px;line-height:1.6;">
        <h1 style="margin:0 0 12px;font-size:18px;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">
        Sent by RentBase-PH
      </div>
    </div>
  </body>
</html>`;
}

export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  const logInstead = () => {
    // No transport (local dev) — log the email so flows remain testable.
    console.log(
      `[email:dev] To: ${payload.to}\n[email:dev] Subject: ${payload.subject}\n[email:dev] Body:\n${payload.text}`,
    );
    return {
      delivered: false,
      reason: "No email transport configured — logged instead",
    } satisfies SendResult;
  };

  if (TRANSPORT === "log") return logInstead();

  if (TRANSPORT === "gmail") {
    if (!warnedAboutGmailFrom && explicitFrom !== "" && !gmailFromMatches) {
      warnedAboutGmailFrom = true;
      console.warn(
        `[email] EMAIL_FROM (${explicitFrom}) is not your GMAIL_USER — Gmail ` +
          `can only send as ${gmailUser}. Sending as ${FROM} instead.`,
      );
    }

    try {
      const info = await getGmailTransporter().sendMail({
        from: FROM,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      const rejected = (info.rejected ?? []).map(String);
      if (rejected.length) {
        console.error("[email:error] Gmail rejected:", rejected);
        return {
          delivered: false,
          reason: `Gmail rejected: ${rejected.join(", ")}`,
        };
      }
      return { delivered: true };
    } catch (error) {
      console.error("[email:error]", error);
      return {
        delivered: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const client = getResend();
  // Unreachable given how TRANSPORT is resolved, but keeps the guard honest.
  if (!client) return logInstead();

  if (usingSharedSender && !warnedAboutSharedSender) {
    warnedAboutSharedSender = true;
    console.warn(
      "[email] EMAIL_FROM is not set — sending from the shared Resend " +
        "sender, which only delivers to the Resend account's own address. " +
        "Verify a domain and set EMAIL_FROM to reach anyone else.",
    );
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
      text: `Hi ${landlordName ?? "there"},\n\nThe lease for ${tenantName} at ${unitName} (${propertyName}) ends on ${endDateText} (${daysText}).\n\nMonthly rent: ₱${rentAmount}\n\nReview or renew the lease: ${leaseUrl}\n\n— RentBase-PH`,
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
        text: `Hi ${tenantName},\n\nThis is a reminder that your lease for ${unitName} (${propertyName}) ends on ${endDateText} (${daysText}).\n\nContact your landlord to discuss renewal or move-out arrangements.\n\n— RentBase-PH`,
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
    text: `Hi ${r.tenantName},\n\nWe received your rent payment of ${r.amountText} on ${dateText} for ${r.unitName} (${r.propertyName}).\n\nView your payment history: ${portalUrl}\n\n— RentBase-PH`,
    html: emailShell(
      "Payment received",
      `<p>Hi ${tenantLabel},</p>
       <p>We received your rent payment of <strong>${amountLabel}</strong> on <strong>${dateText}</strong> for <strong>${unitLabel}</strong>.</p>
       <p><a href="${portalUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">View payment history</a></p>`,
    ),
  });
}

export interface VerificationCodeEmail {
  to: string;
  name: string | null;
  code: string;
  expiresInMinutes: number;
}

export interface FeatureRequestUpdateEmail {
  to: string;
  name: string | null;
  requestTitle: string;
  statusLabel: string;
  /** The owner's note to the submitter, if any. */
  note: string | null;
}

/**
 * Tell a landlord what happened to their feature request. This is the whole
 * point of collecting them: a request box that never answers reads as a black
 * hole, and people stop trusting the channel after one try.
 */
export async function sendFeatureRequestUpdateEmail(
  r: FeatureRequestUpdateEmail,
): Promise<SendResult> {
  const title = escapeHtml(r.requestTitle);
  const statusLabel = escapeHtml(r.statusLabel);
  const note = r.note ? escapeHtml(r.note) : null;
  const feedbackUrl = `${APP_URL}/feedback`;

  return sendEmail({
    to: r.to,
    subject: `Your feature request: ${r.statusLabel}`,
    text: `Hi${r.name ? ` ${r.name}` : ""},\n\nThere's an update on your feature request "${r.requestTitle}":\n\nStatus: ${r.statusLabel}${r.note ? `\n\n${r.note}` : ""}\n\nView it: ${feedbackUrl}\n\n— RentBase-PH`,
    html: emailShell(
      `Update on your request`,
      `<p>Hi${r.name ? ` ${escapeHtml(r.name)}` : ""},</p>
       <p>There's an update on your feature request <strong>${title}</strong>:</p>
       <p style="margin:16px 0;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;"><strong>${statusLabel}</strong></p>
       ${note ? `<p>${note}</p>` : ""}
       <p><a href="${feedbackUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">View my requests</a></p>`,
    ),
  });
}

/**
 * The registration code. The digits are rendered large and spaced out because
 * they get read off a phone and typed back in by hand.
 */
export async function sendVerificationCodeEmail(
  r: VerificationCodeEmail,
): Promise<SendResult> {
  const nameLabel = escapeHtml(r.name ?? "");
  const greeting = r.name ? `Hi ${nameLabel},` : "Hi,";
  const codeLabel = escapeHtml(r.code);
  const portalUrl = `${APP_URL}/dashboard`;

  return sendEmail({
    to: r.to,
    subject: `${r.code} is your RentBase-PH code`,
    text: `${greeting}\n\nYour verification code is ${r.code}\n\nEnter it to finish creating your account. It works once and expires in ${r.expiresInMinutes} minutes.\n\nIf you didn't try to sign up, you can ignore this email — no account was created.\n\n— RentBase-PH`,
    html: emailShell(
      "Confirm your email",
      `<p>${greeting}</p>
       <p>Enter this code to finish creating your account:</p>
       <p style="font-size:32px;letter-spacing:10px;font-weight:700;margin:20px 0;color:#064e3b;">${codeLabel}</p>
       <p style="color:#6b7280;font-size:13px;">It works once and expires in ${r.expiresInMinutes} minutes.</p>
       <p style="color:#6b7280;font-size:13px;">If you didn't try to sign up, you can ignore this email — no account was created.</p>
       <p><a href="${portalUrl}" style="font-size:13px;color:#6b7280;">Open RentBase-PH</a></p>`,
    ),
  });
}

export interface PortalInviteEmail {
  to: string;
  tenantName: string;
  landlordName: string;
  setupUrl: string;
  expiresInHours: number;
}

/**
 * The portal invite. Written for a tenant who will not read a paragraph: one
 * button, one sentence about what it is, and nothing else to do but click.
 */
export async function sendPortalInviteEmail(
  r: PortalInviteEmail,
): Promise<SendResult> {
  const tenantLabel = escapeHtml(r.tenantName);
  const landlordLabel = escapeHtml(r.landlordName);
  const setupUrl = escapeHtml(r.setupUrl);
  const portalUrl = `${APP_URL}/portal`;

  return sendEmail({
    to: r.to,
    subject: `${escapeHtml(r.landlordName)} invited you to your tenant portal`,
    text: `Hi ${r.tenantName},\n\n${r.landlordName} has set up your tenant portal, where you can see your lease, pay rent, and report repairs.\n\nChoose your password here — it takes a moment and works once:\n${r.setupUrl}\n\nOr sign in any time after that at:\n${portalUrl}\n\n— RentBase-PH`,
    html: emailShell(
      "You're invited to your tenant portal",
      `<p>Hi ${tenantLabel},</p>
       <p>${landlordLabel} has set up your tenant portal — your lease, rent payments and repairs, in one place.</p>
       <p>Choose a password to get started:</p>
       <p><a href="${setupUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Set my password</a></p>
       <p style="color:#6b7280;font-size:13px;">The button works once and expires in ${r.expiresInHours} hours. After that, you sign in with your email and password.</p>
       <p style="color:#6b7280;font-size:13px;">If the button doesn't work, paste this link into your browser:<br>${setupUrl}</p>
       <p style="color:#6b7280;font-size:13px;">Didn't expect this? You can ignore it — nothing has changed.</p>`,
    ),
  });
}

export interface PasswordResetEmail {
  to: string;
  name: string | null;
  resetUrl: string;
  expiresInMinutes: number;
}

/** The reset link. Kept deliberately plain — no tracking pixels, no logo. */
export async function sendPasswordResetEmail(
  r: PasswordResetEmail,
): Promise<SendResult> {
  const nameLabel = escapeHtml(r.name ?? "");
  const greeting = r.name ? `Hi ${nameLabel},` : "Hi,";
  const resetUrl = escapeHtml(r.resetUrl);

  return sendEmail({
    to: r.to,
    subject: "Reset your RentBase-PH password",
    text: `${greeting}\n\nUse the link below to choose a new password. It works once and expires in ${r.expiresInMinutes} minutes.\n\n${r.resetUrl}\n\nIf you didn't ask for this, you can ignore this email — nothing has changed.\n\n— RentBase-PH`,
    html: emailShell(
      "Reset your password",
      `<p>${greeting}</p>
       <p>Use the button below to choose a new password. The link works once and expires in ${r.expiresInMinutes} minutes.</p>
       <p><a href="${resetUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Choose a new password</a></p>
       <p style="color:#6b7280;font-size:13px;">If the button doesn't work, paste this link into your browser:<br>${resetUrl}</p>
       <p style="color:#6b7280;font-size:13px;">If you didn't ask for this, you can ignore this email — nothing has changed.</p>`,
    ),
  });
}
