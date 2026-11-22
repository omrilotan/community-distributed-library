# Privacy purge behind

**From:** Workers Issues, `check.failed threads_past_purge`: conversations of loans closed more than
91 days ago are still in `<slug>-convo`.

**Means:** the library keeps messages longer than members were promised (90 days). Treat it as a
privacy incident.

## First look

```sh
npx wrangler d1 execute <slug>-convo --remote -c "$(node scripts/config.mjs <slug> convo)" \
  --command "SELECT COUNT(*), MIN(closed_at) FROM threads WHERE closed_at < unixepoch() - 91 * 86400"
```

- `job_status` in convo for `purge-threads`, and **Observability** for `job.failed` on
  `<slug>-convo`.

## Safe now

- Nothing until the cause is known: say how many threads are past 90 days, and purge them only
  after the fix is reviewed.

## Fix prompt notes

Add after step 1: "Treat this as a privacy incident: say how many threads are past 90 days and
since when, and purge them only after the fix is reviewed."
