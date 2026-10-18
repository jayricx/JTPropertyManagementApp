# Portfolio Model — Design

**Status:** Implemented. Phases 0–3 shipped together; the migration is applied
to the dev database (`_migrate_portfolios.mjs`, then
`_migrate_portfolios_retire.mjs`).
**Supersedes:** per-property co-ownership (`property_collaborators`) and per-user custom-field scoping.

## What shipped

- `portfolios` + `portfolio_members` (`owner` / `co_owner` / `viewer`), with
  `ON DELETE RESTRICT` everywhere so no cascade can delete a portfolio's data.
- `src/lib/portfolios.ts` — membership, the active-portfolio cookie, and
  provisioning (`ensurePortfolioForUser`). Every user gets one silently at
  signup, so a solo owner never sees the word "portfolio".
- `src/lib/access.ts` — same eight read-tier signatures, now resolving through
  the portfolio. `property_collaborators` is gone.
- Portfolio switcher in the nav, rendered **only when there are 2+**.
- Settings → **Portfolio members** (one invite per person, role change, remove)
  and a **Custom fields** overview; the old per-property co-owner card is gone.
- Custom fields on properties, leases and tenants: values on the record's own
  page, definitions owner-only, portfolio-scoped.
- `plan` stays on the account; a portfolio's quota is its **owner's** plan and
  its own unit count. Co-owned membership doesn't consume quota.
- Payout details (GCash, bank accounts), the "your landlord" label and the
  lease-end cron all resolve through the **portfolio owner**.

## Summary

Hoist the ownership bucket one level up. A **Portfolio** becomes the container that owns
properties, units, leases, tenants and custom-field definitions. Accounts get access through a
`portfolio_members` pivot with three roles. A co-owner invited once sees the whole portfolio —
including exactly the same custom fields as the primary owner — instead of a hand-picked
per-property slice.

The read side is already factored: `src/lib/access.ts` (223 lines, 11 exports) mediates **53 call
sites across 21 files**. Because those 11 signatures can stay identical while their internals
change from `properties.userId` to portfolio resolution, most of the migration is one file.

## Decisions (locked)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Co-ownership is portfolio-wide.** `property_collaborators` is retired, not layered. | One concept instead of two; matches the brief; keeps RBAC at the same three roles that already exist. Cost is called out in R1. |
| D2 | **An account may belong to many portfolios**, with a switcher that renders only when > 1. | Required by the co-owner invite flow anyway. Single-portfolio users see zero new chrome. |
| D3 | **Custom-field *definitions* are owner-only.** Co-owners and viewers edit/read *values*. | Per the brief. Reverting to co-owner-definable is a one-line change to the matrix in §4. |
| D4 | **`plan` stays on the account, not the portfolio.** | Billing belongs to the paying account; avoids a billing rewrite. The portfolio resolves its plan through its owner (§3.4). |
| D5 | **Payout details (GCash, bank accounts) resolve to the portfolio owner** for now. | The tenant-facing pay-rent flow needs exactly one destination. A dedicated portfolio payout record is a later nicety (R3). |
| D6 | **Author/creator columns stay per-user** (`payments.userId`, `expenses.userId`, `charges.userId`, `documents.userId`, `leaseNotes.userId`). | They are *who did it*, not *what they can see*. Keeping them preserves the "creator OR manager can edit" rule. |

## Goals

- One bucket owns properties, units, leases, tenants and custom-field definitions.
- Access granted once per portfolio, with roles: `owner`, `co_owner`, `viewer`.
- A co-owner sees identical custom-field definitions to the primary owner.
- A solo owner with one portfolio experiences no change at all — no new screen, no setup step.
- Data safety: no FK cascade can ever delete a portfolio's properties.

## Non-goals (deferred)

- Portfolio-level notifications fan-out (`notifications` table exists but has zero call sites — greenfield, not migration).
- Multiple payout accounts per portfolio; shared billing across portfolios.
- Cross-portfolio rent comparables (`src/lib/rent-insights.ts:84-102` currently reads every unit in a city — pre-existing, out of scope).
- Import/migration UI between portfolios.

## 1. Today

```
users ──1:N──> properties ──1:N──> units ──1:N──> leases ──> tenants
                    │
                    └──< property_collaborators (per property: co_owner | viewer)
tenants.userId = creator landlord   (also used as *scope* in ~14 predicates)
custom_field_definitions.userId    (schema only — zero call sites)
```

