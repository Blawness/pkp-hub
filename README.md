# PKP Hub

Internal management dashboard for a land/building survey studio: manage
clients, survey projects, measurement maps, a document archive, light
finances, plus a read-only portal for clients to check their own project
status and shared documents.

See `PRD.md` for the full product spec (features, data model, server
actions, environment variables) and `tasks.md` for the phase-by-phase build
log.

## Stack

- **Next.js** (App Router, Server Components by default) + TypeScript strict
- **Tailwind CSS** + shadcn/ui
- **Drizzle ORM** on PostgreSQL — local Postgres (or Neon) in dev, **Neon**
  in production
- **Better Auth** — three roles: `owner`, `surveyor`, `client`
- **Zod** + React Hook Form, **next-safe-action** for server actions
- **`@t3-oss/env-nextjs`** for validated environment variables
- **Leaflet** + react-leaflet (OpenStreetMap + free satellite imagery) with
  **turf.js** for area calculations; survey geometry stored as GeoJSON in a
  `jsonb` column
- **Cloudflare R2** (S3-compatible) for document storage, with a local-disk
  fallback driver for development
- **papaparse** for CSV coordinate import
- **Biome** for lint/format, **Vitest** for tests
- Deployed on **Vercel**

## Local development

```bash
pnpm install

cp .env.example .env.local
# then fill in .env.local:
#   DATABASE_URL         — a local/dev Postgres, or a Neon dev branch
#   BETTER_AUTH_SECRET    — generate with: openssl rand -base64 32
#   BETTER_AUTH_URL        — http://localhost:3000
#   NEXT_PUBLIC_APP_URL    — http://localhost:3000
#   R2_* / RESEND_API_KEY  — optional in dev; omit and the app falls back to
#                            a local-disk storage driver and logs invite
#                            links to the console instead of emailing them

pnpm db:migrate   # apply migrations to DATABASE_URL
pnpm db:seed      # seed demo owner/surveyor/client accounts + sample data

pnpm dev          # http://localhost:3000
```

## Tests

```bash
pnpm test         # vitest, run once
```

Also useful during development: `pnpm lint` (Biome), `pnpm typecheck` (`tsc
--noEmit`), `pnpm build` (production build — also validates required env
vars via `env.ts`).

## Deploying

Not part of local dev — see [`DEPLOY.md`](./DEPLOY.md) for the exact Vercel
setup, the full production environment variable list, running migrations
against the production database, and the per-role smoke-test checklist to
run after every deploy.

For product requirements and the data model, see [`PRD.md`](./PRD.md).
