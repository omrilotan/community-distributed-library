# Backup missing

**From:** Workers Issues, `check.failed backup_missing`: no `d1/<today>.sql` in `<slug>-backups`
(after 04:00 UTC; before, yesterday's counts).

**Means:** if the database were lost now, the last copy outside D1 Time Travel is older than a day.
D1 Time Travel still covers the last 30 days.

## First look

- `job_runs` for `backup`, and **Observability** `event` = `job.failed`, `job` = `backup`.
- **R2 → `<slug>-backups`**: the newest object under `d1/`.

## Safe now

- Take a snapshot now: as an admin, `POST /api/v1/admin/backup`.

## Fix prompt notes

Add after step 1: "A snapshot that fails on size or time limits is a design problem in
services/core/src/backup.ts, not a retry: say what limit it hit."
