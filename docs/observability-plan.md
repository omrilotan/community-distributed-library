# Observability plan

Status: built, phases 0 to 5, 2026-11-22. Where the build differs from the plan, **As built** at
the end says how and why.

This plan covers the running libraries: the per-library Workers (`<slug>-web`, `-core`, `-mcp`,
`-notify`, `-convo`) and the shared ones (`cdl-metadata`, `cdl-reports`, `cdl-landing`). It does not
cover CI or the video. The reader is the **operator**, the person who runs one or more libraries.
Moderators already have `/v1/admin/*` for their own community; this plan is about the system under
it.

## What we want to know

Three questions, in order of importance:

1. **Is any library broken for its members?** A member can't sign in, can't ask for a loan, or
   doesn't hear about a request.
2. **Is any library quietly wrong?** Every response is a 200 but the outcome is wrong: an email was
   never sent, a backup didn't run, a thread wasn't purged after 90 days, or a copy shows as shelved
   while it's out on loan. This is the "silent wrong answer" from the source article, and it is the
   main risk for a codebase written mostly with an assistant.
3. **Is each library alive as a community?** Members, items, loans and response times. This is the
   small business part: counts only, never people.

Every alert must answer one of these questions, or we don't add it.

## Where we start

Already in place:

- `observability.enabled: true` on every Worker (Workers Logs, 7 days). Stack traces point at `src/`.
- `console.error("[area] what", …)` at about 30 handled-failure sites, with a bracketed tag
  (`[notify] email given up after retries`, `[backup] failed`, `[auth] magic link not sent`, …).
- `app.onError` logs every unhandled error and returns a problem+json 500.
- `cdl-reports` writes CSP violations and NEL reports to Analytics Engine.
- Each scheduled job logs its result as JSON (`[reminders] {...}`, `[backup] {...}`).
- `/v1/admin/stats` and `/v1/admin/attention` for moderators.
- State that tells us when delivery fails is already in D1: `pending_emails`, `held_notices`,
  `webhook_deliveries (status, next_at)`, `push_subscriptions`.

Missing:

- No traces, so a slow `web → core → notify` call can't be followed across the service bindings.
- No alerts. Somebody has to open the dashboard to find out about a failure.
- Logs are strings with a tag, not fields. We can search them but not group or count them reliably.
- Nothing notices a job that **didn't** run. A missing log line raises nothing.
- Nothing checks invariants. The data can drift from what the code means, and no error is logged.
- No view across all libraries, and no way to ask questions without clicking through the dashboard.

## Principles

- **Cloudflare first.** Use what the account already has (Workers Logs, Traces, Issues, Monitors,
  Custom Dashboards, the SQL API, Analytics Engine) before building anything. No third-party vendor.
- **Privacy is a hard limit.** Telemetry carries ids and counts, never names, emails, meeting places,
  message text or search terms. A member's id is hashed with a per-library salt before it is logged.
  This matches what the app already promises (snapped location, no pins, 90-day thread purge).
- **Absence is a signal.** Every scheduled job records that it ran. A missed run raises an alert,
  just as a failed one does.
- **Alert on counts, not rates.** A library has tens of members. Rate-based and anomaly alerts
  misfire at that traffic. Cloudflare's own docs say high-sensitivity rate alerts don't suit
  low-traffic zones.
- **Sample by value, never uniformly.** Every signal has a sampling decision on purpose (see 1.6).
  Signals that are rare and matter (errors, slow requests, writes, checks, jobs, domain events,
  delivery) are always kept in full. Signals that are frequent and alike (fast successful reads,
  static assets, browser reports) are sampled, and each kept event carries its weight so counts can
  be rebuilt. Alerts read only the streams kept in full. Today every library is small, so most rates
  start at 1. The rules are there so that a busy library, or many libraries, lowers volume without
  losing the signals that matter.
- **No trace, no fix.** Every fix prompt starts from a log line, trace or check result. An assistant
  proposes a change. A person reviews it and deploys it (CI does not deploy, and that stays).
- **Few alerts, each with a runbook.** Urgent alerts go to email straight away. Everything else goes
  into a weekly digest.

## Layer 1: signals

### 1.1 Turn on what is already there (config only)

