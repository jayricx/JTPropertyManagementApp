# Contact Us page — plan

## Goal

Give landlords, tenants, and prospects a single, trustworthy place to reach us,
without creating a support burden we can't staff. The page must (a) answer the
obvious questions before they're asked, (b) route each kind of message to the
right channel, and (c) capture what we need to reply — and do it on a
marketing page, with no login required.

## Why now

- The footer and nav have no "Contact" link. The only public entry points are
  `/register` and `/login`, which is the wrong shape for "I have a problem".
- The FAQ already exists and answers most product questions, but there's no
  path from "that didn't help" to a human.
- The feature-request flow (`/feedback/inbox`, `feature-requests.ts`) is
  landlord-account-only and gated at `MAX_OPEN_REQUESTS = 3`. Prospects and
  tenants have no way in at all.
- We're about to ask people to pay (billing is coming). A paid product with no
  visible support channel reads as abandoned.

## Route and chrome

- **Path:** `/contact`
- **Route group:** `(marketing)` — inherits `MarketingNav` + `MarketingFooter`.
- **Metadata:** title "Contact us — Renta-PH.net", description focused on
  support + feedback + partnerships.
- **Add "Contact"** to the footer's Product column and (optionally) the nav.
  Keep the nav lean — footer is enough unless we see demand.

## Page structure (top to bottom)

1. **Hero** — "Talk to a person, not a bot." Short subline: we read every
   message, reply within one business day, in English or Filipino.
2. **Three routing cards** (the key design decision — see below):
   - **Support** — something isn't working → form + email
   - **Feature request / idea** — → link to create an account + roadmap
   - **Partnerships & press** — → email only
3. **Contact form** (Support card, inline) — name, email, subject, message.
4. **What to include** — a short checklist so we get useful bug reports:
   lease ID or property, browser/device, what you expected vs. what happened.
5. **Other ways to reach us** — email, Facebook page, (later) a community
   group. No live chat, no phone number yet.
6. **Response-time promise** — "We reply within one business day. Weekends and
   PH holidays may take longer."

## Routing decision (the part that matters)

The single biggest risk is the contact form becoming a catch-all inbox that
duplicates the feature-request flow and the admin feedback inbox. Three rules:

- **Bug / "it's broken" / "how do I…"** → contact form → stored as a
  support ticket, emailed to the operator.
- **"Please build X"** → not the contact form. Route to `/register` +
  in-app feature request (which already has categories, status tracking, and
  the 3-open cap). The contact page says so explicitly and links there.
- **Partnerships, press, billing disputes, account deletion requests** →
  email only, no form. These need a paper trail and a human.

This keeps the form narrow and prevents it from eating the feature-request
system.

## Data model

Two options; recommend **Option A**.

**Option A — reuse the existing `feature_requests` table with a new category.**
- Add `"support"` to `FeatureRequestCategory`.
- Pros: one inbox, one admin view (`/feedback/inbox`), one status flow,
  no new migration, no new admin page.
- Cons: support tickets would show on the public roadmap if someone sets
  `isPublic` — guard against that (support tickets are never public).
- Effort: small.

**Option B — new `support_tickets` table.**
- Cleaner separation, own status enum (open / replied / resolved / closed),
  own admin view.
- Cons: new migration, new admin page, new notification path. More to
  maintain for a volume we can't yet estimate.
- Effort: medium.

Recommendation: **Option A now**, with a clear migration path to Option B if
support volume exceeds ~20 tickets/week or we need SLA tracking. The schema
already supports everything we need (category, status, updates, author, admin
notes).

## Form and validation

- Fields: `name` (required, ≤ 100), `email` (required, valid email),
  `subject` (required, ≤ 150, or a dropdown of categories), `message`
  (required, 20–2000 chars).
- New `contactSchema` in `src/lib/validations.ts`, mirroring `chargeSchema`
  style.
- Server action `submitContactAction` in `src/app/(marketing)/contact/actions.ts`
  (or reuse `src/app/(marketing)/actions.ts` if it exists — check first).
- Honeypot field + simple rate limit (e.g. 3 submissions per IP per hour)
  to keep spam out. No CAPTCHA initially — add only if spam shows up.
- On submit: create the record, email the operator (Resend, once the domain
  is verified), show a success state with the ticket reference and expected
  reply window. Do **not** promise a reply we can't deliver.

## Email

- Reuses `src/lib/email.ts` (`sendContactNotification` or similar).
- Blocked on the Resend domain verification (same blocker as contract sends).
- Until then: store the ticket and surface it in `/feedback/inbox`; the
  operator checks manually. The page should not promise email replies until
  Resend is live — say "we'll get back to you" without specifying the channel.

## Page copy (draft)

- Hero: "Get in touch"
- Sub: "We're a small team building Renta-PH.net for Filipino landlords. We
  read every message and reply within one business day."
- Support card: "Something isn't working, or you can't figure out how to do
  something? Tell us. Include your lease or property if you can — it speeds
  things up."
- Feature card: "Have an idea for a feature? That goes through your account so
  we can come back to you when it ships. Create a free account and send it in
  from there. See what others have asked for on the roadmap."
- Partnerships card: "For partnerships, press, or anything billing-related,
  email us directly."
- Empty-state / success: "Got it. We'll reply to {email} within one business
  day."

## SEO and discoverability

- Add `ContactPage` JSON-LD (or at least a `mailto:` link) so search engines
  surface a contact method.
- Link from the footer (Product column) and from the FAQ's "still stuck?"
  section.
- Sitemap: add `/contact` (check `src/app/sitemap.ts` if it exists).

## What this plan deliberately excludes

- **Live chat / chatbot.** No one to staff it; a dead chat widget is worse
  than none.
- **Phone number.** Same reason, plus cost. Add only if enterprise landlords
  ask.
- **A separate support portal / ticketing system (Zendesk, Intercom).**
  Overkill at this scale; the existing feedback inbox covers it.
- **Auto-replies / canned responses.** Write real replies; the volume will be
  low enough for a while.

## Implementation order (if approved)

1. Add `"support"` to `FeatureRequestCategory` + label "Support / help".
2. `contactSchema` in validations.
3. `submitContactAction` server action (create record, email operator).
4. `/contact` page (hero + routing cards + form + success state).
5. Footer link + FAQ cross-link.
6. Rate limit + honeypot.
7. Test: submit as a logged-out visitor, verify it lands in `/feedback/inbox`,
   verify the email (once Resend is live).

## Decisions (answered)

1. **Support email address** — No dedicated support email exists yet. The form will store
   tickets in the DB and surface them in `/feedback/inbox`. Email notification to the
   operator will fire once Resend is live, using an env var `SUPPORT_EMAIL` (falling
   back to the operator's account email). Until then, the page says "we'll get back
   to you" without promising a channel.
2. **Who can submit** — Open to anyone, including tenants. The admin inbox will
   receive both landlord and tenant messages. The form asks for name + email (no
   login required), so tenant messages are identifiable by the submitter's email.
3. **Response-time promise** — "We aim to reply within a few days, depending on
   the request." Not a hard SLA.
4. **Facebook page** — https://www.facebook.com/share/1LfhDZj49R/ — linked in the
   "Other ways to reach us" section. No community group yet.

## Estimated effort

Half a day to a day, depending on whether Option A (reuse feature_requests) or
Option B (new table) is chosen. Option A is recommended and is the faster path.
No new migrations needed either way beyond adding the category.