Access resolves in one place, `src/lib/access.ts`:

| Export | Line | Role |
|---|---|---|
| `accessiblePropertyIds` | 16-28 | read tier: owned ∪ all collaborator properties |
| `listAccessibleProperties` | 31-41 | filter UIs |
| `isPropertyOwner` | 44-54 | owner-only powers (delete property, manage sharing) |
| `canAccessProperty` / `canAccessUnit` / `canAccessLease` | 57-115 | read tier, incl. the document-download hub |
| `manageablePropertyIds` | 122-139 | manage tier: owned ∪ `co_owner` only |
| `getPropertyAccess` | 142-166 | `"owner" \| "co_owner" \| "viewer" \| null` |
| `canManageProperty` / `canManageUnit` / `canManageLease` | 169-223 | manage tier, used by every mutating action |

Existing roles already map onto the target vocabulary: `co_owner` ≈ "can manage", `viewer` ≈
"property manager / read-only". No new role is introduced.

## 2. Target data model

```sql
-- The central bucket -------------------------------------------------------
CREATE TABLE portfolios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          varchar(255) NOT NULL,
  -- RESTRICT, never CASCADE: an account that owns a portfolio cannot be
  -- deleted until ownership moves or the portfolio is deleted deliberately.
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX portfolios_owner_user_id_idx ON portfolios(owner_user_id);

CREATE TYPE portfolio_role AS ENUM ('owner', 'co_owner', 'viewer');

CREATE TABLE portfolio_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE RESTRICT,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         portfolio_role NOT NULL DEFAULT 'co_owner',
  added_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamp NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_members_portfolio_user_key UNIQUE (portfolio_id, user_id)
);
CREATE INDEX portfolio_members_user_id_idx ON portfolio_members(user_id);

-- Properties belong to a portfolio -----------------------------------------
ALTER TABLE properties ADD COLUMN portfolio_id uuid
  REFERENCES portfolios(id) ON DELETE RESTRICT;
-- properties.user_id stays, now meaning "created by"; Phase 3 drops it.

-- Custom-field definitions follow the portfolio -----------------------------
ALTER TABLE custom_field_definitions ADD COLUMN portfolio_id uuid
  REFERENCES portfolios(id) ON DELETE RESTRICT;
-- backfill, then drop user_id and rebuild the unique key as (portfolio_id, entity, key)
```

**Invariants (enforced in the app layer, documented here because the DB cannot):**

1. A portfolio always has at least one membership row with `role = 'owner'`.
2. `portfolios.owner_user_id` always has a matching membership row with `role = 'owner'` —
   ownership is resolvable two ways on purpose (role for RBAC, owner for billing/payout), so they
   must agree.
3. The last owner cannot be removed or demoted; they must transfer ownership first.
4. `properties.user_id` (creator) and `properties.portfolio_id` may differ after an invite —
   that is exactly the co-owner case.

### 2.1 What moves, what stays

| Moves to portfolio | Stays a per-user author stamp (D6) | Dead — free to re-point |
|---|---|---|
| `properties.userId` → `portfolioId` (13 read sites) | `payments.userId`, `expenses.userId`, `charges.userId`, `documents.userId`, `leaseNotes.userId`, `maintenanceRequests.userId` | `custom_field_definitions` — 0 call sites, unique key rebuilt only |
| `tenants.userId` → `portfolioId` — **the real churn: ~14 predicates** | `xp_events` / `achievements` — personal gamification stays personal (avoids the `achievements_user_key` unique) | `notifications` — 0 call sites |
| `property_collaborators` → retired into `portfolio_members` | `bank_accounts.userId`, `users.gcashNumber` (resolve via owner, D5) | `customFieldsProperty/Lease/Tenant` consts, `schema.ts:721-729` |
| `custom_field_definitions.userId` → `portfolioId` | | |

The "real churn" is tenant scoping: `tenants.userId` is used as an *ownership* predicate in
`tenants/page.tsx:54,61`, `tenants/actions.ts:83,100,147,231`, `tenants/[id]/edit/page.tsx:26`,
`leases/new/page.tsx:34`, `leases/[id]/edit/page.tsx:83`, `maintenance/page.tsx:125`,
`maintenance/actions.ts:42`, `leases/actions.ts:266`. Under portfolios every member sees the
portfolio's tenant roster — which also dissolves the `"Co-owner's tenant"` label at
`tenants/page.tsx:153` and the read-only hiding at `:33-34`.