In every `wrangler.jsonc` template, so `deploy.mjs` carries it to every library:

```jsonc
"observability": {
	"enabled": true,
	"logs": { "invocation_logs": true, "head_sampling_rate": "<from manifest>" },
	"traces": { "enabled": true, "head_sampling_rate": "<from manifest>" },
	"issues": { "enabled": true }
}
```

The two rates are never hard-coded. `deploy.mjs` writes them per library and per Worker from a
`sampling` block in the manifest, with the defaults from 1.6.

- **Traces** follow service bindings and RPC across Worker boundaries automatically (RPC session
  spans), so `web → core → notify/convo` becomes one waterfall. Stored traces are billed from
  2026-12-01; 1.6 sets the rates.
- **Issues** groups uncaught exceptions, 5xx responses and `console.error` calls into issues.
  Handled failures already go through `console.error(..., error)`, so they're picked up with no code
  change. This needs Wrangler 4.134 or later; the repo is on `^4.165`.
- Check that `apps/web` (vinext) builds and uploads source maps too, not only the services.

### 1.2 Structured log events

Add a small `log` helper in `packages/contracts` (or a new `packages/telemetry`), and use it
everywhere in place of bare `console.*`:

```ts
log.error("email.given_up", { kind, attempts, library });
log.warn("waitlist.offer_failed", { copyId, error });
log.info("job.ran", { job: "backup", ms, result: { bytes, tables } });
```

Each call writes one JSON object: `{ event, level, library, service, version, ...fields }`. Workers
Logs indexes the fields, so the Query Builder, Monitors and the SQL API can filter and group by
`event`. The current `[area] text` tags become `area.verb` event names: same meaning, now machine-
readable. Errors still go through `console.error` with the `Error` object, so Issues keeps seeing
them.

`library` and `version` come from vars that `deploy.mjs` already writes per library (slug, and
`CF_VERSION_METADATA`).

A unit test greps `services/` for bare `console.` calls, so new code can't add one.

### 1.3 Job heartbeats

Add a `job_runs` table in each D1 that has jobs (core, convo). Each scheduled handler is wrapped
once:

```
job_runs(job TEXT, started_at, finished_at, outcome 'ok'|'failed', detail JSON)
```

Keep 30 days. Each run also logs `job.ran` or `job.failed`. Jobs and how often they run:

| Worker | Job                                          | Cron      | "Missed" means        |
| ------ | -------------------------------------------- | --------- | --------------------- |
| core   | `deliver` (held notices, webhooks, emails)   | every min | no `ok` run in 10 min |
| core   | `reminders`                                  | 08:00 UTC | no `ok` run in 26 h   |
| core   | `backup`, `rehost-covers`, `revoke-consents` | 03:20 UTC | no `ok` run in 26 h   |
| convo  | `purge-threads`                              | 04:15 UTC | no `ok` run in 26 h   |

### 1.4 Invariant checks ("is it quietly wrong?")

Add a `checks.ts` module in core (and a smaller one in convo). Each check is one SQL query that
should return 0. They run every 15 minutes from the existing every-minute cron (`minute % 15 == 0`).
Each result is logged as `check.result { check, value, ok }` and written to Analytics Engine
(1.5). A failing check logs at `warn`; a check marked `critical` logs at `error`, so it also becomes
an Issue.

Starting set, drawn from what the code promises:

