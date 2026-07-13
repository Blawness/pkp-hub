# Deploy — PKP Hub

This document is the exact procedure for taking PKP Hub from "reviewed and merged
to `master`" to a live production deployment on Vercel, backed by Neon Postgres
and Cloudflare R2. It also has the smoke-test checklist to run immediately
after every production deploy.

No part of this was executed as part of Phase 9 — there is no Vercel project
and no git remote configured in the build environment. A human with Vercel
and Cloudflare access runs these steps.

## 1. Prerequisites

- A Vercel account/team with access to create a project.
- A Neon project (the dev branch already exists; create a **separate**
  production branch/database — do not point production at the dev branch).
- A Cloudflare account with R2 enabled (required — see §4 below).
- A Resend account + verified sending domain, if client-portal invite emails
  are needed at launch.
- This repo pushed to a git remote (GitHub/GitLab/Bitbucket) Vercel can import.

## 2. Create the Vercel project

1. Push `master` to a git remote.
2. In the Vercel dashboard: **Add New → Project → Import Git Repository**,
   select this repo.
3. Framework preset: Next.js (auto-detected). Build command / output: leave
   at Vercel defaults (`next build`). No `vercel.json` is required — this is
   a standard Next.js App Router project and Vercel's zero-config Next.js
   build handles it. (We deliberately did not add function region pinning:
   Vercel Functions default to `iad1`, and the added latency to Neon's
   `ap-southeast-1` region is a few tens of ms — not worth the operational
   complexity of pinning a non-default region for a low-traffic internal
   tool. Revisit if p95 latency becomes a problem.)
4. Do **not** deploy yet — set environment variables first (§3).

## 3. Environment variables (Production environment, in Vercel Project Settings → Environment Variables)

All of these come from `env.ts` / PRD §8. Set every one of them for the
**Production** environment before the first deploy; set the same set again for
**Preview** if you want preview deployments to have a working DB/auth (R2 is
optional for Preview — see §4).

| Variable | Required | Where it comes from |
|---|---|---|
| `DATABASE_URL` | yes | Neon dashboard → your **production** project/branch → Connection Details → "Pooled connection" string. Must be a different database than dev. |
| `BETTER_AUTH_SECRET` | yes | Generate locally: `openssl rand -base64 32`. A fresh secret for production — never reuse the dev value. |
| `BETTER_AUTH_URL` | yes | The production URL of the app, e.g. `https://pkp-hub.example.com` (or the `*.vercel.app` URL if no custom domain yet). Must match where the app is actually served or auth cookies/redirects break. |
| `NEXT_PUBLIC_APP_URL` | yes | Same value as `BETTER_AUTH_URL`. |
| `R2_ACCOUNT_ID` | required for prod (optional to boot) | Cloudflare dashboard → R2 → Overview, right sidebar "Account ID". |
| `R2_ACCESS_KEY_ID` | required for prod | Cloudflare dashboard → R2 → Manage R2 API Tokens → create a token with Object Read & Write on the bucket below. |
| `R2_SECRET_ACCESS_KEY` | required for prod | Shown once when you create the R2 API token above — copy it immediately. |
| `R2_BUCKET` | required for prod | The bucket name you create in R2 → Create bucket for PKP Hub documents. |
| `R2_PUBLIC_URL` | required for prod | Either the bucket's public R2.dev URL, or (recommended) a custom domain connected to the bucket via R2 → bucket → Settings → Custom Domains. |
| `RESEND_API_KEY` | required only if client-portal invite emails are used | Resend dashboard → API Keys → create a key. Needs a verified sending domain in Resend for real delivery. |

Notes:
- `env.ts` (via `@t3-oss/env-nextjs`) validates all of these at build time.
  The four non-R2/non-Resend vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`) are the **minimal set required to
  boot** — the build fails immediately if any is missing or malformed.
- R2 and Resend vars are `.optional()` in `env.ts` so a preview deploy without
  them still builds and boots. **Production must have all five R2 vars set**
  — see the storage warning below.
- Never commit real values for any of the above. `.env.local` is gitignored;
  keep it that way.

## 4. Storage driver — R2 is required in production

`lib/storage/index.ts` picks a driver at module load: it uses the R2 driver
only when **all five** `R2_*` vars are present; otherwise it silently falls
back to the local-disk driver (`.storage/` at the repo root), which is what
makes local dev work without any credentials.

**On Vercel serverless, `.storage/` is ephemeral** — each invocation may run
on a different instance, and the local filesystem is not persisted or shared
between them. If the local driver is ever selected in production, uploaded
documents will appear to save successfully and then vanish (a 404 on
download, or worse, silently serve someone else's file after a cold start
reuses the path). This is the single biggest deploy risk called out in the
final review.

To prevent silent data loss, the driver now logs a loud warning to stdout at
boot if it selects `local` while `NODE_ENV === "production"`:

```
[storage] using "local" driver

!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!! [storage] WARNING: local disk driver selected in production.   !!
!! `.storage/` is EPHEMERAL on Vercel — uploaded files WILL BE     !!
!! LOST. Configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,                !!
!! R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_URL to enable    !!
!! the R2 driver before relying on document uploads. See          !!
!! DEPLOY.md for setup steps.                                     !!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

It does **not** crash the build or the app — a preview deploy without R2
configured yet must still boot for everything except document upload. But
**before real production use**, check the Vercel Function logs after the
first request and confirm this warning is absent. If it appears, one or more
of the five `R2_*` env vars is missing or empty in that environment.

### 4a. CORS on the bucket — required, and easy to miss

