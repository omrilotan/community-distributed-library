# Loan requests not delivered

**From:** Workers Issues, `check.failed held_notices_stuck`: notices of loan requests 10 minutes
past their time, on two checks in a row.

**Means:** owners are not hearing that somebody asked for their book. Requests wait unanswered.

## First look

```sh
npx wrangler d1 execute <slug>-core --remote -c "$(node scripts/config.mjs <slug> core)" \
  --command "SELECT COUNT(*), MIN(send_at) FROM held_notices WHERE send_at < unixepoch() - 600"
```

- `job_status` for `held-notices`, and **Observability** `event` = `notify.held_notice_failed` or
  `job.failed` with `job` = `held-notices`.

## Safe now

- Nothing is lost while the notices wait: they go when the job works again, if the loan is still a
  request.

## Fix prompt notes

Add after step 1: "Start from sendHeldNotices in services/core/src/notify.ts and the error its job
logged."