| Check                  | Query (in words)                                                                            | Severity                   |
| ---------------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| `sign_in_mail_failing` | magic links created in the last hour whose email failed                                     | critical                   |
| `emails_stuck`         | `pending_emails` due more than 15 min ago and still pending                                 | critical                   |
| `emails_given_up`      | emails given up after retries, last 24 h                                                    | warn                       |
| `held_notices_stuck`   | `held_notices` due more than 10 min ago and not sent                                        | critical                   |
| `webhooks_failing`     | `webhook_deliveries` with `status = 'failed'`, last 24 h                                    | warn                       |
| `copy_loan_mismatch`   | copies whose state disagrees with an active loan (out with no loan, or on loan but shelved) | warn                       |
| `loan_no_handoff`      | agreed loans with no handoff, older than the agreed window                                  | warn                       |
| `threads_past_purge`   | (convo) threads of loans closed more than 90 days ago, still present                        | critical (privacy promise) |
| `backup_missing`       | no `backups/<today or yesterday>.sql` object in `<slug>-backups`                            | critical                   |
| `covers_external`      | covers still on a third-party host, older than 2 days                                       | warn                       |
| `push_gone_rate`       | push sends rejected with 404/410, last 24 h (stale subscriptions)                           | info                       |
| `tokens_abandoned`     | consents left unredeemed past the revoke window (the revoke job isn't working)              | warn                       |

`copy_loan_mismatch` and `loan_no_handoff` are the "silent wrong answer" checks. They catch a
handler that returned 200 but updated only half of what it should have. When a bug like that is
found, add a check for it as well as the fix.

### 1.5 Analytics Engine: one events dataset

Add a `cdl_events` dataset, bound in core, web and mcp. It is the counter store for dashboards and
for the ops MCP. Write data points only; never read on the request path. Columns are documented as
labelled tuples, the way `services/reports/src/index.ts` already does it.

- `index1` = library slug (so one dataset serves every library, filtered per library)
- `blob1` = kind: `request | domain | check | job`
- `blob2` = name (`GET /v1/loans/:id`, `loan.requested`, `emails_stuck`, `backup`)
- `blob3` = outcome / status class (`2xx`, `4xx`, `5xx`, `ok`, `failed`)
- `blob4` = surface: `web | api | mcp | webmcp | cron`. This shows how much traffic comes through
  assistants.
- `double1` = 1 (count), `double2` = duration ms, `double3` = value (for checks)
- `double4` = weight, `1 / sample rate` (1 for anything kept in full; see 1.6). Every count query
  uses `SUM(double4)`, never `COUNT()`. A test fails any query in `services/ops` that counts
  without the weight.

**Request** points come from one Hono middleware in core, keyed by the matched route
(`matchedRoutes`, already used in `routes-admin.ts`), never the raw URL, so ids and search terms
stay out.

**Domain** points come from the existing `events.ts` emitter, which already knows `copy.*`, `loan.*`
and `handoff.*` for webhooks. Hook it there, so every webhook event is also counted.

### 1.6 Sampling

Cloudflare samples only at the head: the keep-or-drop decision is made when a request arrives,
before anyone knows whether it will fail or be slow. Tail sampling (keep only the bad ones) is not
offered. A request dropped by `head_sampling_rate` loses **all** its logs, its `console.error`
included. So we split the work in two:

- **The platform head rate** decides which requests get Cloudflare's full record (invocation log,
  traces). It's a cost dial, and it can be lowered.
- **Our own code** decides what is always recorded, after the outcome is known. That gives us the
  tail sampling the platform doesn't have. These records go somewhere the head rate can't drop them:
  D1 (`job_runs`, check results, the delivery tables) and Analytics Engine (`cdl_events`, written
  from code on every request, sampled or not).

**Always keep (rate 1, weight 1), whatever the head rate:**

- Errors, 5xx responses, and handled failures (`log.error`)
- Slow requests: wall time over the route's budget (default 1 s; `GET` search 1.5 s)
- Every write (`POST`, `PUT`, `PATCH`, `DELETE`). A library makes few of them, and each one is a
  member doing something.
- Sign-in, invites, OAuth and consent: rare, and the first place a lockout shows
- Scheduled runs, check results, job heartbeats
- Domain events (`loan.*`, `copy.*`, `handoff.*`) and every step of delivery (held, push, email,
  webhook)
- MCP tool calls. Assistant traffic is new and small, and it's the surface we least understand.

**Sample (rate below 1, weight `1/rate`):**

- Fast successful `GET`s to core: start at 1, and lower toward 0.1 when a library's reads pass about
  50k a day
- `web` page and asset requests: start at 0.25, because most of them are static assets and
  revalidation
- `cdl-reports` CSP and NEL reports: 1 per distinct `(directive, blocked, document)` per hour, then
  0.05. A burst from one broken page then counts as one finding, not a flood.
- `cdl-metadata` cache hits: 0.1; misses and provider errors: 1

**The decision is consistent within a request.** The app-level sampler hashes the request's trace
id (`cf-ray` when there is no trace) and compares it against the rate. Every point and log line from
one request is then kept together or dropped together, across web, core and notify, because the id
travels with the service-binding call. For a delivery path, the key is the loan id, so one loan's
whole story is kept or dropped as a unit.

