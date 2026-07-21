# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

PKP Hub — internal management dashboard for a land/building survey studio:
clients, survey projects, GeoJSON measurement maps, a document archive, light
finances (payment ledger + receipts), equipment inventory, project phases, plus
a read-only client portal. `PRD.md` has the full product spec and data model;
`DEPLOY.md` covers the Vercel/production setup. Most code comments and specs are
in Indonesian.

## Commands

```bash
pnpm dev                 # dev server on :3000
pnpm build               # production build (also validates env via env.ts)
pnpm lint                # biome check .        (lint:fix to autofix)
pnpm typecheck           # tsc --noEmit
pnpm test                # vitest, run once (see single-test note below)
pnpm e2e                 # playwright (needs dev server + real dev DB)

pnpm db:generate         # generate a migration from schema.ts changes
pnpm db:migrate          # apply migrations to the dev DB (.env.local)
pnpm db:migrate:prod     # apply migrations to prod (.env.prod) — deploy only
pnpm db:seed             # seed demo data — NON-destructive: skips if already seeded
pnpm db:seed:reset       # wipe all tables and re-seed from scratch
pnpm db:studio           # drizzle studio
```

Run a single vitest file / test:

```bash
node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/projects.test.ts
node --env-file=.env.local node_modules/vitest/vitest.mjs run -t "name of test"
```

- **Tests hit a real Neon dev branch**, not a mock. `.env.local` and all tests
  use the dev branch; **never seed or test against prod** (`.env.prod`). Some
  test files wipe whole tables in `beforeAll`, so vitest runs with
  `fileParallelism: false` — keep test data setup self-contained per file.
- `next dev` must be running for `pnpm e2e`; it reuses an existing :3000 server
  and runs serially (`workers: 1`) against the same dev DB.

## Architecture

**The auth/security boundary is server-side, not the proxy.** `proxy.ts` (Next
16's renamed middleware) is a *coarse, cookie-only* gate that redirects
unauthenticated or wrong-area requests fast — it never touches the DB and is not
a security boundary. The real enforcement lives in **`lib/auth-guards.ts`**:
every RSC, route handler, and server action that touches project/client data
must go through `requireUser` / `requireRole` / `assertProjectAccess` /
`listProjectsForUser`. These do a real DB session lookup (`disableCookieCache`),
treat archived users as logged-out, and apply row-level scoping. Never query
`projects`/`clients` directly from a route to bypass them.

**Roles:** `admin`, `surveyor`, `client` (note: PRD/README say "owner" but the
code and DB enum use `admin`). `admin` = full access; `surveyor` = only projects
they're assigned to (directly or via a phase); `client` = only their own
projects, read-only, via the `/portal` area. Staff use `/dashboard`.

**Server actions follow a strict 3-file split per domain** in `lib/actions/`:
- `*-schemas.ts` — Zod input schemas.
- `*-logic.ts` — pure business logic + role/scoping checks; **directly unit
  tested** in `*.test.ts`. Put testable behavior here.
- `*.ts` (`"use server"`) — thin next-safe-action wrappers that call the logic
  and `revalidatePath`.

All actions build on the shared clients in **`lib/actions/safe-action.ts`**:
`authActionClient`, `staffActionClient`, `adminActionClient`. Never construct a
bare `createSafeActionClient()` elsewhere — that bypasses the auth middleware.

**RBAC lives in `lib/rbac/`, one file per resource.** A grant is a pair —
`(permission, scope)` — stored in `role_permission`; roles are DB rows
(`role`, `user_role_assignment`), and a user's effective permissions are the
union of their roles with the widest scope winning (`all > assigned > own`).
The permission catalog itself is code: each `lib/rbac/resources/<x>.ts`
declares `actions`, `scopes` (Drizzle SQL predicates), and optionally
`guards` / `fields`. **Adding a feature = adding one file there** — the
`Permission` union grows automatically, so typos fail at compile time.

Four functions are the whole public API: `can()` (action-level),
`rbacFilter()` (list — always returns `SQL`, `false` when unauthorized, so a
forgotten check yields an empty set rather than a leak), `requireScopedRow()`
(single row — re-queries with *the same* filter, which is what keeps the
list and the guard from ever drifting apart), and `redact()` (field-level).
`getRbacContext()` loads effective permissions once per request via React
`cache()` — never from the session cookie, for the same reason
`auth-guards.ts` sets `disableCookieCache`.

As of sub-project 1 the engine runs *alongside* the old `requireRole` /
`adminActionClient` checks and is not yet wired into any call site; the three
system roles are seeded to behave identically to the old hardcoded checks,
proven by `lib/rbac/parity.test.ts`.

**Derived state is never stored — it's computed from source rows.** Recurring
lesson across the codebase: `paymentStatus`, phase progress %, equipment
in-use/available, and usage duration are all derived (`lib/payments/derive.ts`,
`lib/phases/derive.ts`, `lib/equipment/derive.ts`) rather than kept as editable
columns that can drift out of sync. Follow this pattern for new features.

**Data model invariants** (see comments in `lib/db/schema.ts`):
- Users, clients, and equipment are **soft-deleted** (`archivedAt`), never hard
  DELETEd — FKs point at them and history must survive.
- The `payment` ledger is **append-only**: correct a row by voiding
  (`voidedAt`) and re-recording, so receipt numbers already in clients' hands
  never silently change meaning. Calendar dates use `date` mode `"string"`
  (`YYYY-MM-DD`) to avoid timezone off-by-one on receipt-year derivation.
- One `equipment` row = one physical unit. Concurrent double-checkout is
  prevented by a **partial unique index** (`equipment_active_usage_uniq` where
  `ended_at is null`), not just a code check.

**Storage** (`lib/storage/`): pluggable driver. Uses Cloudflare R2 only when all
four `R2_*` vars are set; otherwise falls back to a local-disk driver (`.storage/`)
for dev. The R2 bucket is **private** — always hand the browser a signed URL via
`downloadUrlFor(fileUrl)`, never a raw `documents.fileUrl`. `downloadUrlFor` is
not an access check; callers must pre-filter rows by access rights (that's
`documents-logic.ts`'s job).

**Other pieces:** Better Auth (`lib/auth.ts`) is wired to the existing Drizzle
tables — don't let its CLI generate new ones; public sign-up is disabled
(accounts created only via admin invite / seed). Survey geometry is stored as
GeoJSON in a `jsonb` column (no PostGIS); area via turf.js; CSV coordinate
import + reprojection in `lib/geo/`. UI is Tailwind v4 + shadcn/ui in
`components/ui/` (excluded from Biome and lint); domain components grouped by
feature under `components/`.
