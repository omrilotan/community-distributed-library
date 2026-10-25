-- A sign-in link asked for from the site also carries an eight-digit code, for a
-- browser that cannot open the email's link: an assistant's in-app sign-in
-- sheet, say. The code works only in the browser that asked (browser_hash is
-- the hash of a random value kept in that browser's cookie), and a few wrong
-- guesses spend it.
ALTER TABLE magic_links ADD COLUMN browser_hash TEXT;
ALTER TABLE magic_links ADD COLUMN code_hash TEXT;
ALTER TABLE magic_links ADD COLUMN code_tries INTEGER NOT NULL DEFAULT 0;
CREATE INDEX magic_links_browser ON magic_links(browser_hash)
	WHERE browser_hash IS NOT NULL;