## 3. Access resolution

### 3.1 New primitive

```ts
// src/lib/access.ts (new core, replacing the two-table join)
export type PortfolioRole = "owner" | "co_owner" | "viewer" | null;
export async function portfolioIdsFor(userId: string): Promise<string[]>;
export async function roleInPortfolio(userId: string, portfolioId: string): Promise<PortfolioRole>;
export async function activePortfolio(userId: string): Promise<{ id: string; role: PortfolioRole } | null>;
```

`activePortfolio` reads a `Renta_active_portfolio` cookie, validates membership, and falls back
to the earliest membership. With one portfolio it always resolves to that portfolio, so the
switcher is never needed.

### 3.2 The eight read-tier signatures do not change

`accessiblePropertyIds(userId)`, `manageablePropertyIds(userId)`, `canAccessProperty`,
`canAccessUnit`, `canAccessLease`, `canManageProperty`, `canManageUnit`, `canManageLease` keep
their exact signatures — they resolve through `activePortfolio` internally instead of
`properties.userId`. **All 53 call sites across 21 files compile and behave unchanged.**

Add an explicit cross-portfolio variant for the few places that genuinely need the union (the
switcher itself, invite-by-email lookup, account-level settings):

```ts
accessiblePropertyIdsAcrossPortfolios(userId)  // every property in every portfolio I belong to
```

### 3.3 Replacements

| Today | Becomes |
|---|---|
| `isPropertyOwner(userId, propertyId)` (3 call sites) | `isPortfolioOwner(userId)` / `canManagePortfolio(userId)` |
| `getPropertyAccess(userId, propertyId)` (`properties/[id]/page.tsx:79`, `readings/page.tsx:67`) | `getPortfolioRole(userId, portfolioId)` |
| property-level "Co-owned" / "Viewer" badges (`properties/page.tsx:121`, `properties/[id]/page.tsx:193-197`) | one portfolio badge in the switcher |
| `addCoOwnerAction` / `removeCoOwnerAction` (`properties/actions.ts:157-238`) | `invitePortfolioMemberAction`, `updatePortfolioMemberRoleAction`, `removePortfolioMemberAction` — none exist today (there is no role-update path even on the current pivot) |

### 3.4 Plan and quota

`src/lib/plan-usage.ts:31` counts units by `properties.userId = userId` and
`properties/actions.ts:280-283` gates unit creation on **the actor's** plan. That is the live bug:
a co-owner on Free is blocked at 2 units, and the units they add count toward nobody's quota.

New rule: **quota counts units across the portfolios the user owns** (`role = 'owner'`);
co-owned membership does not consume quota. The plan itself is read from the portfolio owner's
account (D4). The `number | null` shape in `src/lib/plans.ts:5-12` — already stubbed for a future
larger-landlord tier — carries over unchanged.

## 4. RBAC matrix

| Capability | owner | co_owner | viewer |
|---|---|---|---|
| View properties, units, leases, tenants, statements, finance, reports | yes | yes | yes |
| Create/edit property, unit, tenant, lease, charge, expense, maintenance request | yes | yes | no |
| Delete a property | yes | no | no |
| Record / backfill / verify payments and expenses | yes | yes | no |
| **Read** custom-field values | yes | yes | yes |
| **Edit** custom-field values | yes | yes | no |
| **Create / rename / delete custom-field definitions** | yes | no | no |
| Invite, remove, re-role portfolio members | yes | no | no |
| Rename / delete the portfolio | yes | no | no |
| Payout details (GCash, bank accounts) | yes | no | no |
| Plan & billing | yes | no | no |
| XP, health score, achievements | personal | personal | personal |

Existing enforcement style is preserved: server actions gate on a helper (`canManageLease`,
`assertCanManageLease` at `leases/actions.ts:33-41`), pages gate on the same helpers, and UI
hides affordances it knows will fail. Two existing asymmetries to preserve deliberately —
`canModifyPayment` / `canModifyExpense` let a viewer edit records they personally created
(`finance/actions.ts:80-91`, `:314-329`), and the READ tier lets a viewer download lease
attachments (`api/documents/[id]/route.ts:48-55`).

