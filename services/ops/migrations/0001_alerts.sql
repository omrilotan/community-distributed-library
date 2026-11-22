-- What Cloudflare told the operator: every alert of the CDL policies, as its
-- webhook posted it (src/index.ts). Kept 90 days, for list_alerts,
-- explain_alert and the weekly digest.
CREATE TABLE alerts (
	id          TEXT PRIMARY KEY,
	received_at INTEGER NOT NULL,
	library     TEXT,
	name        TEXT NOT NULL,
	alert_type  TEXT,
	text        TEXT NOT NULL
);
CREATE INDEX alerts_received ON alerts(received_at);