**The platform head rates follow the same split.**

| Worker          | logs `head_sampling_rate` | traces `head_sampling_rate` | Why                                      |
| --------------- | ------------------------- | --------------------------- | ---------------------------------------- |
| `<slug>-core`   | 1                         | 0.25 → lower with volume    | Logs carry the errors; traces show shape |
| `<slug>-notify` | 1                         | 1                           | Low volume, all of it delivery           |
| `<slug>-convo`  | 1                         | 0.25                        | Messages are writes; reads are many      |
| `<slug>-mcp`    | 1                         | 1                           | Few calls, high interest                 |
| `<slug>-web`    | 0.25                      | 0.05                        | Mostly static and SSR reads              |
| `cdl-metadata`  | 0.25                      | 0.05                        | Cache hits dominate                      |
| `cdl-reports`   | 0.1                       | 0                           | The data is in Analytics Engine already  |
| `cdl-landing`   | 0.1                       | 0                           | A static page                            |

On top of the defaults:

- **Trace rules** (zone level, first match wins) raise the rate to 100% for the paths that matter
  most: `/api/v1/auth/*`, `/api/v1/loans/*` with a write method, `/api/v1/handoffs/*`, the MCP
  OAuth endpoints, and any request with an operator debug header. The header's value is a secret
  the operator knows, so nobody else can raise the cost.
- **Errors are never only in a sampled store.** Because the head rate can drop an error's log line,
  `log.error` also writes a `cdl_events` point. Monitors and the ops MCP count errors from there. We
  still need to check in practice whether Issues sees failures in requests the head rate dropped.
  Until we know, `core`, `notify` and `mcp` keep logs at 1.
- **Deploy window.** For 60 minutes after a deploy, the app-level sampler runs at rate 1 (from a
  `DEPLOYED_AT` var that `deploy.mjs` writes). The platform rate only changes on deploy, but a
  regression shows in the first hour, and the app-level points are enough to see it.
- **Incident boost.** The operator can set `SAMPLING_BOOST_UNTIL` on one library (a var change and a
  redeploy, through the ops MCP with confirmation) to run every rate at 1 while chasing a problem.
  It turns itself off at the set time.

**Distinct counts are never taken from sampled data.** Sampling breaks "how many members were
active". Active members, items and loans come from a daily snapshot query on D1 (exact), written to
`cdl_events` as `kind = 'snapshot'`, weight 1. Sampled points are used only for volumes, rates and
latency.

**Privacy gains from sampling too.** Less retained data means less exposure. Turn on query-string
redaction for logs and traces (`redactQueryString` in Cloudflare's config schema; confirm the
Wrangler key name) so search terms in `?q=` never reach Workers Logs at any rate.

**Rates are reviewed, not guessed.** The ops MCP tool `sampling_status` (layer 4) reports, per
Worker and library, the events per day, the effective rate, the share of each stream kept in full,
and a suggested rate that keeps the Worker under a daily event budget set in the manifest. The weekly
digest flags any Worker over its budget. A rate is changed in the manifest and goes out with the
next deploy, so every change is in git.

## Layer 2: Cloudflare dashboards

Use **Custom Dashboards** (Observability → Dashboards). They can now chart the **Workers
Observability — Logs** and **— Traces** datasets next to Analytics Engine datasets, and an account
can have up to 100. Build three of them. Each is filtered by a `library` variable, or by the
`$metadata.service` prefix (`<slug>-`) for platform data.

**1. Fleet health** (open it when something feels wrong)

- Requests and 5xx per Worker, all libraries, stacked, last 24 h and 7 d
- p50 and p95 wall time for core routes (traces), top 10 slowest routes
- Error logs grouped by `event`, top 10
- Open Issues per Worker
- Job heartbeats: a grid of library × job, showing the last `ok` time
- Check results: a grid of library × check, showing the latest value, red when not 0
- D1: rows read and written per database, storage per database
- CSP violations and network errors from `cdl-reports`, by directive and host
- Deploy markers: `version` from the logs, so error spikes line up with releases

**2. Delivery** (email, push, webhooks: the part most likely to fail quietly)

