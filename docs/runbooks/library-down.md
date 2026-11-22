# A library is not working

**From:** the outside probe (`.github/workflows/probe.yml`), as a GitHub issue labelled
`library-down`. It asked twice, a minute apart.

**Means:** members cannot reach the library, or a part of it is failing (its database, images,
notify or convo), or its scheduled jobs have stopped.

## First look

- The issue lists what failed: an address that does not answer, a part that is `failing`, or
  `jobs late`.
- `npm run probe` from your computer: the same questions now.
- `curl -s https://<host>/api/v1/health`: each part and the late jobs.
- [Cloudflare status](https://www.cloudflarestatus.com) if every library fails at once.

## Safe now

- An address that does not answer while Cloudflare is fine: check the custom domain on the
  `<slug>-web` Worker (**Workers & Pages → `<slug>-web` → Settings → Domains**). Redeploying that
  library (`npm run deploy -- <slug>`) puts its routes back.
- `jobs late`: see [job-missed.md](job-missed.md). Every job late at once means the every-minute
  cron stopped: check **`<slug>-core` → Settings → Triggers**.

## Fix prompt notes

Add after step 1: "Start from the failing part the health route named. A part that fails only
from outside but answers inside Cloudflare is DNS or routing, not code: say so and stop."

The issue closes itself when every library answers again.
