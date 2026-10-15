# Property Management System — Development Plan

A web app for landlords to register properties, track income/expenses, manage tenants & leases, and handle maintenance requests.

## Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 | SSR, Server Actions, API routes in one |
| Language | TypeScript | Safety across the stack |
| UI | Tailwind CSS + shadcn/ui | Fast, accessible, consistent components |
| Database | Supabase (Postgres) *or* Neon Postgres + Prisma ORM | Managed, cheap, scales |
| Auth | Auth.js (NextAuth) — credentials/magic links | Flexible, Next.js native. Clerk = faster alternative |
| File storage | Cloudflare R2 / S3 | Property & maintenance photos |
| Email | Resend | Transactional notifications |
| Payments (Phase 2) | GCash | Rent collection (send-money + reference flow), receipts |
| Deploy | Vercel + Supabase/Neon | Zero-config |

## Architecture

- **Route groups:** `(marketing)` landing/auth · `(dashboard)` landlord app (protected) · `(tenant)` tenant portal (protected)
- **Data access:** Server Components + Server Actions (or tRPC if you prefer explicit APIs)
- **Multi-tenancy:** every table scoped by `userId`/`orgId`; enforce scoping in every query (use RLS if Supabase)
- **Roles:** `users.role` — `landlord` (dashboard) / `tenant` (portal); the session callback exposes it, login routes by it, and both layouts guard in opposite directions

## Data Model (Prisma sketch)

- **User** — landlord account (email, hashed password, plan)
- **Property** — address, type, photos, units[]
- **Unit** — propertyId, name/number, bedrooms, rentAmount, status (vacant/occupied)
- **Tenant** — name, phone, email
- **Lease** — unitId, tenantId, start/end dates, rent, deposit, status
- **Payment** — leaseId, amount, date, method, type (rent/late fee)
- **Expense** — propertyId, category, amount, date, vendor
- **MaintenanceRequest** — unitId, tenantId, title, description, priority, status (new → in progress → resolved), photos
- **Document** — leases, inspection reports
- **Notification** — in-app + email log

## MVP Feature Set (Phase 1)

1. Auth: register/login, email verification
2. Dashboard KPIs: occupancy rate, income this month, open requests, expiring leases
3. Properties & units: CRUD with photo uploads
4. Tenants & leases: CRUD, lease-end alerts
5. Finance: record payments & expenses, recurring rent, simple P&L per property
6. Maintenance: create/update requests, status workflow, photos
7. Email notifications (new request, rent due, lease expiring)

## Phase 2

