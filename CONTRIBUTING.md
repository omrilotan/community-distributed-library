# Contributing

Thank you for wanting to help. This project lets neighbours lend each other what they already own,
and every library runs the same code, so a fix here reaches every street that runs one.

Everything in this repository is in the public domain under [the Unlicense](LICENSE). By sending a
change, you agree that it is released the same way.

## Before you start

- **Small fixes** (a typo, a wrong word, a clear bug): send a pull request straight away.
- **Anything bigger** (a new feature, a change to how lending works, a new dependency): open an issue
  first and say what you have in mind. A library is a small community's shared space, and some ideas
  are left out on purpose: there are no ratings, no reviews and no stars, for items or for people.
- **A security problem:** please do not open a public issue.
  [Report it privately](https://github.com/omrilotan/community-distributed-library/security/advisories/new)
  instead; [SECURITY.md](SECURITY.md) says what helps.

## Run it

You need the Node version in `.nvmrc`. Then:

```sh
npm install
npm run dev        # migrations, then API :8787, MCP :8788, web :3000
npm run db:seed    # in a second terminal, once: one library and two members
```

Open <http://localhost:3000/login> and sign in as `dana@example.com` (admin, English) or
`sam@example.com` (member, Hebrew). Locally the form goes straight to the sign-in link instead of
sending an email. [README.md](README.md) maps the repository and lists the other commands.

## Make the change

The code follows a few habits. Please keep to them; CI checks most of them.

| Habit                     | What it means                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prettier is the style** | Run `npm run format`. CI fails on any difference.                                                                                                                                |
| **Types hold**            | Run `npm run typecheck`. Unused imports and locals are errors.                                                                                                                   |
| **Both languages**        | Every word a member reads is in `apps/web/lib/i18n.ts`, in English and Hebrew. A library of things uses its own words from `apps/web/lib/i18n-things.ts`.                        |
| **Direction-free CSS**    | Logical properties only (`margin-inline-start`, not `margin-left`), so Hebrew and English share one layout. See [frontend conventions](packages/design/frontend-conventions.md). |
| **Works without scripts** | Filters are links and actions are forms. Scripts only make things quicker; nothing needs one.                                                                                    |
| **Core decides**          | `services/core` is the system of record and its `/v1` API the only way in. The web app and the MCP server call it; the shapes live in `packages/contracts`.                      |
| **Migrations only add**   | A database change is a new file in `services/core/migrations`. Never edit one that has shipped.                                                                                  |
| **Few dependencies**      | Add one only when it saves real work, and say why in the pull request.                                                                                                           |
| **Comments say why**      | In plain words, for the next person. What the code does, the code already says.                                                                                                  |

The design principles, colours and words are in [packages/design/README.md](packages/design/README.md).

## Test it

```sh
npm test                       # vitest everywhere; core runs in workerd against a migrated D1
npm run test:e2e -w @cdl/web   # Playwright: phone, desktop and things, axe in both languages
npm run library:things         # after the browser tests, if you were working on things
```

A fix comes with a test that fails without it, in the existing test file for that module. A change
to what a page shows comes with a look at it in both languages, on a phone and on a wide screen.

## Commit it

One change per commit. The message is one plain sentence that says what changed, as a member or an
operator would notice it, with no prefix:

```
Count down three seconds on Borrow before the request goes, so a second press takes it back
Refuse webhooks aimed at this machine, a private network or a reserved range
```

The log is the changelog, so a reader should understand each line without opening the code. A body
below the sentence is welcome when the reason is not obvious.

## Send it

Open a pull request against `main`. Say what it changes and why, and add screenshots for anything
on screen. CI must be green. Somebody will read it, and may ask for changes, usually about words:
they are the part members see.

## Run your own library

That is not contributing, but it is the point. Follow [docs/self-hosting.md](docs/self-hosting.md),
or open this folder in Claude Code and type `/open-a-library`.
