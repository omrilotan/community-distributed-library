-- A loan's reports are read on every thread view, and a member's waitlist by
-- who is waiting; neither column had an index, so both were table scans.
CREATE INDEX reports_loan ON reports(loan_id, created_at);
CREATE INDEX waitlist_member ON waitlist(member_id, created_at);
