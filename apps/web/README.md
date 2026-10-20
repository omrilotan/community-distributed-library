# @cdl/web

The library web app: what members see at a library's address. Next.js App
Router on Vite through [vinext](https://github.com/cloudflare/vinext), deployed as one Cloudflare
Worker per library. It holds no data: every page and action calls core's `/v1` API over the `CORE`
service binding.

## Run

From the repository root, `npm run dev` starts the API, MCP and this app together (web on :3000).
`npm run dev:web` runs this app alone against an API already on :8787.

Do not deploy from here. `npm run deploy -- <library|all> web` at the root builds the app per library
(`CLOUDFLARE_ENV=<env> vinext build`) and deploys it with that library's bindings.

## Map

```
app/                 routes (server components by default)
app/api/             form targets: call core, then redirect; v1/[...path] is the bearer-only API proxy
app/admin/           moderation and library settings
app/*.tsx            small client components: filters, pickers, menus, guards
lib/i18n.ts          every string, English and Hebrew
lib/i18n-things.ts   the words a library of things uses instead
lib/                 session, core client, library settings, maps, images, helpers
middleware.ts        CSP nonce, Origin check on POST, noindex, remembered filters
public/              icons, service worker (push only), setup screenshots
e2e/                 Playwright: phone, desktop and things projects; axe in both languages
```

## Rules of the house

- **Works without JavaScript.** Filters are links and actions are `<form method="post">`. Scripts
  only make them quicker. The cover and photo pickers are the exceptions.
- **Server first.** Client components are leaves. A constant a server component needs goes in `lib/`,
  not in a `"use client"` file.
- **Logical CSS only.** `margin-inline-start`, not `margin-left`; never `[dir="rtl"]`. User text goes
  in `<bdi>` or `dir="auto"`. See `packages/design/frontend-conventions.md`.
- **Tokens, not colours.** Every colour, radius and the font come from
  `packages/design/tokens.css`. Principles are in `packages/design/README.md`.
- **Words.** Every string is in `lib/i18n.ts` in both languages; functions go in `helpers()`, not the
  dictionary. A things library overrides wording in `lib/i18n-things.ts`.
- **Traits, not types.** Ask `traits(type).sets`, not `type === "things"`.
- **Required fields** carry `required`; the label gets its asterisk from CSS.

## Test

```sh
npm test                       # vitest for lib/
npm run test:e2e               # Playwright; starts the stack if it is not running
npx playwright test e2e/loans.spec.ts --project=phone
```

The `setup` project signs Sam in once. The `things` project runs last and switches the local library
to things; run `npm run library:things` or `library:books` at the root afterwards to choose.
