# Community Distributed Library

Neighbours lend each other what they already own. There is no building and no central stock: each
item stays on its owner's shelf until someone asks for it. CDL provides the shared part, which is a
catalogue, requests, handoff times picked from both people's week, a record of who holds what, and
reminders.

One codebase runs any number of libraries. Each library is its own deployment on Cloudflare, with its
own members, data and address. A library lends either **books** or **things**
(`packages/contracts/src/library-types.ts`). Libraries are invite-only and closed to search engines.

**To run your own library, follow [docs/self-hosting.md](docs/self-hosting.md),** or open this folder
in Claude Code and type `/open-a-library`. You need a domain on Cloudflare, a Cloudflare API token and
a Resend API key; one command does the rest.

Released into the public domain under [the Unlicense](LICENSE).

## Layout

npm workspaces. Each service is its own Cloudflare Worker with its own storage, and services talk
over service bindings.

```
apps/web/             the library web app: Next.js App Router on vinext, a PWA, one Worker per library
apps/landing/         the front page at the bare domain (static)
services/core/        system of record and the public /v1 API (Hono, D1)
services/mcp/         OAuth 2.1 server and MCP tools for AI assistants, calling core's /v1
services/notify/      email through Resend, Web Push (RFC 8291/8292); no storage
services/convo/       loan message threads, own D1, deleted 90 days after a loan closes
services/metadata/    ISBN lookup (Open Library, then Google Books) and its cache; shared
services/reports/     where browsers report CSP violations and network errors; shared
packages/contracts/   Zod schemas, the OpenAPI document, library types
packages/design/      design tokens, logo, principles, frontend conventions
scripts/              list of libraries, deploy, checks, local dev, pulling a database down
```

Naming: shared things say `cdl` (`@cdl/*`, `cdl-metadata`, `cdl-reports`, `cdl-landing`); a
library's own Workers and stores are `<slug>-<service>`, for example `our-street-core`.

## Run locally

Node version is in `.nvmrc`.

```sh
npm install
npm run dev        # applies migrations, then API :8787, MCP :8788, web :3000
npm run db:seed    # in a second terminal, once: one library and two members
```

Open <http://localhost:3000/login> and sign in as `dana@example.com` (admin, English) or
`sam@example.com` (member, Hebrew). Locally the API runs with `DEV_AUTH`, so the form goes straight to
the sign-in link instead of emailing it. Scripts can also send `X-Member-Id: <member id>`.

| Command                                                 | Does                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run db:seed:things`                                | Switches the local library to things and lists a few                                                          |
| `npm run library:books` / `npm run library:things`      | Switches the local library type                                                                               |
| `npm run db:pull -- core --library <slug>`              | Replaces a local database with a production copy; tokens and sessions are removed (stop the dev server first) |
| `services/core/scripts/role.sh <email> moderator`       | Gives a role locally (`--remote <slug>` for a live library)                                                   |
| `npm run dev:api`, `npm run dev:mcp`, `npm run dev:web` | Runs one side alone                                                                                           |
| `npm run dev` in `apps/landing`                         | The front page on :3001                                                                                       |

The local databases are `cdl-core`, `cdl-convo` and `cdl-metadata`, whichever library you pull.

## Check

```sh
npm run typecheck
npm test               # vitest everywhere; core runs in workerd against a migrated D1
npm run test:e2e -w @cdl/web   # Playwright: phone, desktop and things projects, axe in both languages
npm run format         # Prettier; CI fails on any diff
npm run check:libraries
```

CI (`.github/workflows/ci.yml`) runs types, Prettier, typecheck, the library check and every test on
each push, then the browser tests against a local stack. CI does not deploy. After the browser tests,
`npm run library:things` puts the local library back if you were working on things.

## Deploy

The `wrangler.jsonc` files describe one library for local development, with Workers named `cdl-*`.
The libraries you run are listed in `libraries.json` at the repository root, or in the file
`CDL_LIBRARIES` names: each one's slug, address, sender, push public key, D1 database IDs and OAuth
KV namespace, plus the Cloudflare account and the shared Workers' database and addresses.
`libraries.example.json` shows every field. They are listed in release order: the first one gets
every release first.

A deploy writes one full config per library and Worker next to its template
(`<dir>/wrangler.<slug>.json`, ignored by git) and deploys that file. Credentials come from `.env`
at the repository root (never committed).

```sh
set -a; . ./.env; set +a
npm run deploy -- all web          # one service, every library
npm run deploy -- all core web     # after changing contracts or core
npm run deploy -- our-street       # every service, one library
npm run deploy -- shared           # metadata, reports and the landing page
```

For each library the script checks the manifest, applies remote migrations, then deploys notify,
convo, core, mcp and web in that order, and stops that library at the first failure.

To run wrangler by hand against a library, write its config first:
`npx wrangler d1 execute our-street-core --remote -c "$(node scripts/config.mjs our-street core)" --command "SELECT 1"`.

`npm run check:libraries` refuses a manifest that gives two libraries one Worker, route, database,
bucket, KV namespace or push key, and any library config still carrying a local development value.
`scripts/check-hosts.mjs` makes sure no Worker serves on `workers.dev`.

Secrets per library, on `<slug>-notify`: `RESEND_API_KEY` and `VAPID_PRIVATE_JWK`
(`npx wrangler secret put RESEND_API_KEY -c "$(node scripts/config.mjs <slug> notify)"`). Optional on
`cdl-metadata`: `GOOGLE_BOOKS_KEY`.

## API, MCP and webhooks

Everything the web app does goes through core's `/v1` API, and so can anyone else.

- **REST:** `https://<library host>/api/v1/...` with `Authorization: Bearer <token>`. Personal tokens
  are made on `/connect`. The browser cookie never authorises an API call. The OpenAPI 3.1 document is
  at `/api/v1/openapi.json`, generated from `packages/contracts/src/openapi.ts`; add a route there
  when you add one to core.