- Emails sent, retried and given up per library per day
- Push sent and rejected (by status), and live subscriptions
- Held notices: queued vs sent on time
- Webhook deliveries: delivered, retrying, failed

**3. Libraries** (the light business view, counts only)

- Active members (7 d and 30 d), from the daily D1 snapshot, not from sampled requests (1.6)
- Items listed, lendable, and on loan
- Loan requests per week, and the share agreed, declined and cancelled
- Median time for an owner to answer a request
- Overdue loans, and reminders sent
- Invites sent and accepted
- Asks made and fulfilled
- Share of actions through assistants (`surface = mcp`) vs the web app

Dashboards stay for people. They're where a fix gets checked after it ships, and where a change in a
library first shows. The MCP endpoint (layer 4) answers questions; it doesn't replace the dashboards.

## Layer 3: alerts

Three Cloudflare mechanisms are enough:

- **Workers Issues automations.** A new or recurring Issue on any `*-core`, `*-web`, `*-mcp`,
  `*-notify` or `*-convo` Worker → email, plus a **Claude Code routine** destination (supported
  natively) that gets the issue summary and context and opens a draft PR. The occurrence threshold is
  1. A recurrence trigger fires when an issue comes back after it was resolved.
- **Monitors** (Observability → Alerts → Monitors). These are SQL queries over Workers Logs or
  Analytics Engine, run on a schedule, with threshold rules. Use them for heartbeats, checks and
  delivery counts.
- **Platform Notifications.** Usage-based billing (Workers, D1, R2, Observability ingestion), D1
  limits, and SSL certificate expiry for the library hosts.

Destinations: the operator's email for everything; a webhook into the ops Worker (layer 4) so alerts
are also stored and the MCP can answer "what fired this week"; the Claude Code routine for Issues
and for checks marked `fixable`.

Every alert reads a stream that is kept in full (1.6): D1 check results, job runs, or `cdl_events`
points with weight 1. None of them reads Workers Logs or traces that a head rate may have thinned. A
lowered sampling rate can then never hide an alert, nor fire one by accident.

### Alert list

| #   | Alert                       | Source                                                  | Fires when                                                                    | Level  |
| --- | --------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| A1  | Library down                | Monitor on `cdl_events` + external probe (below)        | 0 successful requests to `/api/v1/health` in 10 min, or the probe fails twice | urgent |
| A2  | New failure                 | Issues automation                                       | new Issue on any library Worker                                               | urgent |
| A3  | Members can't sign in       | check `sign_in_mail_failing`                            | > 0                                                                           | urgent |
| A4  | Email stuck                 | check `emails_stuck`                                    | > 0 for 2 runs in a row                                                       | urgent |
| A5  | Loan requests not delivered | check `held_notices_stuck`                              | > 0 for 2 runs in a row                                                       | urgent |
| A6  | Job missed                  | Monitor on `job.ran`                                    | per the table in 1.3                                                          | urgent |
| A7  | Backup missing              | check `backup_missing`                                  | > 0                                                                           | urgent |
| A8  | Privacy purge behind        | check `threads_past_purge`                              | > 0                                                                           | urgent |
| A9  | 5xx burst                   | Monitor on `cdl_events` (5xx, kept in full)             | ≥ 5 responses with status ≥ 500 in 15 min on one library                      | urgent |
| A10 | Data drift                  | checks `copy_loan_mismatch`, `loan_no_handoff`          | > 0                                                                           | digest |
| A11 | Delivery degraded           | `emails_given_up`, `webhooks_failing`, `push_gone_rate` | > 0                                                                           | digest |
| A12 | Slow core                   | `cdl_events` durations, weighted                        | p95 of a route > 1.5 s over 1 h                                               | digest |
| A13 | CSP / network errors        | `cdl-reports` dataset                                   | a new directive or host not seen in the last 7 days                           | digest |
| A14 | Spend                       | Platform Notification: usage-based billing              | over the set monthly level                                                    | urgent |
| A15 | Quiet library               | `cdl_events` domain points                              | no loan request in 21 days on a library that had some                         | digest |

