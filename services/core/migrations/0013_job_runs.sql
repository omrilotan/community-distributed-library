-- What each scheduled job last did (telemetry.ts in @cdl/contracts). One row per job, updated on
-- every run, so a job that stops running is noticed: the health route and the
-- every-15-minutes check compare last_ok_at with how often the job runs.
CREATE TABLE job_status (
	job            TEXT PRIMARY KEY,
	first_at       INTEGER NOT NULL,
	last_started_at INTEGER NOT NULL,
	last_ok_at     INTEGER,
	last_failed_at INTEGER,
	runs           INTEGER NOT NULL DEFAULT 0,
	failures       INTEGER NOT NULL DEFAULT 0
);

-- A history of the runs worth keeping: every run of a daily job and every
-- failed run of any job. The every-minute jobs' successful runs are counted
-- in job_status only. Kept 30 days.
CREATE TABLE job_runs (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	job         TEXT NOT NULL,
	started_at  INTEGER NOT NULL,
	finished_at INTEGER NOT NULL,
	outcome     TEXT NOT NULL CHECK (outcome IN ('ok', 'failed')),
	detail      TEXT
);
CREATE INDEX job_runs_job ON job_runs(job, started_at);
