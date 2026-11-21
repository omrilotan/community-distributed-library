-- An ask: a member needs a kind of thing ("a saw, today") and any neighbour
-- who has one may offer theirs (routes-asks.ts). `status` is what was done to
-- it; an open ask past `expires_at` is over without anybody closing it.
CREATE TABLE asks (
	id             TEXT PRIMARY KEY,
	community_id   TEXT NOT NULL REFERENCES communities(id),
	member_id      TEXT NOT NULL REFERENCES members(id),
	what           TEXT NOT NULL,
	note           TEXT,
	needed_by      TEXT NOT NULL CHECK (needed_by IN ('today', 'week', 'whenever')),
	-- How long it is wanted for; the loan an offer becomes runs this long.
	days           INTEGER NOT NULL CHECK (days >= 1),
	status         TEXT NOT NULL CHECK (status IN ('open', 'taken', 'closed')),
	taken_offer_id TEXT,
	created_at     INTEGER NOT NULL,
	expires_at     INTEGER NOT NULL,
	closed_at      INTEGER
);
CREATE INDEX asks_open ON asks(community_id, status, expires_at);
CREATE INDEX asks_member ON asks(member_id, status);

-- A neighbour's answer: what theirs is and when the asker may come by. One a
-- member on an ask. Taken, it becomes a loan of a copy made for it, which is
-- on no shelf (no copy_shares row) until its owner says to keep it listed:
-- `keep` is their answer, asked once, after the loan or when another offer
-- was taken.
CREATE TABLE ask_offers (
	id         TEXT PRIMARY KEY,
	ask_id     TEXT NOT NULL REFERENCES asks(id),
	member_id  TEXT NOT NULL REFERENCES members(id),
	name       TEXT NOT NULL,
	come       TEXT NOT NULL CHECK (come IN ('now', 'later', 'usual')),
	time       TEXT,                    -- HH:MM: until when for now, from when for later
	day        TEXT NOT NULL,           -- YYYY-MM-DD it was offered on
	note       TEXT,
	status     TEXT NOT NULL CHECK (status IN ('offered', 'taken', 'withdrawn')),
	copy_id    TEXT REFERENCES copies(id),
	loan_id    TEXT REFERENCES loans(id),
	keep       INTEGER CHECK (keep IN (0, 1)),
	created_at INTEGER NOT NULL,
	UNIQUE (ask_id, member_id)
);
CREATE INDEX ask_offers_member ON ask_offers(member_id, status);
CREATE INDEX ask_offers_loan ON ask_offers(loan_id) WHERE loan_id IS NOT NULL;