**External probe.** Cloudflare can't tell us that Cloudflare itself is unreachable. Add a scheduled
GitHub Actions workflow (every 15 min) that runs `npm run check:libraries -- --live`. It requests
`/`, `/api/v1/health` and `mcp.<host>/.well-known/oauth-authorization-server` for every library in
the manifest, and opens or updates a GitHub issue when one fails. The `/api/v1/health` route
(new) checks D1 (`SELECT 1`), R2 (`head` on a sentinel object) and the notify and convo bindings,
and returns their status, with no data. CI keeps not deploying; this workflow only reads.

**Weekly digest.** Every Monday the ops Worker queries the week (alerts that fired, digest-level
checks, the Libraries dashboard numbers) and emails the operator one message per fleet. Quiet weeks
say "nothing to report" in one line.

### Every alert carries a fix prompt

Each alert's notification links to a runbook in `docs/runbooks/<alert>.md`. The runbook says:

1. **What it means** for members, in one line.
2. **First look.** The exact query or dashboard tile, and the `wrangler` command to run against the
   library: `npx wrangler d1 execute <slug>-core --remote -c "$(node scripts/config.mjs <slug> core)" --command "…"`.
3. **Safe immediate action**, if there is one (for example: take a backup now with
   `POST /v1/admin/backup`, or re-run delivery).
4. **Fix prompt**: a ready prompt for Claude Code in this repository, filled from the alert payload.

Template:

```text
Alert {{alert}} fired for library {{slug}} at {{time}}.
Evidence: {{trace_id | issue_url | check name and value}}.
Recent log events: {{last 20 matching events, fields only}}.

1. Reproduce from the evidence before changing anything. Pull the library's database with
   `npm run db:pull -- core --library {{slug}}` if the data matters, and write a failing test
   (vitest in workerd, against the migrated D1) that shows the fault.
2. Fix at the narrowest layer. Do not widen scope.
3. If the fault was a silent wrong outcome, add or tighten a check in checks.ts so it is caught next time.
4. Run npm run typecheck, npm test and npm run format.
5. Open a draft PR that names the evidence. Do not deploy.
If the evidence does not point to a cause, stop and say so. Do not guess a fix.
```

Alert-specific notes go into the prompt. For example, A4 _Email stuck_: "Check the Email Sending
status for the sender domain first; a sending suspension is not a code bug." And A8 _Privacy purge
behind_: "Treat this as a privacy incident: say how many threads are past 90 days, and purge them
only after the fix is reviewed."

The Issues → Claude Code routine path uses the same template. The routine gets the issue summary and
diagnostic context from Cloudflare and must quote a trace or log id in the PR. Without one it stops
and reports.

## Layer 4: asking questions (ops MCP)

The operator needs to ask things like "is anything wrong with our-street?", "did every backup run
this week?", "why did Dana not get the request email yesterday?", "which library is growing?".

### Two MCP servers, each doing what it is good at

1. **Cloudflare API MCP server** (`https://mcp.cloudflare.com/mcp`). It already queries Workers
   Logs, traces and Issues, and can subscribe to Issues as **MCP Events** (with a webhook client).
   Use it for raw telemetry and for "show me the trace". It needs no build, only the right token
   scopes (Workers Observability Read/Write, Notifications Write). Document how to connect it in
   `docs/self-hosting.md`.
2. **A new `cdl-ops` MCP server**, shared, for questions about the domain, across libraries. It
   knows what a library, a job, a check, a loan and an alert are, so answers come in those terms, not
   as log rows.

### `cdl-ops`

A shared Worker under `services/ops/`, at `ops.<bare domain>/mcp`, deployed with
`npm run deploy -- shared`.

- **Auth:** operator only. Put the host behind Cloudflare Access (a one-person policy), and use
  OAuth for MCP clients the same way `services/mcp` does. Separate it fully from member and
  moderator tokens. An `admin` scope on a library is not operator access.
- **Reads from:**
  - `cdl_events` and Workers Logs, through the **Analytics SQL binding** (`"analytics":
{ "binding": "ANALYTICS_SQL" }`, Wrangler 4.145 or later). It needs no API token in the Worker.
  - Each library's core, through new operator-only routes `/v1/ops/checks`, `/v1/ops/jobs` and
    `/v1/ops/delivery`. These return the latest check results, job runs and queue depths, counts
    only. Calls go over a service binding per library, generated from the manifest the way
    `deploy.mjs` already writes per-library configs.
  - Its own small D1 (`cdl-ops`): alerts received through the webhook destination, and acks.
