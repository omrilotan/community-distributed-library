# Observability

This document explains how the running libraries are watched, and why each signal, check, alert and
sampling rule exists. The reader is a contributor, or the **operator**: the person who runs one or
more libraries. Moderators already have `/v1/admin/*` for their own community; this document is
about the system under it.

It covers the per-library Workers (`<slug>-web`, `-core`, `-mcp`, `-notify`, `-convo`) and the
shared ones (`cdl-metadata`, `cdl-reports`, `cdl-landing`, and `cdl-ops` once it is set up). It does
not cover CI or the video. To set it all up, see [self-hosting.md](self-hosting.md), "When something
goes wrong".

## What we want to know

Three questions, in order of importance:

1. **Is any library broken for its members?** A member cannot sign in, cannot ask for a loan, or
   does not hear about a request.
2. **Is any library quietly wrong?** Every response is a 200, but the outcome is wrong: an email was
   never sent, a backup did not run, a thread was not purged after 90 days, or a copy shows as
   shelved while it is out on loan. This is the main risk for a codebase written mostly with an
   assistant, because nothing fails loudly.
3. **Is each library alive as a community?** Members, items, loans and answer times. These are
   counts only, never people.

Every alert answers one of these questions, or it does not exist.

## Principles

- **Cloudflare first.** Use what the account already has (Workers Logs, Traces, Issues, Analytics
  Engine, the Analytics SQL binding) before building anything. No third-party vendor.
- **Privacy is a hard limit.** Telemetry carries ids and counts, never names, emails, meeting
  places, message text or search terms. A request is named by its route, never its URL, and query
  strings are left out of logs and traces. This matches what the app promises (snapped location, no
  pins, 90-day thread purge).
- **Absence is a signal.** Every scheduled job records that it ran. A missed run raises an alert, as
  a failed one does.
- **Alert on counts, not rates.** A library has tens of members. A check counts rows that should not
  exist and fires when the count is above 0. A rate or an anomaly alert would misfire at this
  traffic.
- **Sample by value, never uniformly.** Signals that are rare and matter (errors, slow requests,
  writes, checks, jobs, domain events, delivery) are always kept in full. Signals that are frequent
  and alike (fast successful reads, static assets) are sampled, and each kept point carries its
  weight, so counts can be rebuilt. Alerts read only what is kept in full (see 1.6).
- **No trace, no fix.** A fix starts from a log line, trace or check value. An assistant proposes a
  change. A person reviews it and deploys it. CI does not deploy.
- **Few alerts, each with a runbook.** Urgent alerts go to email straight away. Everything else goes
  into a weekly digest.

## Layer 1: signals

### 1.1 Switching on platform features

Every Worker's `wrangler.jsonc` template has the same block, so a deploy carries it to every
library:

```jsonc
"observability": {
	"enabled": true,
	"redact_query_string": true,
	"logs": { "invocation_logs": true },
	"traces": { "enabled": true },
	"issues": { "enabled": true }
},
"upload_source_maps": true
```

`scripts/libraries.mjs` adds `head_sampling_rate` to `logs` and `traces` for each Worker when it
writes the deployed config (see 1.6). It turns traces off when the traces rate is 0.

- **Logs** are Workers Logs, kept for 7 days.
- **Traces** are sampled by the Worker's rate, and by trace rules that always trace the requests
  that matter most (see 1.6).
- **Issues** groups uncaught exceptions, 5xx responses and `console.error` calls into issues. Layer
  3 turns each new Issue into an email.
- **Source maps** are uploaded for every Worker with code (not the static landing page), so stack
  traces name `src/` files, not the bundle.
- **Query-string redaction** keeps search terms (`?q=`) out of Workers Logs at any rate.

### 1.2 Structured log events

The Workers in `services/` do not call `console` directly. They call `log` from
`packages/contracts/src/telemetry.ts`:

```ts
log.error("job.failed", { key: job, job, ms, runbook }, error);
log.warn("check.failed", { key: check, check, value });
log.info("job.ran", { job, ms, result });
```

Each call writes one JSON object, `{ event, level, ...fields }`. Workers Logs indexes the fields, so
the query builder can filter and group by `event`. Event names are `area.verb`.

