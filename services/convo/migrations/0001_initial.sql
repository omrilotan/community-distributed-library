-- Convo: message threads about a loan.
-- The schema as all earlier migrations left it, in one file. Later changes
-- go in new migrations after this one.

CREATE TABLE threads (
	loan_id    TEXT PRIMARY KEY,
	closed_at  INTEGER,            -- set by core when the loan closes; purge runs 90 days later
	created_at INTEGER NOT NULL
);
CREATE TABLE messages (
	id         TEXT PRIMARY KEY,
	loan_id    TEXT NOT NULL REFERENCES threads(loan_id),
	author_id  TEXT NOT NULL,
	body       TEXT NOT NULL,
	created_at INTEGER NOT NULL
, via TEXT);

CREATE INDEX messages_loan ON messages(loan_id, created_at);
CREATE INDEX threads_closed ON threads(closed_at) WHERE closed_at IS NOT NULL;