- ~~Stripe rent collection~~ **GCash rent collection** ✅ — the tenant portal's pay-rent flow now runs on GCash, the dominant PH wallet: the landlord saves their GCash number under **Settings** (new `/settings` page, `users.gcash_number`/`gcash_name`); tenants open the pay-rent page which shows the wallet + exact amount + send-money steps, then submit the **reference number** from their GCash confirmation (`confirmGcashPaymentAction` — validates, records a payment with method `gcash` and note `GCash payment — Ref #N`, re-submitting the same reference can't double-record, receipt email still goes out). The landlord verifies references against their GCash history — they're surfaced right in the Finance payments table. Stripe was **removed** (webhook route, `stripe` dep, demo fallback) — the reference flow needs no merchant account or gateway; a PayMongo/Xendit integration (GCash + Maya + QR Ph, ~1.3% MDR) is the upgrade path if merchant checkout is ever wanted
- Tenant portal (view lease, pay rent, submit requests) ✅
- Reports: cash flow, P&L, occupancy history; CSV export ✅ — plus a multi-select **property filter** (dropdown of all owned/co-owned properties; selection lives in the URL as `?properties=`, survives period switches, applies to every chart/table and CSV download; unknown/inaccessible ids are ignored server-side)
- Team seats (property managers with limited roles) ✅
- Mobile display audit + fixes: Playwright sweeps of every route at 390/360px (no horizontal overflow anywhere); dialog form grids now stack below `sm` ✅
- **Gamification** ✅ — dashboard adds a **Portfolio Health Score** (animated 0–100 ring weighted from occupancy 35% / rent collection 35% / maintenance responsiveness 20% / lease stability 10%, with per-component bars; components that don't apply yet are excluded and weights renormalize), **XP & landlord levels** (`xp_events` append-only ledger; server actions award XP on create — property +50, unit +15, tenant +20, lease +30, payment +10, expense +5, request +10, resolve +25, portal grant +15; triangular level curve 50·n·(n−1), titles change every level through 10: Rookie Landlord → Apprentice → … → Real Estate Mogul), and **achievements** (7 badges derived from data — First Steps, Portfolio Builder, Full House, Perfect Month, Speed Runner, Six Figures, Property Tycoon — persisted in `achievements` on first unlock so sonner toast + canvas-confetti celebration fires once; a 🔥 perfect-collection streak counter walks completed months backward from payment/lease history). `src/lib/gamification.ts` computes it all in one pass per dashboard load (owned + co-owned scope, same as KPIs); UI in `src/components/gamification/gamification-panel.tsx`; `<Toaster/>` now mounted in the root layout

## Phase 3

- E-sign leases (DocuSign/Dropbox Sign), tenant screening
- QuickBooks/Xero integration
- PWA / mobile-first polish
- AI: auto-categorize expenses, rent pricing suggestions

## 12-Week Milestones

- **W1–2:** Project setup, auth, DB schema, dashboard shell ✅
- **W3–4:** Properties & units CRUD ✅
- **W5–6:** Tenants & leases ✅
- **W7–8:** Income/expense tracking + reports ✅ (finance CRUD, per-property P&L, cash-flow/occupancy reports with CSV export)
- **W9–10:** Maintenance requests ✅ (status workflow + resolvedAt stamping; photos pending)
- **W11–12:** Testing, polish, deploy, beta launch

## Progress

- **Done:** Next.js 16 + React 19, Auth.js v5, Drizzle + Neon (neon-http), shadcn/ui (Base UI), Philippine localization (PHP currency, PH address defaults, country dropdown with location detection), properties & units CRUD, tenants & leases CRUD (with unit occupancy sync), finance (payments + expenses with summary totals and per-property P&L; the payment dialog also backfills a **month range** — pick a start/end month plus a day and it creates one payment record per month, clamped to each month's length so day 31 becomes Feb 28 / Apr 30, capped at 36 months and tied to a lease), maintenance requests (priority/status badges, resolvedAt lifecycle), lease-end email alerts (Resend + daily Vercel cron, one reminder per lease term, re-armed when the end date moves), mobile navigation (sticky header + slide-in drawer below `md`), **co-ownership + team roles** (`property_collaborators` table; owners share a property by email from the property page with a role: **co-owner** (full manage) or **viewer** (read-only); every query scopes through `src/lib/access.ts` — reads use the access tier, all mutations gate on the `canManage*` tier so viewers see badges and read-only pages everywhere; owner-only: deleting the property and managing the share list; tenants stay per-creator — collaborators see a partner's tenants read-only), **reports + CSV export** (`/reports` with 3/6/12/24-month periods: cash-flow chart + table, P&L by property, occupancy history derived from lease date overlaps; CSV downloads via `/api/reports/csv` sharing one engine in `src/lib/reports.ts` so screen and export numbers always match), **tenant portal** (`users.role` landlord/tenant + `tenants.account_id` link; the landlord grants access from a card on the tenant edit page — password ≥ 8 chars, tenant email required — with a `Portal` badge on the roster and revoke that reassigns the tenant's filed requests to the landlord before removing the login; `/portal` shows the lease + history, a **pay-rent card** (GCash — tenant sends rent to the landlord wallet and submits the reference number), payment history, and an inline maintenance form that derives property/unit from the tenant's own active lease; guards run both directions — tenants bounce off `/dashboard`, landlords off `/portal`, and login routes by role), **GCash rent payments** (the landlord saves their GCash wallet at the new `/settings` page; the tenant pay-rent page shows the number, exact amount, and send-money steps, then collects the **reference number** — recorded as method `gcash` with the reference in the notes so the landlord can verify it in Finance, where it's displayed inline; duplicate submissions of the same reference can't double-record; Stripe was removed entirely — webhook route, dependency, and demo fallback), and a Base UI Button wrapper fix (`render={<Link/>}` now auto-sets `nativeButton={false}`, silencing the dev warning on every link-button in the app), plus the **Emerald Estate theme** (the app was 100% achromatic — every oklch token had zero chroma; now emerald primary + a deep-forest-green sidebar with sidebar-token nav states, gold/amber chart + achievement accents that match the XP system, green-tinted neutrals, radius 0.625→0.75rem, emerald favicon/logo gradient) and a **dark mode** (`next-themes` provider in the root layout + `suppressHydrationWarning` on `<html>`, light/dark toggle in the sidebar footer, mobile header, and the tenant portal header; follows the OS by default and persists to localStorage). The font was also repaired — `--font-sans: var(--font-sans)` referenced a variable nothing defined, so the whole app silently rendered in the browser's serif default; it now maps to next/font's `--font-geist-sans`. Finance also gained the **property filter** that only Reports had: one shared `PropertyFilter` dropdown (`src/components/filters/property-filter.tsx`) plus `src/lib/property-filter.ts` for the `?properties=` grammar — absent = all, `none` = deselect all, otherwise a comma-joined id list. "Select all" drops the param (canonical unfiltered URL) and "Deselect all" writes the `none` sentinel, which the report engine short-circuits into a zeroed report so drizzle never sees an empty `inArray`. On Finance it narrows payments, expenses, the per-property P&L and the totals; records booked to no property ("Not linked"/unassigned) drop out while a filter is active, and the empty states explain that. Both pages' dropdowns also gained **Select all / Deselect all** — and that surfaced a latent bug: the old "All properties" reset item used Radix's `onSelect`, which Base UI ignores (it's a valid-but-unhandled `div` attribute, so TypeScript stayed silent). Base UI menu items fire **`onClick`**; checkbox items fire `onCheckedChange`.
- **Deferred:** maintenance/property photos (needs R2/S3 storage — no credentials yet; build with local-storage dev fallback when starting), automated rent reminders and late fees (need either a live payment gateway — PayMongo/Xendit for PH — or cron logic over recorded payments), Maya/QR-Ph payment options (same gateway path as GCash checkout)
- **Next:** Vercel deployment (env vars: DATABASE_URL, AUTH_SECRET, AUTH_URL, CRON_SECRET, RESEND_API_KEY, EMAIL_FROM). Remaining Phase 2: photos (R2/S3) parked until credentials arrive.

## Quality & Security

- Testing: Vitest (unit) + Playwright (e2e); ESLint + Prettier
- Security: RLS/row scoping, rate limiting on auth, audit logs on financial records, GDPR-friendly data handling
- Backups & seed data for dev

### Dev-environment gotchas (learned the hard way)

- **CSS/theme edits need `rm -rf .next` + a dev-server restart.** The custom `turbopack.rules` entry for `*.css` in `next.config.ts` caches the compiled stylesheet, so Turbopack keeps serving the old chunk (same filename hash) even after a full restart — theme changes look like they simply didn't happen. Clear `.next` after touching `globals.css`.
- The Next dev indicator defaults to **bottom-left**, where it sits on top of the sidebar footer's theme toggle and sign-out button and swallows clicks. `devIndicators.position` is set to `"bottom-right"` in `next.config.ts`.
- Playwright: `button[aria-label="…"]` matches three toggles across desktop sidebar / mobile header / drawer — scope with `:visible` or a container locator, or clicks hit hidden elements.
- Never edit markdown with PowerShell `Get-Content`/`Set-Content` round-trips — it mangles em dashes into U+FFFD. Use the edit tool or Node (`fs.readFileSync/writeFileSync` with `\uXXXX` escapes).

## Quick Start (when ready)

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir
npm i prisma @prisma/client next-auth zod react-hook-form @hookform/resolvers
npm i -D @types/node typescript vitest
```
