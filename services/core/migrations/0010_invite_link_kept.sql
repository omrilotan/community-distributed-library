-- An invite's link can be shown again to whoever made it, while it is still
-- open: a sealed copy of its token (AES-GCM under the Worker's INVITE_KEY
-- secret), unreadable from the database alone. Null where the library has no
-- key, and for every link made before this, which stay shown once.
ALTER TABLE invites ADD COLUMN token_sealed TEXT;