Correct credentials are **not enough**. The file bytes never pass through the
server: `app/api/documents/upload-init/route.ts` hands the browser a presigned
PUT URL, and `components/documents/document-upload.tsx` `fetch()`es that URL
directly. That is a cross-origin request from the app's domain to
`*.r2.cloudflarestorage.com`, so **R2 must allow it or every upload fails** —
with a CORS error in the browser console and nothing at all in the server logs.

The failure looks like broken credentials but is not, so configure this at the
same time as the token. In Cloudflare → R2 → your bucket → **Settings → CORS
Policy**, add:

```json
[
  {
    "AllowedOrigins": ["https://pkp-hub.vercel.app"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

`AllowedOrigins` must list every origin the app is served from — add the custom
domain when one is connected, and a preview origin only if you intend to test
uploads from preview deploys. `Content-Type` must be allowed because the client
sends it with the PUT, and it is part of what the URL is signed over.

## 5. Run database migrations against production

Migrations live in `drizzle/` and are applied with drizzle-kit. Do this
**once**, after setting `DATABASE_URL` for production and **before** the
first real deploy serves traffic (or immediately after, before anyone signs
in):

```bash
# From your local machine, NOT committed anywhere — export the prod URL
# for this one shell session only, then run the existing script:
DATABASE_URL="<paste the Neon production connection string>" \
  node node_modules/drizzle-kit/bin.cjs migrate

# Equivalent to `pnpm db:migrate`, which instead reads .env.local — do NOT
# put the production DATABASE_URL in .env.local; pass it inline as above so
# it's never at risk of being committed.
```

Verify it worked: `node node_modules/drizzle-kit/bin.cjs studio` against the
same `DATABASE_URL` (or Neon's SQL editor) and confirm the expected tables
exist (`user`, `session`, `clients`, `projects`, `documents`, etc).

Do **not** run `pnpm db:seed` against production — the seed script creates
demo owner/surveyor/client accounts with known credentials, meant for local
dev only. Create the first real owner account directly (see §6).

## 6. First deploy

1. Trigger the deploy (push to the branch Vercel is tracking, or click Deploy
   in the dashboard).
2. Watch the build logs. Confirm `next build` completes with no errors and
   `env.ts` validation passes (a missing required var fails the build with a
   clear Zod error naming the var).
3. Once live, create the first owner account. `lib/auth.ts` sets
   `disableSignUp: true` — there is **no public self-signup endpoint at all**,
   by design (accounts are only ever created by an owner via the client-invite
   flow, or by the seed script, neither of which apply to the very first
   account). To bootstrap the first owner in production:
   - Insert a row into the `user` table directly (Neon SQL editor) with
     `role = 'owner'` and a real email.
   - Use Better Auth's server-side API to set a password for that user (e.g.
     a one-off script calling `auth.api.setPassword` / the password-reset
     flow — do not try to hand-craft the `account` password hash), or trigger
     `sendResetPassword` for that user and use the resulting `/set-password`
     link. This only has to be done once.

## 7. Post-deploy smoke test (per role)

Run this after every production deploy, and definitely after the first one.
Use three separate accounts (or incognito windows) — one per role. This
directly exercises the row-level tenant scoping that is the app's primary
security boundary (`lib/auth-guards.ts`).

### Setup
- Create (or have seeded/migrated) at least: 2 clients, 2 projects each
  assigned to a different client, one project assigned to a specific
  surveyor, and on one project: one document with `sharedWithClient = true`
  and one with `sharedWithClient = false`.

### Owner
- [ ] Log in as owner. Land on `/dashboard`.
- [ ] `/dashboard/clients` lists **both** clients.
- [ ] `/dashboard/projects` lists **all** projects regardless of assigned
      surveyor or client.
- [ ] Open a project not assigned to any particular surveyor — full access
      (edit, documents tab shows both shared and unshared documents).
- [ ] Visiting `/portal` redirects to `/dashboard` (owner is not a client).

### Surveyor
- [ ] Log in as surveyor. Land on `/dashboard`.
- [ ] `/dashboard/projects` shows **only** projects where
      `assignedSurveyorId` is this surveyor — the other client's/other
      surveyor's projects must not appear in the list or be reachable by
      direct URL (expect a 403/redirect, not the data).
- [ ] Attempting to open a project assigned to a different surveyor by
      guessing its URL fails (does not leak project data).
- [ ] Visiting `/portal` redirects to `/dashboard`.

### Client
- [ ] Log in as the client account linked to client A. Land on `/portal`.
- [ ] `/portal/projects` (or the equivalent listing) shows **only** projects
      where `clientId` matches client A — client B's projects are invisible
      and unreachable by direct URL.
- [ ] Open a client-A project: the documents section shows **only**
      documents with `sharedWithClient = true`. The unshared document from
      setup must **not** appear, not even its filename.
- [ ] Attempting to browse to `/dashboard/...` redirects to `/portal`
      (clients never reach the staff area).
- [ ] Attempting to open client B's project by guessing its URL fails (does
      not leak project data).

### Storage
- [ ] Check the Vercel Function logs for the storage boot warning (§4) — it
      must be **absent**. If present, uploads are silently going to ephemeral
      disk; fix the R2 env vars before trusting any uploaded document.
- [ ] Upload a document as owner/surveyor, then reload the page (ideally
      after the deployment has scaled to a fresh instance, e.g. wait a few
      minutes) and confirm the file still downloads successfully — this is
      the concrete check that R2 (not local disk) actually served it.

If every box above is checked, the deploy is verified end to end.
