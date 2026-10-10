# Property Management System

A web app for independent landlords to register properties, monitor income,
and track maintenance — built with Next.js (App Router), React, Drizzle ORM,
and Neon Postgres.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions-ready)
- **React 19** + TypeScript
- **shadcn/ui** (Base UI) + Tailwind CSS 4
- **Auth.js v5** (next-auth) — email/password (bcrypt), JWT sessions
- **Drizzle ORM + drizzle-kit** — schema, migrations
- **Neon Postgres** — serverless database

## Project structure

```
src/
  app/
    page.tsx            # public landing page (/)
    (marketing)/        # public auth pages: /login, /register
    (dashboard)/        # landlord app (auth-gated): /dashboard + sections
    api/auth/           # Auth.js handler + registration API
  db/
    schema.ts           # all tables (auth + app)
    client.ts           # Neon + Drizzle client
  components/
    ui/                 # shadcn/ui components
    dashboard/          # sidebar, stat cards, placeholders
scripts/
  migrate.ts            # applies drizzle migrations to Neon
```

## Data model

`users` → `properties` → `units` → `leases` → `payments`, plus `tenants`,
`expenses`, `maintenance_requests`, `documents`, `notifications`.
Every row is scoped to the owning `userId`.

## Setup

```bash
npm install

# 1. Create a free database at https://neon.tech, then copy the
#    connection string (pooled) into .env.local:
cp .env.example .env.local

# 2. Generate an auth secret and paste it into .env.local:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. Apply the schema to Neon (either):
npm run db:push        # syncs schema directly (dev-friendly)
npm run db:migrate     # applies generated SQL migrations in ./drizzle

# 4. Run the dev server:
npm run dev            # http://localhost:3000
```

Register a new account at `/register` to create your landlord account.

## Useful scripts

| Command | Purpose |
|---|---|
| `npm run db:generate` | Generate a new migration after editing `src/db/schema.ts` |
| `npm run db:push` | Push schema changes directly to Neon (no migration files) |
| `npm run db:migrate` | Apply migrations in `./drizzle` |
| `npm run db:studio` | Browse the database in Drizzle Studio |

## Deploying to Vercel

1. Push the repo to GitHub.
2. Import it at https://vercel.com/new (Vercel auto-detects Next.js).
3. Add `DATABASE_URL` and `AUTH_SECRET` in **Project Settings → Environment Variables**.
4. Deploy. Run migrations on deploy with the `db:migrate` script, or use
   `drizzle-kit push` once from a shell via `vercel run`.

## Roadmap

See `PLAN.md` for the full plan. Next milestones:

- Properties & units CRUD with photo uploads
- Tenants & leases management
- Income/expense tracking + reports
- Maintenance request workflow
- Phase 2: Stripe rent collection, tenant portal
- Phase 3: e-sign leases, accounting integrations

## Notes

- `cacheComponents` is disabled in `next.config.ts` because the dashboard
  reads the server session (cookies). Re-enable it later with `<Suspense>`
  boundaries around dynamic segments if you want partial prerendering.
- OAuth (e.g. Google) can be added to `src/auth.ts` providers — the
  adapter and tables are already wired up.
