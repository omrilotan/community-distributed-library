# Emails stuck

**From:** Workers Issues, `check.failed emails_stuck`: follow-up emails 15 minutes past their time,
on two checks in a row.

**Means:** members are not getting the emails that follow a push they did not open: loan requests,
answers, reminders.

## First look

```sh
npx wrangler d1 execute <slug>-core --remote -c "$(node scripts/config.mjs <slug> core)" \
  --command "SELECT COUNT(*), MIN(send_after), MAX(attempts) FROM pending_emails WHERE send_after < unixepoch() - 900"
```

- `job_status` for `emails`: is the job running (`last_ok_at` recent) or failing?
- **Observability**, `event` = `job.failed` with `job` = `emails`, or `email.send_failed`.

## Safe now

- If Email Sending is down, nothing: the emails wait and are tried again (15, 30, 60… minutes),
  and are given up after five tries.

## Fix prompt notes

Add after step 1: "Check the Email Sending status for the sender domain first; a sending suspension
is not a code bug. If the emails job is not running at all, start from job-missed.md."