- **Writes:** none to any library, except `run_check(slug, check)` and `take_backup(slug)`. Both are
  safe and idempotent, and both ask the operator to confirm. No tool changes member data or
  deploys.

Tools, each answering one kind of question:

| Tool                                                  | Answers                                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `fleet_status()`                                      | Each library: up/down, open Issues, failing checks, last missed job                                   |
| `library_health(slug)`                                | One library in depth: checks, jobs, delivery queues, 5xx and p95 over 24 h                            |
| `list_alerts(since, slug?)`                           | What fired, and whether it cleared                                                                    |
| `explain_alert(id)`                                   | The evidence (log events, trace ids), the runbook, and the filled fix prompt                          |
| `job_runs(slug, job, days)`                           | "Did backups run this week?"                                                                          |
| `delivery_trace(slug, member_hash \| loan_id, since)` | "Why did this person not get the email?": the path from event to push to email, ids and statuses only |
| `query_events(sql)`                                   | Read-only SQL over `cdl_events`, scoped to its own dataset, row-limited                               |
| `library_trends(slug?, weeks)`                        | Members, items, loans, response time, assistant share: the light business view                        |
| `compare_libraries(metric, weeks)`                    | "Which library is growing / slowing?"                                                                 |
| `recent_deploys(slug?)`                               | Versions and times, so "it broke after Tuesday's release" can be checked                              |
| `sampling_status(slug?)`                              | Events per day per Worker, effective rates, share kept in full, a suggested rate under the budget     |
| `run_check(slug, check)`                              | Re-run one check now (confirm first)                                                                  |

`delivery_trace` takes a hashed member id or a loan id, never an email address. The operator gets
the hash from the moderator's member page (add "copy support id" there). So an assistant can follow
one person's notification path without the telemetry ever holding the person.

### What "asking" looks like

> **Operator:** anything I should look at?
> **Assistant** (`fleet_status`, then `explain_alert`): our-street: `emails_stuck` = 3 since 14:05,
> and every Email Sending call fails with `sender domain not verified` (log events attached). It
> started right after version 8c1f… deployed at 14:02, which changed `notify/src/index.ts`. The
> runbook suggests checking the sender domain first. Want the fix prompt?

## Rollout

Each phase can ship alone and is useful alone. Libraries get changes in manifest release order (the
first library first), as with every release.

