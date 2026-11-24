# Expectations

What each library is for, written as numbers that production is checked against. This file is the
record: the expectations in force, the values from runs made by hand, the open decisions and the
findings. Incident records are kept in `docs/incidents/`, which git ignores: they name hosts,
Workers and request ids.

Adopted 2026-11-24 (skill: production-expectations). The project already had the parts this asks
for in its own shape, so nothing was rebuilt:

| The skill asks for    | Here                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| An expectation        | A check in `services/core/src/checks.ts`: one count that should be 0, with `means`                                            |
| A runner              | `runChecks`, every 15 minutes from core's every-minute cron, per library                                                      |
| A run log             | `check_results` (value, previous value, `failing_since`) and `check` points in `cdl_events`                                   |
| An alert route        | `check.failed <name>` at error → Workers Issues → ops relay → email (see the README)                                          |
| Missed runs           | `job_status` / `job_runs` and `job.missed <job>`; `scripts/probe.mjs` from outside                                            |
| A new unhandled error | Workers Issues, first occurrence → ops relay → email                                                                          |
| Bounds                | `docs/runbooks/README.md` (Bounds), and each runbook's "Safe now"                                                             |
| Release ids           | The Worker version id (`$metadata.scriptVersion`, `version` in every log event); times from **Workers & Pages → Deployments** |

## Expectations in force

Each starts from the day of adoption (`change: { release: "adopted 2026-11-24" }`). The owner is
`owner` in the manifest (`libraries.json`, not in git; `libraries.example.json` shows the field),
decided 2026-11-24. `npm run observe` and the ops Worker's `ALERTS_EMAIL` send them every failure
by email. Bounds and `can_wait` are proposals until the owner approves them (`approved_by: "none"`).

| Name                   | Means (who is hurt)                                                 | Expected | Every  | Alerts           | can_wait (proposed)        |
| ---------------------- | ------------------------------------------------------------------- | -------- | ------ | ---------------- | -------------------------- |
| `sign_in_mail_failing` | Members asking to sign in are not getting the email.                | 0        | 15 min | email (critical) | until the owner next looks |
| `held_notices_stuck`   | Owners are not hearing about loan requests.                         | 0, twice | 15 min | email (critical) | until the owner next looks |
| `emails_stuck`         | Follow-up emails are waiting past their time and not going.         | 0, twice | 15 min | email (critical) | until the owner next looks |
| `threads_past_purge`   | Loan conversations are kept past the 90 days members were promised. | 0        | 15 min | email (critical) | 1 day                      |
| `backup_missing`       | Last night's database snapshot is not in the backups bucket.        | 0        | 15 min | email (critical) | 1 day                      |
| `copy_loan_mismatch`   | A copy's state disagrees with its loans.                            | 0        | 15 min | weekly digest    | 1 week                     |
| `loan_no_handoff`      | Loans agreed two weeks ago still have no handover proposed.         | 0        | 15 min | weekly digest    | 1 week                     |
| `emails_given_up`      | Some emails were given up after five tries, in the last day.        | 0        | 15 min | weekly digest    | 1 week                     |
| `webhooks_failing`     | Webhook deliveries failed for good in the last day.                 | 0        | 15 min | weekly digest    | 1 week                     |
| `tokens_abandoned`     | Assistant connections nobody collected are not being revoked.       | 0        | 15 min | weekly digest    | 1 week                     |
| `covers_external`      | Covers older than two days still live on another site.              | 0        | 15 min | weekly digest    | 1 week                     |
| `push_gone`            | Browsers threw away push subscriptions in the last day.             | 0        | 15 min | weekly digest    | info only                  |

The first four are the promises the product exists to keep: a member can sign in, a loan request
reaches the owner, the emails that follow go, and conversations are gone after 90 days.

## First runs

**Not run.** This session was not allowed to read production databases. The scheduled runner keeps
the latest values; the owner can read them, counts only, with:

```sh
set -a; . ./.env; set +a
for slug in $(node -e 'import("./scripts/libraries.mjs").then(({ manifest }) => console.log(manifest().libraries.map((lib) => lib.slug).join(" ")))'); do
  npx wrangler d1 execute "$slug-core" --remote -c "$(node scripts/config.mjs "$slug" core)" \
    --command "SELECT name, value, failing_since FROM check_results ORDER BY name"
done
```

It reads the slugs from the manifest. Write the values here, with the time.

| Library | Checked at | Values |
| ------- | ---------- | ------ |
| —       | not run    | —      |

## Changes and their expectations

### 2026-11-24: unrouted addresses answered from memory (web)

`apps/web/lib/not-found-page.ts`. An address whose first segment is no route under `app/` gets the
app's 404 page, rendered once per isolate and language and kept in memory for 10 minutes, without
rendering the layout and without asking core. Prompted by an unhandled error on staging: a
scanner's request for a missing file failed while the 404 page and its layout rendered.

- **Behaviour change:** a signed-in member on an unrouted address sees the visitor's 404 page (no
  book suggestion, sign-in link in the footer). A 404 from inside a route (`/works/<missing id>`)
  is unchanged.
- **Expectation:** none new. The outcome is "an address with no route raises no error", which the
  new-unhandled-error alert (Workers Issues) already watches.
- **Worst thing it could newly do wrong:** answer a real page with 404, if a route is ever served
  from outside `app/`'s top-level directories. Nothing the product keeps can count that (core's
  `cdl_events` does not see web's own answers). Guarded by the route list being read from `app/` at
  build time and by the unit tests. Open decision below.
- **Switch:** none but the release. Roll `<slug>-web` back to the previous version.
- **Release:** not released. Not committed on `main`: on branch `fix/404-from-memory`.
- **First run:** not run (not released). After release, on staging: `curl -sI
https://<staging host>/.env` should answer 404 with `x-cdl-cache:
memory`, and `/about` should answer 200 without it.

## Open decisions

1. **On call.** Nobody is on call: alerts are email to the library's admins and the operator, read
   when they look. With narrow bounds, harm stands until then. Decide what an agent may do alone
   when a critical check keeps rising and nobody answers (proposed: roll back the Worker whose
   release the evidence names, and re-run a job).
2. **can_wait** per expectation, as proposed in the table.
3. **Acknowledging an alert.** Issues emails on the first occurrence only, so a failing check does
   not repeat by email while its Issue stays open. Resolving the Issue re-arms it. There is no way to
   acknowledge in the ops alert store. Decide whether that is enough.
4. **A real page answered 404 from memory** cannot be counted from kept data (above). Decide whether
   web should report `x-cdl-cache: memory` answers to core as `cdl_events` points, sampled.
5. **Expectations not yet written**, proposed for later: a member's location is only ever stored
   snapped (privacy promise); an erased member leaves no personal data behind.
