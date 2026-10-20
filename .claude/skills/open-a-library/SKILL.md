---
name: open-a-library
description: Open a new Community Distributed Library on the person's own domain and Cloudflare account, from nothing to a working site where they are the admin. Use when someone wants to run, host, start, set up or deploy their own library, or open another one.
---

# Open a library

You are helping someone open their own neighbourhood library with this repository. Most people doing
this are not developers. Speak plainly, one step at a time, and do the technical work yourself. The
written guide is `docs/self-hosting.md`; follow it, and show its pictures (`docs/images/`) when you
send the person to a website.

The whole job: two keys go into `.env`, `npm run check:setup` passes, `npm run provision` runs once,
and the person signs in.

## Rules

- **Never ask for a key in the chat, and never print one.** Keys typed into a conversation are kept
  in its history. The person pastes each key into `.env` themselves. Do not `cat` `.env`, echo
  variables, or run anything that shows a key's value. To test the keys, run `npm run check:setup`;
  it never prints them.
- Run commands from the repository's root. Each command runs in a fresh shell, so load the keys in
  the same command that needs them: `set -a; . ./.env; set +a; npm run …`.
- Do not create accounts, accept terms, buy plans or enter payment details for the person. Tell them
  what to do and wait.
- `npm run provision` makes real resources in their Cloudflare account. Say what it will make and
  get a yes before running it.

## 1. Check the computer

Run `node --version` and compare it with `.nvmrc`. If it differs, help them install that version
(through `nvm` if they have it). Then run `npm install`.

## 2. Find out what they have

Ask, in one message:

1. Do you have a domain on Cloudflare? Which one?
2. Is the Cloudflare account on the **Workers Paid** plan (US$5 a month)?
3. Do you have a Resend account?

Help with whatever is missing before going on:

- **No domain on Cloudflare:** they can buy one through Cloudflare Registrar, or add one they own
  under **Add a domain** and change its nameservers where they bought it. Nameserver changes can take
  a few hours; they can do the Resend step meanwhile.
- **Workers Paid:** ask them to look under **Workers & Pages** > **Plans** and confirm it says Paid;
  nothing else checks this. The library needs it.
- **No Resend account:** sign up at resend.com; the free plan is enough to start.

## 3. Choose the library's details

Ask for:

- **its name**, as neighbours will see it ("Our Street Library")
- **what it lends:** books, or things (tools, gear and the like)
- **the neighbourhood**, in words ("Church End, Finchley" or a postcode)
- **the email address** of its first admin, usually the person you are talking with

Then work out the rest and confirm it in one short summary:

- **slug**: from the name, without a trailing "Library", in lowercase letters, digits and dashes,
  2–40 characters, starting with a letter: "Our Street Library" becomes `our-street`.
- **address**: `<slug>.<their domain>`, such as `our-street.example.org`.
- **centre**: look the neighbourhood up on OpenStreetMap's Nominatim, at most once a second:
  `curl -s -A "community-distributed-library setup" "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=<neighbourhood, URL-encoded>"`.
  Take `lat` and `lon`, rounded to 4 decimals. Say which place it found ("Church End, London N3") so
  they can correct you. If nothing is found, ask for a nearby street or postcode.

## 4. The Cloudflare token

Send them to the pre-filled token page. The link is in `docs/self-hosting.md`, step 2; copy it from
there exactly. Tell them:

1. Check the page lists eight permissions (picture: `docs/images/cloudflare-token-permissions.png`).
2. Select **Continue to summary**, then **Create Token**.
3. Copy the token. Cloudflare shows it once.

## 5. The Resend key

1. In Resend, **Domains** > **Add domain**, enter their domain, **Add domain**.
2. **Auto configure** adds the DNS records to Cloudflare. Wait until each record says **Verified**.
3. **API keys** > **Create API key**: name it after the library, **Sending access**, their domain,
   **Add**. Copy the key. Resend shows it once.

The pictures are `docs/images/resend-*.png`.

## 6. Both keys into `.env`

If `.env` does not exist, create it with empty values, so they only paste:

```sh
CLOUDFLARE_API_TOKEN=
RESEND_API_KEY=
```

Ask them to open `.env` in the repository's folder, paste each key after its `=`, and save. Wait
until they say it is done. Do not open the file to check.

## 7. Check before making anything

```sh
set -a; . ./.env; set +a; npm run check:setup -- --host <address>
```

Every line should start with ✓. For each ✗, the line says what to do; walk them through it, then run
the check again. Common ones:

- **The token reaches several accounts:** add `CLOUDFLARE_ACCOUNT_ID=<the one they choose>` to `.env`.
- **R2 storage is not on:** in Cloudflare, **R2 Object Storage**, turn it on (it asks them to agree to
  its terms; that is theirs to do).
- **No verified Resend domain:** Resend is still checking DNS; wait a few minutes and check again.

## 8. Open it

Tell them what is about to happen: their Cloudflare account gets the library's 5 Workers, 2
databases, 2 storage buckets, a sign-in store and 3 addresses (`<address>`, `mcp.<address>`,
`images.<address>`), and they become its admin. Their first library also makes the book lookup
Worker and its database, which every later library shares. The library sends mail from
`<slug>@<their domain>`. Get a yes, then:

```sh
set -a; . ./.env; set +a; npm run provision -- <slug> --host <address> --name "<name>" --centre <lat>,<lng> --type <books|things> --admin <email>
```

It takes a few minutes. If it stops, read the last error, fix the cause, and run the same command
again: it keeps what it already made.

## 9. Check it works

- `curl -s -o /dev/null -w "%{http_code}" https://<address>/about` gives `200`.
- `curl -s -o /dev/null -w "%{http_code}" https://mcp.<address>/.well-known/oauth-authorization-server`
  gives `200`. A new address can take a minute or two to answer; try again before worrying.

Then tell them:

1. Open `https://<address>`, sign in with `<email>`, and follow the link in the email.
2. In **Moderation** > **Settings**: a description, the languages and a colour.
3. Invite the first neighbours from the menu.

## 10. What to keep safe

Make sure they understand, in plain words:

- `libraries.json` lists their libraries and what each owns in Cloudflare. Every later update reads
  it. Keep a copy somewhere safe, such as a private repository or a password manager.
- `.keys/<slug>.vapid.json` is the library's private notification key. Cloudflare will not show it
  again. Keep a copy.
- `.env` holds their two keys.

All three stay out of git on their own.

Updates later: the `update-libraries` skill. Another admin: the `make-admin` skill. Another library:
this skill again, with a different name and address.
