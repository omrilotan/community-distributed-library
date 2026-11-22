-- Outcomes that leave nothing behind in the other tables, counted by the
-- hour so the checks (checks.ts) can see them: a sign-in email that did not
-- go, an email given up after its retries, a push the browser threw away.
-- Counts only. Kept 30 days.
CREATE TABLE tallies (
	name  TEXT NOT NULL,
	hour  INTEGER NOT NULL,      -- seconds since 1970 / 3600
	count INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (name, hour)
);

-- Each check's latest value and the one before, so "two runs in a row" can
-- be told, and the ops tools can say what is failing now.
CREATE TABLE check_results (
	name           TEXT PRIMARY KEY,
	value          INTEGER NOT NULL,
	previous_value INTEGER,
	severity       TEXT NOT NULL,
	checked_at     INTEGER NOT NULL,
	failing_since  INTEGER
);

-- What the checks read that no index covered yet.
CREATE INDEX webhook_deliveries_failed ON webhook_deliveries(created_at) WHERE status = 'failed';
CREATE INDEX consent_codes_unused ON consent_codes(expires_at) WHERE used_at IS NULL;
CREATE INDEX editions_cover_untried ON editions(created_at) WHERE cover_tried_at IS NULL AND cover_url IS NOT NULL;