## 5. Custom fields — feature spec

The feature the portfolio model exists to serve.

**Definitions** (`custom_field_definitions`, now portfolio-scoped, unique
`(portfolio_id, entity, key)`):

| Column | Notes |
|---|---|
| `entity` | `property` \| `lease` \| `tenant` |
| `key` | stable JSON key, `^[a-z0-9_]+$`, immutable once created |
| `label` | what the owner types ("Gate code") |
| `type` | `text`, `textarea`, `number`, `date`, `select`, `checkbox`, `email`, `phone` |
| `required` | bool |
| `options` | comma-separated, for `select` |
| `sortOrder` | render order |

**Values** already exist as a `custom_fields` text column (default `'{}'`) on `properties`,
`leases` and `tenants` — **no data migration needed**. Values are validated against the
portfolio's definitions on write and rendered in definition order.

**Where they are managed** (see §7 for the UI rules):

- Property detail → "Custom fields" section, values inline.
- Lease edit page → same section.
- Tenant edit page → same section.
- Owner-only: one "All custom fields" overview in Settings, grouped by entity.

**Behaviours to decide at implementation time (flagged, not decided here):**

- Deleting a definition leaves orphaned values in the JSON blob (hidden, recoverable) rather than
  stripping them — re-adding the same key restores prior data. Preferable to silent data loss.
- `required` blocks the owning form's save; it does not block unrelated edits.
- Renaming a definition changes `label`, never `key`.

## 6. Migration plan

> Repo convention: hand-rolled idempotent `_migrate_*.mjs` run with `node`. The `drizzle/` meta is
> stale (14 tables exist only as raw SQL), so **`drizzle-kit generate` must not be used** — it would
> re-emit DDL for tables that already exist.

### Phase 0 — additive, dark (`_migrate_portfolios.mjs`)

```sql
-- 1. one portfolio per landlord (a landlord with no property still gets one)
INSERT INTO portfolios (name, owner_user_id, created_at)
SELECT COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)), u.id, u.created_at
FROM users u
WHERE u.role = 'landlord'
  AND NOT EXISTS (SELECT 1 FROM portfolios p WHERE p.owner_user_id = u.id);

-- 2. owner membership rows (idempotent)
INSERT INTO portfolio_members (portfolio_id, user_id, role, created_at)
SELECT p.id, p.owner_user_id, 'owner', p.created_at FROM portfolios p
ON CONFLICT (portfolio_id, user_id) DO NOTHING;

-- 3. properties → portfolio
UPDATE properties pr SET portfolio_id = p.id
FROM portfolios p WHERE p.owner_user_id = pr.user_id AND pr.portfolio_id IS NULL;
ALTER TABLE properties ALTER COLUMN portfolio_id SET NOT NULL;

-- 4. collaborators → memberships. A user collaborating on several properties in
--    the same portfolio keeps the STRONGEST role (co_owner beats viewer).
INSERT INTO portfolio_members (portfolio_id, user_id, role, added_by, created_at)
SELECT pr.portfolio_id, pc.user_id,
       (CASE WHEN bool_or(pc.role = 'co_owner') THEN 'co_owner' ELSE 'viewer' END)::portfolio_role,
       min(pc.added_by), min(pc.created_at)
FROM property_collaborators pc
JOIN properties pr ON pr.id = pc.property_id
WHERE pr.portfolio_id IS NOT NULL
GROUP BY pr.portfolio_id, pc.user_id
ON CONFLICT (portfolio_id, user_id) DO NOTHING;

-- 5. custom-field definitions → portfolio (currently empty everywhere)
UPDATE custom_field_definitions cfd SET portfolio_id = p.id
FROM portfolios p WHERE p.owner_user_id = cfd.user_id AND cfd.portfolio_id IS NULL;
```

Nothing reads these tables yet. Safe to deploy.

### Phase 1 — flip resolution

1. Rewrite `access.ts` internals (§3.1-3.3). Signatures hold.
2. `plan-usage.ts` → portfolio-scoped count (§3.4). Fixes the co-owner quota bug.
3. `tenants.userId` → `tenants.portfolioId` across the ~14 predicates + actions.
4. **Fix the role-downgrade lockout:** `tenant-invitations.ts:191-198` decides an account is a
   pure tenant by asking "does it own a property?". A co-owner invited by email owns none, so they
   would be demoted to `role: 'tenant'` and bounced out of `/dashboard` by
   `(dashboard)/layout.ts:14`. Change to "is a member of any portfolio".