- **MCP:** `https://mcp.<library host>/mcp` (local `http://localhost:8788/mcp`). The client registers
  itself, the member approves scopes in the web app, and tools call `/v1` with that token. Scopes:
  `catalogue:read shelf:read shelf:write loans:read loans:write messages:read messages:write
profile:read admin`.
- **Webhooks:** subscribe on `/connect`. Signed `POST`s
  (`x-cdl-signature: t=…,v1=HMAC-SHA256(secret, t.body)`) for `copy.*`, `loan.*` and `handoff.*`,
  retried with backoff, replayable from `/api/v1/events?since=<id>`.

Member tools: `my_profile`, `search_catalogue`, `browse_shelves`, `get_work`, `lookup_isbn`,
`list_tags`, `list_my_shelf`, `add_copy`, `update_copy`, `upload_cover`, `set_cover`,
`set_item_tags`, `request_loan`, `respond_to_request`, `cancel_loan`, `extend_loan`, `nudge`,
`list_my_loans`, `get_loan_messages`, `post_loan_message`, `join_waitlist`, `leave_waitlist`,
`my_waitlist`, `propose_tag`, `my_tag_proposals`, `report_problem`, `invite_neighbour`,
`my_invites`, `set_lend_limit`. Moderators also get `edit_item`, `set_item_cover`,
`upload_item_cover`, `remove_item_cover`, `add_tag`, `edit_tag`, `remove_tag`, `rename_tag_group`.
No tool can confirm a handoff or mark an item handed over or returned: a person has to be there.

## How some things work

- **Notifications.** Push first; the email follows five minutes later only if the member has not
  opened the app (`services/core/src/notify.ts`). Without push, email at once. To rotate a library's
  VAPID keys, set a new pair and clear `push_subscriptions`; every browser subscribes again.
- **Scheduled work.** core: reminders and escalation at 08:00 UTC, webhook and email delivery every
  15 minutes, backup and cover rehosting at 03:20. convo: thread purge at 04:15.
- **Backups.** A SQL snapshot of `<slug>-core` goes to the private `<slug>-backups` bucket nightly,
  kept 30 days; moderators can take one with `POST /v1/admin/backup`. D1 Time Travel covers the same
  30 days.
- **Images.** Covers and photos are re-encoded in the browser (no metadata), stored in
  `<slug>-images` and served at `images.<slug>.…`. External covers are copied in nightly.
- **Location.** A member's area is snapped to a ~300 m cell; maps draw circles, never pins. The
  private meeting place a member writes is shown only to the borrower of an agreed handoff. Map tiles
  are OpenStreetMap through Leaflet.
- **Languages.** English and Hebrew, chosen per library. CSS uses logical properties only, so one
  layout serves both directions (`packages/design/frontend-conventions.md`).

## Status

Built: invite-only sign-in, catalogue with tags and filters, requests, handoffs with codes, relays,
waitlists, wishlists, wanted books, extensions, reminders, reports and moderation, push and email,
API, MCP and webhooks, books and things libraries with sets. Not built: drop points, reputation,
blocks.
