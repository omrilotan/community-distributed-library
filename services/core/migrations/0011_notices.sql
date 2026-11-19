-- What the library told a member, kept for a month so that the member's
-- assistant can say what is new (routes-news.ts). Never the words of the
-- notice or who it came from: only what kind it was, the title it was about
-- and the page on the site that shows it. `seq` only ever grows, so a
-- connection can remember how far it has read.
CREATE TABLE notices (
	seq        INTEGER PRIMARY KEY AUTOINCREMENT,
	member_id  TEXT NOT NULL REFERENCES members(id),
	kind       TEXT NOT NULL,
	detail     TEXT,
	title      TEXT,
	url        TEXT,
	created_at INTEGER NOT NULL
);
CREATE INDEX notices_member ON notices(member_id, seq);
CREATE INDEX notices_age ON notices(created_at);

-- How far each connection has read: the last notice whats_new listed, and
-- the last one a tool result counted for the member in passing.
ALTER TABLE access_tokens ADD COLUMN news_seen INTEGER;
ALTER TABLE access_tokens ADD COLUMN news_hinted INTEGER;
