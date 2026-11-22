# Runbooks

One page for each alert (docs/observability-plan.md, layer 3). Each says what the alert means for
members, where to look first, what is safe to do straight away, and gives a prompt for Claude Code
in this repository to find and fix the cause.

| Alert                         | How it reaches you                                       | Runbook                                            |
| ----------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| A library is not working      | GitHub issue from the outside probe                      | [library-down.md](library-down.md)                 |
| A Worker is failing           | Email from Workers Issues                                | [new-failure.md](new-failure.md)                   |
| Members can't sign in         | Issue `check.failed sign_in_mail_failing`                | [sign-in-mail-failing.md](sign-in-mail-failing.md) |
| Emails stuck                  | Issue `check.failed emails_stuck`                        | [emails-stuck.md](emails-stuck.md)                 |
| Loan requests not delivered   | Issue `check.failed held_notices_stuck`                  | [held-notices-stuck.md](held-notices-stuck.md)     |
| A job missed or failed        | Issue `job.missed <job>`, `job.failed <job>`             | [job-missed.md](job-missed.md)                     |
| Backup missing                | Issue `check.failed backup_missing`                      | [backup-missing.md](backup-missing.md)             |
| Privacy purge behind          | Issue `check.failed threads_past_purge`                  | [threads-past-purge.md](threads-past-purge.md)     |
| Data drift                    | Weekly digest (`copy_loan_mismatch`, `loan_no_handoff`)  | [data-drift.md](data-drift.md)                     |
| Delivery degraded             | Weekly digest (`emails_given_up`, `webhooks_failing`, …) | [delivery-degraded.md](delivery-degraded.md)       |
| A certificate needs attention | Email from Cloudflare                                    | [certificate.md](certificate.md)                   |

Every error a Worker logs names its runbook in the `runbook` field, so the Issue's diagnostic
context points here.

## Looking at a library

Most first looks are a query against one library's database. With the token loaded
(`set -a; . ./.env; set +a`):

```sh
npx wrangler d1 execute <slug>-core --remote -c "$(node scripts/config.mjs <slug> core)" \
  --command "SELECT name, value, previous_value, failing_since FROM check_results WHERE value > 0"
npx wrangler d1 execute <slug>-core --remote -c "$(node scripts/config.mjs <slug> core)" \
  --command "SELECT job, last_ok_at, last_failed_at, runs, failures FROM job_status"
curl -s https://<host>/api/v1/health
npm run probe
```

Logs: **Workers & Pages → Observability**, filter `$metadata.service` = `<slug>-core` and `event`.
The ops MCP answers the same questions in words (`fleet_status`, `library_health`,
`explain_alert`).

## The fix prompt

Paste this into Claude Code in this repository, with the evidence filled in. The runbook for the
alert adds its own notes after step 1.

```text
Alert {{alert}} fired for library {{slug}} at {{time}}.
Evidence: {{trace id, Issue link, or check name and value}}.
Recent log events: {{the last 20 matching events, fields only}}.

1. Reproduce from the evidence before changing anything. Pull the library's database with
   `npm run db:pull -- core --library {{slug}}` if the data matters, and write a failing test
   (vitest in workerd, against the migrated D1) that shows the fault.
2. Fix at the narrowest layer. Do not widen scope.
3. If the fault was a silent wrong outcome, add or tighten a check in services/core/src/checks.ts
   so it is caught next time.
4. Run npm run typecheck, npm test and npm run format.
5. Open a draft PR that names the evidence. Do not deploy.
If the evidence does not point to a cause, stop and say so. Do not guess a fix.
```

**No trace, no fix.** Without a log line, trace or check value to start from, the prompt stops
rather than guesses.

## Sending Issues to Claude Code

Workers Issues can hand a new Issue to a Claude Code routine, which gets the issue summary and its
diagnostic context. It needs a routine of yours, so it is set up by hand:

1. Make a routine in Claude Code with an API trigger
   ([how](https://code.claude.com/docs/en/routines#add-an-api-trigger)), on this repository, with
   the fix prompt above as its instructions and "quote a trace or log id in the PR; without one,
   stop and report" added.
2. In Cloudflare, **Workers & Pages → Issues → Automations → Add automation**: trigger on the first
   occurrence, destination **Claude Code**, with the routine's id and token.

Keep it to the Workers whose failures you want a draft PR for. The routine opens a draft PR; a
person reviews and deploys it. CI never deploys.
