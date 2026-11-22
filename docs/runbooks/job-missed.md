# A job missed or failed

**From:** Workers Issues, `job.missed <job>` (no good run for longer than its schedule allows) or
`job.failed <job>` (a run threw).

**Means:** by job:

| Job               | Runs              | Late after | When it stops                                 |
| ----------------- | ----------------- | ---------- | --------------------------------------------- |
| `webhooks`        | every minute      | 10 min     | Webhooks are not delivered or retried         |
| `held-notices`    | every minute      | 10 min     | Owners do not hear of loan requests           |
| `emails`          | every minute      | 10 min     | Follow-up emails do not go                    |
| `checks`          | every 15 minutes  | 40 min     | Nothing notices a library going quietly wrong |
| `reminders`       | 08:00 UTC         | 26 h       | No due, overdue or unanswered reminders       |
| `backup`          | 03:20 UTC         | 26 h       | No nightly snapshot                           |
| `revoke-consents` | 03:20 UTC         | 26 h       | Uncollected assistant connections stay        |
| `rehost-covers`   | 03:20 UTC         | 26 h       | Covers stay on other sites                    |
| `snapshot`        | 03:20 UTC         | 26 h       | The day's library numbers are missing         |
| `purge-threads`   | 04:15 UTC (convo) | 26 h       | Conversations are kept past 90 days           |

## First look

```sh
npx wrangler d1 execute <slug>-core --remote -c "$(node scripts/config.mjs <slug> core)" \
  --command "SELECT * FROM job_runs WHERE job = '<job>' ORDER BY started_at DESC LIMIT 5"
```

- Every job late at once: the cron stopped. Check **`<slug>-core` → Settings → Triggers**, and
  that the last deploy kept the crons (`npm run check:libraries`).
- One job failing: **Observability**, `event` = `job.failed`, `job` = `<job>`, for the error.

## Safe now

- Redeploying core puts its crons back: `npm run deploy -- <slug> core`.
- A backup can be taken now: as an admin, `POST /api/v1/admin/backup`. The other daily jobs
  catch up on their next run; nothing they do is lost by waiting a day.

## Fix prompt notes

Add after step 1: "Read job_runs for the failing runs' detail and the job.failed log's error."
