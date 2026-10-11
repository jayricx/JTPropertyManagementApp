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
| Payments (Phase 2) | Stripe | Rent collection, receipts |
| Deploy | Vercel + Supabase/Neon | Zero-config |

## Architecture

- **Route groups:** `(marketing)` landing/auth · `(dashboard)` landlord app (protected) · `(tenant)` tenant portal (Phase 2)
- **Data access:** Server Components + Server Actions (or tRPC if you prefer explicit APIs)
- **Multi-tenancy:** every table scoped by `userId`/`orgId`; enforce scoping in every query (use RLS if Supabase)
- **Roles:** `LANDLORD` now, `TENANT` later (middleware + RBAC checks)

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

- Stripe rent collection (payment links), automated receipts, reminders, late fees
- Tenant portal (view lease, pay rent, submit requests)
- Reports: cash flow, P&L, occupancy history; CSV export
- Team seats (property managers with limited roles)

## Phase 3

- E-sign leases (DocuSign/Dropbox Sign), tenant screening
- QuickBooks/Xero integration
- PWA / mobile-first polish
- AI: auto-categorize expenses, rent pricing suggestions

## 12-Week Milestones

- **W1–2:** Project setup, auth, DB schema, dashboard shell ✅
- **W3–4:** Properties & units CRUD ✅
- **W5–6:** Tenants & leases ✅
- **W7–8:** Income/expense tracking + reports ✅ (finance CRUD + totals; per-property reports pending)
- **W9–10:** Maintenance requests ✅ (status workflow + resolvedAt stamping; photos pending)
- **W11–12:** Testing, polish, deploy, beta launch

## Progress

- **Done:** Next.js 16 + React 19, Auth.js v5, Drizzle + Neon (neon-http), shadcn/ui (Base UI), Philippine localization (PHP currency, PH address defaults, country dropdown with location detection), properties & units CRUD, tenants & leases CRUD (with unit occupancy sync), finance (payments + expenses with summary totals and per-property P&L), maintenance requests (priority/status badges, resolvedAt lifecycle), lease-end email alerts (Resend + daily Vercel cron, one reminder per lease term, re-armed when the end date moves), mobile navigation (sticky header + slide-in drawer below `md`), **co-ownership** (`property_collaborators` table; owners share a property by email from the property page; co-owners get full manage access — units, leases, finance, maintenance — everywhere the app scopes by property via `src/lib/access.ts`; owner-only: deleting the property and managing the co-owner list; tenants stay per-creator — co-owners see a partner's tenants read-only; the `role` column is ready for a future read-only "viewer" share).
- **Deferred:** maintenance/property photos (needs R2/S3 storage), recurring rent automation (needs Stripe) — both Phase 2.
- **Next:** Vercel deployment (env vars: DATABASE_URL, AUTH_SECRET, AUTH_URL, CRON_SECRET, RESEND_API_KEY, EMAIL_FROM).

## Quality & Security

- Testing: Vitest (unit) + Playwright (e2e); ESLint + Prettier
- Security: RLS/row scoping, rate limiting on auth, audit logs on financial records, GDPR-friendly data handling
- Backups & seed data for dev

## Quick Start (when ready)

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir
npm i prisma @prisma/client next-auth zod react-hook-form @hookform/resolvers
npm i -D @types/node typescript vitest
```
