-- Whether a borrower meeting this member is shown what else is on their
-- shelf. On unless they turn it off.
ALTER TABLE members ADD COLUMN suggest_shelf INTEGER NOT NULL DEFAULT 1 CHECK (suggest_shelf IN (0, 1));
