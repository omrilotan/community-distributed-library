-- A loan request reaches its owner a few minutes after it is made, not at
-- once: until then the asker can take it back and nobody hears of it. The
-- owner's notice waits here, and goes only if the loan is still a request.
CREATE TABLE held_notices (
	id      TEXT PRIMARY KEY,
	loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
	message TEXT NOT NULL,
	send_at INTEGER NOT NULL
);
CREATE INDEX held_notices_due ON held_notices(send_at);
CREATE INDEX held_notices_loan ON held_notices(loan_id);