- `log.error` goes through `console.error` with the event as its message, so Issues keeps seeing
  errors. When the fields hold a `key`, the message is `<event> <key>` (`job.missed backup`,
  `check.failed emails_stuck`), so Issues keeps one Issue for each job and each check, not one for
  the whole event.
- Errors that name a runbook carry it in the `runbook` field, so an Issue points to its page in
  [docs/runbooks](runbooks/README.md).
- `scripts/check-logs.mjs` runs as part of `npm test`. It fails on a bare `console.*` call in
  `services/*/src` and `packages/contracts/src`, and on a runbook that a Worker names but that does
  not exist. A line meant for development only says so in a `telemetry:` comment just above it.
- Workers Logs adds the Worker name and its script version (`$metadata.scriptVersion`) to every
  event, so error spikes can be lined up with releases. See [expectations.md](expectations.md).

### 1.3 Job heartbeats

`runJob` in `packages/contracts/src/telemetry.ts` wraps every scheduled job. It never throws, so one
failing job does not stop the others in the same cron. It records each run in the library's D1, and
logs `job.ran` or `job.failed`.

- `job_status` holds one row per job, updated on every run: when it first ran, last ran well, last
  failed, and how many runs and failures it has had.
- `job_runs` holds a history, kept for 30 days: every run of a daily job and every failed run of any
  job. The every-minute jobs do not write a row a minute. They log `job.ran` only when they did
  something.
- If the record itself cannot be written, the job still counts as run, and `job.unrecorded` is
  logged as an error.

Core and convo each keep their own tables. `services/core/src/jobs.ts` and
`services/convo/src/index.ts` hold each Worker's schedule: the longest a job may go without a good
run.

| Worker | Job               | Cron               | Late after  |
| ------ | ----------------- | ------------------ | ----------- |
| core   | `webhooks`        | every minute       | 10 minutes  |
| core   | `held-notices`    | every minute       | 10 minutes  |
| core   | `emails`          | every minute       | 10 minutes  |
| core   | `reminders`       | 08:00 UTC          | 26 hours    |
| core   | `backup`          | 03:20 UTC          | 26 hours    |
| core   | `revoke-consents` | 03:20 UTC          | 26 hours    |
| core   | `rehost-covers`   | 03:20 UTC          | 26 hours    |
| core   | `snapshot`        | 03:20 UTC          | 26 hours    |
| core   | `checks`          | every 15 minutes   | 40 minutes  |
| convo  | `purge-threads`   | 04:15 UTC          | 26 hours    |
| ops    | `digest`          | Mondays, 08:00 UTC | not watched |

Every 15 minutes, core compares each job's last good run with its schedule (`reportLate`). A late
job logs `job.missed` as an error, with the job as its `key`. A job with no row yet counts as late
only once jobs have been recorded for longer than its schedule allows, so a library that has just
opened does not raise an alarm.

The same state feeds `/v1/health` (see Layer 3) and the ops tools. The ops Worker records its own
`digest` job in its own database, but nothing checks that job against a schedule.

### 1.4 Invariant checks

`services/core/src/checks.ts` holds the checks. Each one is a count that should be 0. They run every
15 minutes, from the every-minute cron (`minute % 15 == 0`), as the job `checks`. Every query must
be index-backed, because each runs 96 times a day for each library.

For each run, a check:

- keeps its result in `check_results` (value, previous value, severity, and `failing_since`);
- writes a `check` point to `cdl_events` (see 1.5);
- logs `check.failed` when it fails: at `error` for a `critical` check, so it becomes an Issue, at
  `warn` for a `warn` check, and at `info` for an `info` check.

A check marked `twice` fails only when the previous run also found more than 0, because a queue can
be busy once. A check that cannot run logs `check.broken` as an error, so a broken check is never
taken for a pass.

