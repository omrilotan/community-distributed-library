-- The day a week starts on where the library is: the members' "when can you
-- meet" grid begins with it. 0 is Sunday, as JavaScript counts, through 6,
-- Saturday. Sunday keeps the order every library has had so far.
ALTER TABLE communities ADD COLUMN week_start INTEGER NOT NULL DEFAULT 0 CHECK (week_start BETWEEN 0 AND 6);