5. `expense-intelligence.ts:87,158` currently filters `expenses.userId = userId`, so a co-owner's
   expense history is invisible to the owner. Scope to accessible properties instead (same class of
   bug as the quota bug).
6. Reports (`lib/reports.ts:189,230-255`, `api/reports/csv/route.ts:102`) and gamification
   (`lib/gamification.ts:246`) take the new helpers unchanged.

### Phase 2 — custom fields (the user-visible feature)

Definitions CRUD (owner-only) + values UI on property / lease / tenant, per §5 and §7.

### Phase 3 — retire the old model

Drop `property_collaborators`; then drop `properties.user_id`; drop
`custom_field_definitions.user_id` and rebuild the unique key. Resolve payout details and the
lease-end cron to the portfolio owner (D5): `lib/portal-lease.ts:74-81,101-104`,
`(tenant)/portal/page.tsx:228`, `api/cron/lease-end-alerts/route.ts:51`.

## 7. UI specification

Governing rule: **a solo owner with one portfolio must never see the word "Portfolio."**

1. **Provisioning is invisible.** One portfolio is created on signup / first property, named after
   the user, editable later. No onboarding step, no empty state.
2. **The switcher appears only at > 1 portfolio**, in the nav where the brand already sits
   (`src/components/dashboard/dashboard-nav.tsx`). Shows name, the user's role badge, and property
   count; "Create portfolio" sits at the bottom of the list.
3. **Custom fields live on the pages owners already visit** — property detail, lease edit, tenant
   edit. No new navigation for the common case; a Settings overview exists for the owner who wants
   to manage definitions in one place.
4. **Owner-only affordances, not owner-only pages.** A co-owner sees the same section with values
   editable and the add/delete buttons absent. Opening the manager as a co-owner yields a read-only
   list — never a disabled form that looks broken.
5. **Role copy stays in today's plain language**, extended one level:
   `Owner — full control` · `Co-owner — can manage` · `Viewer — read-only`
   (matches `co-owners-card.tsx:38-41`).
6. **Members management lives in Settings**, which is already landlord-only and already holds
   payout details. Invite by email reuses the existing pattern from `addCoOwnerAction`
   (`properties/actions.ts:157-213`) — including its known limit that the invitee must already have
   an account; an email-first invite can later reuse `src/lib/tenant-invitations.ts`.
7. **The tenant portal is untouched.** Tenants never see portfolios.

### 7.1 Copy changes implied by the flip

| Today | After |
|---|---|
| `"Co-owned"` / `"Viewer"` badge per property (`properties/page.tsx:121`) | one portfolio badge in the switcher |
| `"Co-owner's tenant"`, co-owned tenants read-only (`tenants/page.tsx:33-34,153`) | just a tenant; all members may edit |
| `"Owned by you"` vs `"Shared with you"` framing | `"Owner"` / `"Co-owner"` / `"Viewer"` in one place |
| "Add co-owner" per property (`co-owners-card.tsx`) | "Members" once, in Settings |

## 8. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Co-owner visibility widens** — a co-owner of Property A now sees Property B in the same portfolio. | High (product) | Accepted by D1, but must be a deliberate choice per portfolio: the invite screen states "will see all N properties in <name>". Consider a per-property `viewer` seat later if owners ask. |
| R2 | **Data loss via cascade** — `properties.user_id` is `NOT NULL ON DELETE CASCADE` (`schema.ts:124-126`) today. | Critical | `portfolio_id` uses `ON DELETE RESTRICT`; `portfolios.owner_user_id` uses `RESTRICT`; last-owner removal is blocked in the app layer. Phase 3 drops `user_id` only after the portfolio path is proven. |
| R3 | **Payout has no portfolio equivalent** — tenants see the landlord's GCash/bank details. | Medium | D5: resolve via portfolio owner. If two owners both collect, add a portfolio payout record later; the tenant pages already read through `loadPayableLease`. |
| R4 | **Invite demotes co-owners to tenant role** (`tenant-invitations.ts:191-198`) → locked out of `/dashboard`. | High | Fixed in Phase 1 step 4, same commit as the flip. Must not ship after the flip. |
| R5 | **Quota bug persists or migrates badly** (`plan-usage.ts:31`, `properties/actions.ts:280`). | Medium | §3.4 rule; assert in the verification suite. |
| R6 | **Stale drizzle meta** → `drizzle-kit generate` re-emits existing DDL. | Medium | Keep the hand-rolled `_migrate_*.mjs` convention; do not run `generate` until the baseline is reconciled. |
| R7 | **Backfill grants a collaborator the wrong role** when they differ across properties. | Low | §6 step 4 takes the strongest role; print a summary row per portfolio and eyeball it before Phase 1. |
| R8 | **Member who owns nothing** becomes unreachable (no properties ⇒ nothing to click into). | Low | Phase 2's Settings members page is portfolio-scoped, so it renders regardless of property count. |

