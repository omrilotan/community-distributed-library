-- How long a member lends their books for, when a copy does not say. A copy's
-- own length comes first, then this, then the library's.
ALTER TABLE members ADD COLUMN loan_days INTEGER;