| Check                  | Counts                                                                                       | Severity | Twice |
| ---------------------- | -------------------------------------------------------------------------------------------- | -------- | ----- |
| `sign_in_mail_failing` | sign-in emails that failed, in the last hour (from `tallies`)                                | critical |       |
| `emails_stuck`         | `pending_emails` due more than 15 minutes ago                                                | critical | yes   |
| `held_notices_stuck`   | `held_notices` due more than 10 minutes ago                                                  | critical | yes   |
| `backup_missing`       | 1 when `d1/<today>.sql` is not in the backups bucket (before 04:00 UTC, yesterday's will do) | critical |       |
| `threads_past_purge`   | convo threads closed over 91 days ago (90 days, plus a day's grace), still present           | critical |       |
| `emails_given_up`      | emails given up after retries, in the last 24 hours (from `tallies`)                         | warn     |       |
| `webhooks_failing`     | `webhook_deliveries` with `status = 'failed'`, in the last 24 hours                          | warn     |       |
| `copy_loan_mismatch`   | copies whose state disagrees with an active loan (on loan with no loan, or shelved but lent) | warn     |       |
| `loan_no_handoff`      | loans agreed more than 14 days ago with no handoff proposed                                  | warn     |       |
| `tokens_abandoned`     | assistant consent codes that expired over 2 days ago, never redeemed, token not revoked      | warn     |       |
| `covers_external`      | covers older than 2 days that are still on another site                                      | warn     |       |
| `push_gone`            | push subscriptions that browsers threw away, in the last 24 hours (from `tallies`)           | info     |       |

Notes on single checks:

- `backup_missing` returns 0 for a library that opted out of backups (it has no bucket), and for a
  library opened less than a day ago.
- `threads_past_purge` asks convo (`checks()` over the service binding). Convo purges threads 90
  days after their loan closed, and the check allows a day's grace. An older convo without the call
  gives 0.
- Some outcomes leave no row to count: a sign-in email that did not go, an email given up, a push
  thrown away. `services/core/src/tallies.ts` counts them by the hour in `tallies` (kept 30 days),
  and the checks read from there. Tallies hold counts only, never who.

`copy_loan_mismatch` and `loan_no_handoff` are the "quietly wrong" checks. They catch a handler that
returned 200 but updated only half of what it should have. When a bug like that is found, add a
check for it as well as the fix. [expectations.md](expectations.md) lists what each check protects,
who is hurt when it fails, and how long a failure can wait.

### 1.5 The Analytics Engine events dataset

`cdl_events` is the counter store for dashboards and for the ops MCP. One dataset serves every
library. Core is the only Worker that writes to it, and nothing reads it on a request path.
`services/core/src/telemetry.ts` documents the columns:

| Column    | Holds                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `index1`  | library slug                                                                                                                |
| `blob1`   | kind: `request`, `domain`, `check`, `job` or `snapshot`                                                                     |
| `blob2`   | name: the route as declared (`GET /v1/loans/:id`), the event (`loan.requested`), the check, the job, or the snapshot metric |
| `blob3`   | outcome: `2xx`, `4xx`, `5xx`, or `ok`, `failed`                                                                             |
| `blob4`   | surface: `web`, `api`, `mcp`, `webmcp` or `cron`                                                                            |
| `double1` | 1, one point                                                                                                                |
| `double2` | duration in ms                                                                                                              |
| `double3` | value (a check's count, a snapshot's number)                                                                                |
| `double4` | weight: 1 divided by the share kept. Count with `SUM(double4)`, never `COUNT()`.                                            |

How each kind is written:

- **Request** points come from one Hono middleware in core. It names a request by its matched route
  (`unmatched` if none), never its URL, so ids and search terms stay out. The surface comes from the
  `x-cdl-surface` header, which the web app and the MCP set on every call to core. A call with no
  valid surface counts as `api`.
- **Domain** points come from the event emitter in `events.ts`, once for each event kind
  (`copy.listed`, `loan.requested`, `handoff.confirmed` and the others), so every webhook event is
  also counted.
- **Check** points come from `runChecks`, with the count in `double3`.
- **Job** points come from core's jobs, with the duration. Convo's job is recorded in convo's own
  database only.
- **Snapshot** points come from the daily `snapshot` job. See 1.6.

Writing a point never fails a request: if the dataset is missing or its buffer is full, the point is
lost and the work goes on. [dashboards.md](dashboards.md) shows how to query the dataset (counts use
`SUM(_sample_interval * double4)`), and how long each source is kept. The `cdl-reports` Worker has
its own dataset, `CDL_REPORTS`, for CSP violations and network error reports.

### 1.6 Sampling

Cloudflare samples at the head: the keep-or-drop decision is made when a request arrives, before
anyone knows whether it will fail or be slow. A request dropped by `head_sampling_rate` loses all
its logs, its `console.error` included. The work is therefore split in two:

- **The platform head rate** decides which requests get Cloudflare's full record (invocation log,
  traces). It is a cost dial, set per Worker.
- **Our own code** decides what is always recorded, after the outcome is known. These records go
  where a head rate cannot drop them: D1 (`job_status`, `job_runs`, `check_results`, `tallies`, the
  delivery tables) and `cdl_events`.

**Platform head rates.** `SAMPLING` in `scripts/libraries.mjs` sets the defaults:

| Worker                       | Logs rate | Traces rate |
| ---------------------------- | --------- | ----------- |
| `<slug>-notify`, `-mcp`      | 1         | 1           |
| `<slug>-core`, `-convo`      | 1         | 0.25        |
| `<slug>-web`, `cdl-metadata` | 0.25      | 0.05        |
| `cdl-reports`, `cdl-landing` | 0.1       | 0           |
| `cdl-ops`                    | 1         | 1           |

Workers whose logs carry the errors and the delivery steps keep every request. Workers that mostly
serve static files or cache hits keep a share. The manifest changes any rate, for the whole fleet
(`sampling`) or for one library (`libraries[].sampling`). `libraries.example.json` shows both, and
[self-hosting.md](self-hosting.md) says how. A deploy writes the rates, so every change is in the
manifest, not in a dashboard.

**Trace rules.** `npm run observe` sets zone rules that trace a request in full whatever the
default:

- signing in, joining and connecting (`/login`, `/auth`, `/join`, `/oauth`, `/api/v1/auth`);
- writes to loans and handoffs (`/loans`, `/api/v1/loans`, `/api/v1/handoffs`, any method except
  `GET` and `HEAD`);
- assistants signing in (`/authorize`, `/token`, `/register` on `mcp.<host>`);
- any request that carries the header `x-cdl-trace` with the operator's key (`.keys/trace.key`). The
  key is secret, so nobody else can raise the cost.

If tracing is off for a zone, the script turns it on with a default rate of 0, so only these rules
trace.

**Always kept in `cdl_events` (weight 1).** The request middleware keeps a point whatever the read
rate when the request is:

- a 5xx response;
- slow: over 1 second, or over 1.5 seconds on a route ending in `/search`;
- a write (any method except `GET` and `HEAD`);
- from the MCP surface (assistant traffic is new and small, and the surface we least understand);
- sign-in, tokens, OAuth, invites, consent or joining (paths under `/v1/auth`, `/v1/tokens`,
  `/v1/oauth`, `/v1/invites`, `/v1/consent` and `/v1/join`).

Domain events, checks, jobs and the snapshot are never sampled.

**Sampled.** Fast successful reads are kept at the read rate, `READS_SAMPLE_RATE`. It is `reads`
under `sampling.core` in the manifest. An empty value keeps every read. Each kept point has weight
`1 / rate`.

- The read rate is 1 for 60 minutes after a deploy (core's `DEPLOYED_AT` var), so a regression shows
  in full in the first hour.
- The **incident boost**: while the library's `samplingBoostUntil` time in the manifest has not
  passed, every read is kept. It takes a deploy of the library's core to set it, and it turns itself
  off at the set time.
- **One visit is kept or dropped as a unit.** The web app sets `x-cdl-request` to the visitor
  request's `cf-ray`. Core hashes that id and compares it with the rate, so every point from one
  page view is kept or dropped together. Without the header, core uses `cf-ray`, then a random id.

**Distinct counts are never taken from sampled data.** Sampling breaks "how many members were
active". The `snapshot` job counts members, items, loans and the other community numbers exactly
from D1 each night, and writes them as `snapshot` points with weight 1. The metrics are listed in
[dashboards.md](dashboards.md). Sampled points are used only for volumes, rates and latency.

**Errors are never only in a sampled store.** A 5xx response is always kept in `cdl_events`, and a
failed job or check is in D1. Alerts read only these.

**Rates are reviewed, not guessed.** The ops tool `sampling_status` (Layer 4) reports each library's
configured rates, and its points per day in `cdl_events` by kind, with the share kept in full.

## Layer 2: Cloudflare dashboards

Three Custom Dashboards, for looking: when something feels wrong, after a fix ships, or once a week.
Alerts do not depend on them.

1. **Fleet health**: requests and errors, slowest core routes, errors by event, deploys, browser
   reports.
2. **Delivery**: email, push and webhooks, the part most likely to fail quietly.
3. **Libraries**: the light business view, counts only.

Cloudflare has no API for Custom Dashboards, so each is made by hand, once.
[dashboards.md](dashboards.md) gives every chart's dataset, the sentence for the dashboard's **Ask
AI** box, and the queries for `cdl_events`. Job heartbeats and check results are exact and per
library, so they are not charts. Read them with the ops MCP (`fleet_status`, `library_health`) or
the health route.

## Layer 3: alerts

Alerts read only what is kept in full: D1 check results and job records, Issues, and the outside
probe. A lowered sampling rate can never hide an alert, or fire one by accident.

**Workers Issues.** An Issue is Cloudflare's grouping of failures: uncaught exceptions, 5xx
responses and `console.error` calls. `npm run observe` sets up, for every Worker of every library
and for the shared ones:

- an alert policy, "CDL: `<slug>`: a Worker is failing" (and one for the shared Workers), of type
  `workers_observability_real_time_issue`;
- one Issues automation for each Worker, set to fire on the first occurrence of an Issue. An account
  can hold 50 automations; the script stops and says so if a fleet needs more.

An Issue emails once, on its first occurrence. It does not repeat while it stays open; resolving it
re-arms it ([expectations.md](expectations.md), open decision 3).

**Who is told.** A library's admins hear about their own library's Workers. Every admin hears about
the shared Workers and about certificates. The operator, the manifest's `owner.email` or else
`alerts.email`, hears about everything. Cloudflare sends one alert to at most 20 addresses.

**The ops relay.** Cloudflare cannot filter Issues by type. When the ops Worker is set up, the
failure policies post only to its `/alerts` inbox, which checks the shared secret
(`.keys/alerts.key`), keeps the alert for 90 days, and sends the email itself. It skips Cloudflare's
"Potential vulnerability scan" Issues, which are bots probing for weak spots. The Monday digest
counts those instead. Without the ops Worker, Cloudflare emails every failure itself. The email
links to a runbook and names the ops tool `explain_alert`.

**Certificates.** A second policy, of type `universal_ssl_event_type`, emails when a library's
address may stop working over HTTPS. It comes straight from Cloudflare.

**The outside probe.** Cloudflare cannot say that Cloudflare itself is unreachable, nor that a job
stopped altogether. `.github/workflows/probe.yml` runs `scripts/probe.mjs` every 15 minutes from
GitHub. For each library it asks for `/`, `/api/v1/health` and
`mcp.<host>/.well-known/oauth-authorization-server`. On a failure it asks again a minute later. If
it fails twice, it opens, or comments on, a GitHub issue labelled `library-down`, and it closes that
issue when every library answers again. The hosts come from the repository variable
`CDL_LIBRARY_HOSTS`, which `npm run observe` sets with the GitHub CLI, because the manifest is not
in git. `npm run probe` asks the same from your own computer. The workflow only reads: CI does not
deploy.

**The health route.** Core answers `/v1/health` (`/api/v1/health` through the web app) with whether
its database, images bucket, notify Worker and convo Worker answer, and a list of late jobs. It
answers 503 when anything is wrong. It names parts and jobs only, never data.

**Weekly digest.** Every Monday at 08:00 UTC, the ops Worker emails one message to every admin of
every library, from the first library's address. For each library it lists failing parts, late jobs,
every check with a value above 0, the week's alerts, and one line of the latest snapshot numbers. It
adds a count of scanner probes. A quiet week says so in one line.

### Alert list

Each alert has a page in [docs/runbooks](runbooks/README.md): what it means for members, where to
look first, what is safe to do straight away, and a prompt for Claude Code.

| Alert                         | Source                                                             | Fires when                                                       | Level  |
| ----------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | ------ |
| A library is not working      | the outside probe (GitHub issue)                                   | a probe request fails twice in a row, a minute apart             | urgent |
| A Worker is failing           | Workers Issues, through the ops relay                              | a new Issue on any Worker, on its first occurrence               | urgent |
| Members cannot sign in        | check `sign_in_mail_failing`, as the Issue `check.failed`          | more than 0 failed sign-in emails in the last hour               | urgent |
| Emails stuck                  | check `emails_stuck`                                               | more than 0, on two runs in a row                                | urgent |
| Loan requests not delivered   | check `held_notices_stuck`                                         | more than 0, on two runs in a row                                | urgent |
| Backup missing                | check `backup_missing`                                             | no snapshot for today (or yesterday, before 04:00 UTC)           | urgent |
| Privacy purge behind          | check `threads_past_purge`                                         | more than 0                                                      | urgent |
| A job missed or failed        | the Issue `job.missed <job>` or `job.failed <job>`                 | no good run within the "late after" time in 1.3, or a run throws | urgent |
| Data drift                    | weekly digest (`copy_loan_mismatch`, `loan_no_handoff`)            | more than 0                                                      | digest |
| Delivery degraded             | weekly digest (`emails_given_up`, `webhooks_failing`, `push_gone`) | more than 0                                                      | digest |
| Jobs that do not finish       | weekly digest (`tokens_abandoned`, `covers_external`)              | more than 0                                                      | digest |
| A certificate needs attention | Cloudflare policy `universal_ssl_event_type`                       | Cloudflare raises it                                             | urgent |

"Urgent" means an email at the first occurrence. "Digest" means the Monday email: the check logs at
`warn` or `info`, which is not an Issue.

### Every alert carries a fix prompt

A runbook gives a ready prompt for Claude Code in this repository.
[runbooks/README.md](runbooks/README.md) holds the template, what an agent may do alone, what it
must ask first, and how to send Issues to a Claude Code routine (set up by hand, because the routine
is the operator's own). The ops tool `explain_alert` fills the same prompt from the evidence. The
prompt starts from the evidence, and stops if the evidence does not point to a cause.

## Layer 4: asking questions (ops MCP)

The operator needs to ask things like "is anything wrong with our-street?", "did every backup run
this week?", "why did Dana not get the request email yesterday?", "which library is growing?".

`cdl-ops` is a shared Worker, `services/ops`, at `ops.<domain>/mcp`. `npm run ops` makes its
database and its two keys, and deploys it. It answers in the terms of the product (a library, a job,
a check, a loan, an alert), not as log rows.

- **Auth:** operator only, by the key in `.keys/ops.key`, which is separate from every member and
  moderator token. An MCP client sends it as the bearer token, or, if it connects with OAuth
  (Claude on the web, desktop and mobile), the operator types it once on the ops host's sign-in
  page (`services/ops/src/signin.ts`) and the client gets a grant. An `admin` scope on a library is
  not operator access.
- **Reads from:**
  - `cdl_events`, through the Analytics SQL binding (`ANALYTICS_SQL`), which needs no API token in
    the Worker.
  - Each library's core, through a service binding to its `Internal` entrypoint, never the public
    API. The bindings are generated from the manifest. What core answers is in
    `services/core/src/ops.ts`: counts, ids and statuses, and the admins' addresses for the digest
    only.
  - Its own D1, `cdl-ops`: the alerts that Cloudflare posted, for 90 days.
- **Writes:** none to any library, except `run_check` and `take_backup`. Both are safe, and both
  need `confirm: true`, which an assistant sets only after the operator agrees. No tool changes
  member data or deploys.

| Tool                                | Answers                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `fleet_status()`                    | Each library: whether it works, failing parts, late jobs, failing checks, overdue queues, alerts this week                    |
| `library_health(slug)`              | One library in depth: parts, every check and job, delivery queues, and the last day's requests by outcome and slowest routes  |
| `list_alerts(days?, slug?)`         | The alerts Cloudflare sent, newest first                                                                                      |
| `explain_alert(id)`                 | The alert, the library's failing checks and late jobs now, the runbook, and the filled fix prompt                             |
| `job_runs(slug, job?, days?)`       | "Did every backup run this week?"                                                                                             |
| `delivery_trace(slug, loan_id)`     | "Why did this owner not hear of the loan?": the loan's events, held notice and webhook deliveries, by ids, times and statuses |
| `query_events(sql)`                 | One read-only `SELECT` over `cdl_events`, at most 1000 rows                                                                   |
| `library_trends(slug?, weeks?)`     | Members, items, loans, requests, answer time, invites and asks, week by week, from the snapshot                               |
| `compare_libraries(metric, weeks?)` | Which library is growing or slowing, for one snapshot metric                                                                  |
| `recent_deploys()`                  | When each library's core was last deployed                                                                                    |
| `sampling_status()`                 | Each library's configured rates, and its points per day by kind with the share kept in full                                   |
| `run_check(slug, check?, confirm?)` | Runs one check, or all, now, and keeps the result                                                                             |
| `take_backup(slug, confirm?)`       | Takes the database snapshot now; it replaces today's                                                                          |

`delivery_trace` takes a loan id, never an email address, so an assistant can follow one loan's
notification path without the telemetry ever holding the person.

**Each library's admin can ask too.** The library's own MCP (`packages/tools/src/admin.ts`) offers
its admin `library_health`, `job_runs`, `delivery_trace`, `library_numbers` and `run_checks`, over
`/v1/admin/*` routes that core answers for the library's admin alone. A self-hoster who runs one
library needs no ops MCP. The operator keeps `cdl-ops` for the whole fleet.

An example. The operator asks "anything I should look at?". The assistant calls `fleet_status`, sees
that `emails_stuck` has failed for one library, then calls `explain_alert`. It answers with the
check's value and when it began failing, the late jobs, the runbook to read, and the fix prompt.

## Not built

The first plan for this work had these parts. The code does not have them.

- **Cloudflare Monitors.** Monitors had no public API when this was built, and `npm run observe`
  sets everything up through the API. Each alert that a Monitor was to raise is an error the code
  logs instead, and Issues turns it into an email (1.2, Layer 3). For the same reason there is no
  `docs/monitors/*.sql` and no `scripts/monitors.mjs`.
- **Cloudflare Access on the ops host.** There is one operator and one key: a client sends it as a
  header, or signs in with it through the ops host's own OAuth.
- **`/v1/ops/checks`, `/v1/ops/jobs` and `/v1/ops/delivery` in core.** Ops calls core's `Internal`
  entrypoint instead (`opsStatus`, `opsJobRuns` and the others).
- **Alerts on `cdl_events`.** No alert reads the dataset. There is no 5xx-burst alert (a 5xx
  response raises an Issue instead), no slow-route alert, no alert for a new CSP directive or host,
  and no quiet-library alert.
- **A spend alert, and other Platform Notifications.** `npm run observe` sets up the Issues and
  certificate policies only.
- **Sampling of `cdl-reports` and `cdl-metadata` points.** Reports are written one for one, and
  `cdl-metadata` has only its head rates. The rules for distinct reports and for cache hits do not
  exist.
- **A per-Worker daily event budget** in the manifest, a suggested rate in `sampling_status`, and a
  digest line for a Worker over its budget.
- **Looking up a delivery by member.** `delivery_trace` takes a loan id. There is no hashed member
  id and no "copy support id" on the moderator's member page.
- **A routine for `fixable` checks.** Checks have no `fixable` mark. Only Issues can be sent to a
  Claude Code routine, and that is set up by hand.
- **A fixed `library` and `version` in every log event.** The events carry `event`, `level` and
  their own fields. The Worker name and version come from Workers Logs.

## Costs and limits to watch

- Workers Logs and traces are kept for 7 days. `cdl_events` is kept for 3 months
  ([dashboards.md](dashboards.md)).
- Analytics Engine samples adaptively at volume, on top of our own sampling. The SQL API applies its
  own `_sample_interval`; ours is in `double4`. Counts use `SUM(_sample_interval * double4)`. This
  is fine for trends. Do not use it to count single events exactly: the checks and `delivery_trace`
  read D1 for that.
- Analytics SQL needs a time range in every query, and does not allow `ORDER BY` once a query names
  columns with `AS`.
- Every check is a D1 query every 15 minutes for each library. Each must be index-backed. Add any
  missing index in the same migration that adds the check.
- An account can hold 50 Issues automations, and one alert goes to at most 20 addresses.
- Lower a sampling rate only for a stream that is not kept in full.

## Open questions

- Should urgent alerts reach the operator beyond email, for example as a push to their own phone (a
  library already does Web Push) or a chat webhook?
- Does Issues still see a failure in a request that a head rate dropped? Core, notify, mcp and convo
  keep logs at 1 until this is tested.
- Should Cloudflare Access be put in front of the ops host, as well as the bearer token?
- Alert acknowledgement and a few other decisions are open in [expectations.md](expectations.md).
