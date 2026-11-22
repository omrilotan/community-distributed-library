# Dashboards

Three views of the libraries, for the operator (docs/observability-plan.md, layer 2). They are for
looking: when something feels wrong, after a fix ships, or once a week. Alerts do not depend on them.

Cloudflare has no API for Custom Dashboards yet, so they are made by hand, once, in **Analytics &
Logs → Dashboards**. Each chart below says which dataset it reads and gives the sentence to type into
the dashboard's **Ask AI** box; check the chart it draws, then save it. The counts from `cdl_events`
are also what the ops tools read, so a question to the ops MCP gives the same numbers.

## Where the numbers come from

| Source                                  | What is in it                                                                 | Kept     |
| --------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Workers Observability — Logs            | Every log event (`event`, `level`, fields) and invocation, sampled per Worker | 7 days   |
| Workers Observability — Traces          | Spans across web → core → notify/convo, sampled per Worker and by trace rules | 7 days   |
| `cdl_events` (Analytics Engine)         | Requests by route, domain events, checks, jobs, the daily snapshot (core)     | 3 months |
| D1, per library (`check_results`, jobs) | The latest check values and job runs, exact                                   | 30 d     |

In `cdl_events`, every count is `SUM(_sample_interval * double4)`: `double4` is our own weight (1
for anything kept in full, `1 / rate` for sampled reads), and `_sample_interval` is Analytics
Engine's. Never `COUNT()`. Distinct counts (members, items) come only from the snapshot points.

The columns: `index1` library, `blob1` kind, `blob2` name, `blob3` outcome, `blob4` surface,
`double2` ms, `double3` value. See `services/core/src/telemetry.ts`.

## 1. Fleet health

Open it when something feels wrong. Filter: Worker name starts with the library's slug, or none for
the whole fleet.

| Chart                         | Dataset       | Ask AI                                                                         |
| ----------------------------- | ------------- | ------------------------------------------------------------------------------ |
| Requests and errors by Worker | Logs          | Invocations per Worker over time, stacked, with errors (outcome not ok) in red |
| Slowest core routes           | Traces        | p50 and p95 duration of root spans on Workers ending in -core, top 10 by p95   |
| Errors by event               | Logs          | Count of logs with level error, grouped by the event field, top 10             |
| Deploys                       | Logs          | Distinct script version per Worker over time                                   |
| CPU and wall time             | Logs          | p95 CPU time and wall time per Worker                                          |
| Browser reports               | `CDL_REPORTS` | Reports by directive and blocked host, last 7 days (see services/reports)      |

Job heartbeats and check results are per library and exact; read them with the ops MCP
(`fleet_status`, `library_health`) or the health route (`/api/v1/health`).

## 2. Delivery

Email, push and webhooks: the part most likely to fail quietly.

| Chart                   | Dataset | Ask AI                                                                                |
| ----------------------- | ------- | ------------------------------------------------------------------------------------- |
| Emails that failed      | Logs    | Count of logs whose event is email.send_failed or email.given_up, per day, by Worker  |
| Push refused            | Logs    | Count of logs whose event is push.rejected or push.failed, per day, grouped by status |
| Jobs that did something | Logs    | Count of job.ran logs per job, per day                                                |
| Jobs that failed        | Logs    | Count of job.failed and job.missed logs, grouped by job                               |
| Checks failing          | Logs    | Count of check.failed logs, grouped by check and level                                |

From `cdl_events`, through the SQL API or `query_events`:

```sql
-- Checks failing now, per library: the last run's value (they run every 15 minutes).
SELECT index1 AS library, blob2 AS check, max(double3) AS value
FROM cdl_events
WHERE blob1 = 'check' AND timestamp > NOW() - INTERVAL '16' MINUTE
GROUP BY library, check
HAVING value > 0
```

## 3. Libraries

The light business view: counts only, never people. From the daily snapshot in `cdl_events`.

```sql
-- One library's numbers, day by day.
SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob2 AS metric, max(double3) AS value
FROM cdl_events
WHERE blob1 = 'snapshot' AND index1 = 'our-street'
  AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY day, metric
ORDER BY toStartOfInterval(timestamp, INTERVAL '1' DAY)
```

The metrics: `members`, `members_active_7d`, `members_active_30d`, `items`, `items_lendable`,
`items_on_loan`, `loans_overdue`, `requests_7d`, `requests_agreed_7d`, `answer_median_s`,
`invites_7d`, `asks_7d`, `asks_taken_7d`.

```sql
-- How members reach the library: the app, the API, assistants.
SELECT index1 AS library, blob4 AS surface, SUM(_sample_interval * double4) AS requests
FROM cdl_events
WHERE blob1 = 'request' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY library, surface
```

## Sampling

Ordinary reads are counted at `READS_SAMPLE_RATE` (from `sampling.core.reads` in the manifest;
empty is all), and every one of them for an hour after a deploy or while `samplingBoostUntil` is set
on a library. Errors, slow requests, writes, sign-in, assistants' calls, domain events, checks, jobs
and the snapshot are always kept, weight 1.
