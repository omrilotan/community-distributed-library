-- An event's invite link opens on the day, not when it was made: printed
-- on a sign ahead of time, it lets nobody in before then. Null for a link
-- that works straight away, which is every link made before this.
ALTER TABLE invites ADD COLUMN starts_at INTEGER;