## 9. Verification plan

1. **Access parity golden test** — before the Phase 1 flip, snapshot
   `accessiblePropertyIds` / `manageablePropertyIds` / `canManage*` for every fixture account; after
   the flip, assert identical results. This is the single strongest regression signal and should be
   a committed script (`_check_access_parity.mts`), not a one-off.
2. **DB assertions** — every property has a non-null `portfolio_id`; every portfolio has ≥1
   `owner` membership; `owner_user_id` agrees with that membership; no orphan memberships.
3. **Role matrix walkthrough** — one portfolio, three members (owner / co_owner / viewer), asserting
   in the UI that a co-owner can fill a custom-field value but cannot add a definition, and a
   viewer can do neither.
4. **Quota check** — a co-owner adding a unit is gated by the owner's plan, and the unit counts
   toward that owner's usage.
5. Existing bar: `npx tsc --noEmit` clean, eslint at baseline (0 errors, 2 pre-existing warnings),
   `npm run build` passing.

## 10. Open questions

1. **Default portfolio name** — the user's name vs. "My portfolio". Suggest the user's name, since
   it shows in the switcher.
2. **Should a user ever delete a portfolio** (vs. rename only)? A delete flow needs a confirm and an
   empty-portfolio precondition, given R2.
3. **Portfolio-level notifications** are still unbuilt (`notifications` has zero call sites). Out of
   scope here; worth deciding before Phase 2 so the custom-fields UI knows whether to announce
   "Alice added a field" anywhere.
4. **Seat limits** — none today; whether Free/Pro/Business cap portfolio members is a pricing
   question, not a data one. Free at 1 member would push co-ownership to paid, which may be the
   intent.

## Appendix — files touched per phase

| Phase | Files |
|---|---|
| 0 | `_migrate_portfolios.mjs` (new), `src/db/schema.ts` (additive) |
| 1 | `src/lib/access.ts` (rewrite internals) · `src/lib/plan-usage.ts` · `src/lib/tenant-invitations.ts:191-198` · `src/lib/expense-intelligence.ts:87,158` · `src/app/(dashboard)/tenants/actions.ts` · `src/app/(dashboard)/tenants/page.tsx` · `src/app/(dashboard)/tenants/[id]/edit/page.tsx` · `src/app/(dashboard)/leases/new/page.tsx` · `src/app/(dashboard)/leases/[id]/edit/page.tsx` · `src/app/(dashboard)/leases/actions.ts:266` · `src/app/(dashboard)/maintenance/page.tsx:125` · `src/app/(dashboard)/maintenance/actions.ts:42` · `src/app/(dashboard)/properties/actions.ts:79-99,280-283` · `src/db/schema.ts` (`tenants.portfolioId`) |
| 2 | `src/lib/custom-fields.ts` (new) · `src/app/(dashboard)/settings/*` · `src/app/(dashboard)/properties/[id]/page.tsx` + new component · `src/app/(dashboard)/leases/[id]/edit/page.tsx` + new component · `src/app/(dashboard)/tenants/[id]/edit/page.tsx` + new component · `src/lib/validations.ts` (`customFieldDefinitionSchema`, already drafted) |
| 3 | drop `property_collaborators`, `properties.user_id`, `custom_field_definitions.user_id` · `src/lib/portal-lease.ts:74-104` · `src/app/(tenant)/portal/page.tsx:228` · `src/app/api/cron/lease-end-alerts/route.ts:51` · `src/components/properties/co-owners-card.tsx` (delete) · `src/db/schema.ts:721-729` (dead consts) |