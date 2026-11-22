# A Worker is failing

**From:** Workers Issues, emailed to the library's admins (shared Workers: every admin). It fires
the first time a new kind of failure happens on a Worker: an uncaught exception, a 5xx answer, or an
error the code logged.

**Means:** depends on the event. The Issue's message is the event name, such as `request.failed`,
`email.send_failed` or `check.failed emails_stuck`. Events that have their own runbook name it in
their `runbook` field.

## First look

- Open the Issue from the email: the occurrences, the stack trace (source-mapped to `src/`), and
  the request or cron that failed.
- **Observability**, filter `event` = the Issue's event and the Worker: how often, since when, and
  the version (`$metadata.scriptVersion`) it started with.
- A failure that started with a deploy: compare with `git log` for that day.

## Safe now

- If one deploy broke it, roll that Worker back: **Workers & Pages → `<slug>-<worker>` →
  Deployments → Rollback**, then fix forward.
- Resolve the Issue once it is fixed and deployed; if it comes back, Issues says so.

## Fix prompt notes

Add after step 1: "Quote the Issue's stack trace and the first occurrence's time. Find the commit
that changed that code most recently."