| Phase                  | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Size                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **0. Switch on**       | `sampling` block in the manifest and head rates per Worker (1.6), written by `deploy.mjs`; query-string redaction; traces, Issues and web source maps in every template; `npm run observe` (run by `provision`, and by the update skill) sets up, through the Cloudflare API: email alert policies for failing Workers and certificates, one Issues automation per Worker, and trace rules per zone for sign-in, joining, assistants, loan and handoff changes and a secret debug header. Monitors have no public API yet, so the existing `console.error` lines reach the operator through Issues instead | config, scripts and skills, 1–2 days |
| **1. Know it ran**     | `/api/v1/health`; `job_runs` and the job wrapper; Monitor A6; GitHub Actions probe (A1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 1–2 days                             |
| **2. Know it's right** | `log` helper and migration off bare `console.*`; `checks.ts` with the starting set; Monitors A3–A5, A7, A8, A10, A11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 2–3 days                             |
| **3. See it**          | `cdl_events` dataset with the weight column, the app-level sampler (keep-always rules, trace-id hashing, deploy window), request middleware, domain hook in `events.ts`, daily D1 snapshot; the three Custom Dashboards                                                                                                                                                                                                                                                                                                                                                                                    | 2 days                               |
| **4. Fix loop**        | `docs/runbooks/*`, fix prompt template, Claude Code routine as the Issues and `fixable` check destination                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 1 day                                |
| **5. Ask it**          | `services/ops` MCP with Access, ops routes in core, webhook alert store, weekly digest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 3–4 days                             |

After phase 5, every alert in the table has a source, a runbook and a prompt. Review the alert list
after a month: delete any alert that fired without anyone needing to act on it.

## Costs and limits to watch

- Workers Logs and traces: 7-day retention. Traces count toward Observability ingestion and storage
  from 2026-12-01. At library traffic it's small, but put a billing notification on it (A14).
- Analytics Engine: adaptively sampled at volume, on top of our own sampling. The SQL API applies
  its own sample weights to `COUNT`, `SUM` and `AVG`; ours sits in `double4`. Fine for trends; don't
  use it to count single events exactly (checks and delivery_trace read D1 for that).
- Sampling budget: each Worker gets a daily event budget in the manifest. `sampling_status` and the
  weekly digest compare usage against it. Lower a rate only for a stream that isn't kept in full.
- Before lowering any logs head rate below 1 on core, notify or mcp, test whether Issues still sees
  a failure in a request the head rate dropped (1.6).
- Monitors are in beta. Keep each monitor's SQL in the repo (`docs/monitors/*.sql`) so the monitors
  can be recreated, and add a `scripts/monitors.mjs` once the API settles.
- Every check is a D1 query every 15 minutes per library. Each must be index-backed. Add any missing
  index in the same migration that adds the check.

## Open questions

- Where should urgent alerts reach the operator beyond email: push to their own phone (a library
  already does Web Push), or a chat webhook?
- Should moderators see the checks that concern their community (for example `loan_no_handoff`) in
  `/admin/attention`, or are checks operator-only?
- Is one ops host for the whole fleet right? (Each library's admin now has their own library's
  view in its MCP; see As built.)

## As built

What changed from the plan while building it:

- **Alerts go through Workers Issues, not Monitors.** Monitors have no public API, and `npm run
observe` sets everything up through the API. So each alert the plan gave a Monitor is an error
  the code logs instead, with the thing it is about in the message (`job.missed backup`,
  `check.failed emails_stuck`), so Issues keeps one Issue per job and check and emails the
  library's admins on the first one. Critical checks log at error; warn and info checks are logged
  and kept for the digest and the ops tools.
- **Health** is `/v1/health` in core (`/api/v1/health` through the web app). It reports the parts
  and the late jobs, and answers 503 when anything is wrong.
- **Jobs** keep one row each in `job_status` (every run) and a history in `job_runs` (daily jobs
  and failures only), so the every-minute jobs do not write a row a minute.
- **The outside probe** is `scripts/probe.mjs` (`npm run probe`), needing nothing installed. The
  GitHub workflow reads the hosts from the repository variable `CDL_LIBRARY_HOSTS`, which
  `npm run observe` sets with the GitHub CLI, since the manifest is not in git.
- **Outcomes that leave no row** (a sign-in email that did not go, an email given up, a push
  thrown away) are counted by the hour in `tallies`, for the checks to read.
- **`cdl_events` is written by core only.** The web app and the MCP say which surface a call came
  from (`x-cdl-surface`) and the visitor's request id (`x-cdl-request`), so core counts every
  surface and keeps one visit's points together. The library slug, the deploy time and the read
  rate are vars a deploy writes.
- **Dashboards are made by hand.** Custom Dashboards have no API; `docs/dashboards.md` gives each
  chart's dataset and the sentence for **Ask AI**, and the queries for `cdl_events`.
- **The ops MCP's key is a bearer token** (`.keys/ops.key`, made by `npm run ops`) rather than
  Cloudflare Access with OAuth: one operator, one key, and any MCP client that sends a header can
  use it. Access can still be put in front of the host. Ops reaches each library's core over its
  `Internal` entrypoint, never the public API, and stores alerts from a Cloudflare webhook
  destination that `npm run observe` adds to every CDL policy.
- **The weekly digest** goes from the ops Worker to every admin of every library, through Email
  Sending from the first library's address.
- **Each library's admin can ask too.** The library's own MCP (and the page's WebMCP tools) offer
  its admin `library_health`, `job_runs`, `delivery_trace`, `library_numbers` and `run_checks`,
  over `/v1/admin/*` routes that core answers for the library's admin alone. A self-hoster who
  runs one library needs no ops MCP; the operator keeps `cdl-ops` for the whole fleet.
- **Sending Issues to a Claude Code routine** needs a routine of the operator's own, so it is set
  up by hand, as `docs/runbooks/README.md` describes.
