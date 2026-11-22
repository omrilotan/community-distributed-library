---
name: update-libraries
description: Bring the person's own Community Distributed Libraries up to date with the latest code. Use when someone asks to update, upgrade or redeploy their library or libraries.
---

# Update libraries

The libraries the person runs are listed in `libraries.json`. An update takes the latest code and
deploys it to each of them, applying database changes first.

1. Check `libraries.json` exists. If not, they have no library yet: offer the `open-a-library` skill,
   or ask them to restore their backup of the file.
2. Make sure nothing local is lost: `git status`. If they changed files themselves, ask before
   pulling over them.
3. Get the code and its dependencies:

   ```sh
   git pull
   npm install
   ```

4. Check, loading the keys in the same command (never print them):

   ```sh
   set -a; . ./.env; set +a; npm run check:setup
   ```

   Email now goes through Cloudflare Email Sending. If the check says **Email Sending is off** for a
   domain, run the command it gives (`npx wrangler email sending enable <domain>`) with the keys
   loaded. If it says the token **cannot reach Email Sending**, ask them to add **Email Sending:
   Edit** to the token in Cloudflare (**My Profile** > **API Tokens**, edit), then check again.
   Once it passes, `RESEND_API_KEY` in `.env` is no longer used; they can remove it.

5. Deploy the shared book lookup first, then every library in the order `libraries.json` lists
   them:

   ```sh
   set -a; . ./.env; set +a; npm run deploy -- shared && npm run deploy -- all
   ```

   Each library gets its database changes, then its Workers. If one library fails, the others still
   go; read the error, fix it, and deploy that one again with `npm run deploy -- <slug>`.

6. Bring the ops MCP and the alerts up to date, for every library in `libraries.json` (each
   changes only what it made, and is safe to run again):

   ```sh
   set -a; . ./.env; set +a; npm run ops && npm run observe
   ```

   Each library's admins are told when it breaks, and every admin when something the libraries
   share breaks. If it says there is **nobody to tell**, ask who should hear (usually the person
   themselves) and run it again with `-- --email <address>`. If it says the token
   needs a permission, ask them to add it to the token in Cloudflare (**My Profile** > **API Tokens**,
   edit), then run it again.

7. Run `npm run probe`: every library answers, its health route says each part works and no job
   is late. Tell them it is done.
