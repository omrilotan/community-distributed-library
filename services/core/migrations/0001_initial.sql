-- Core: members, the catalogue, copies, loans, tags and everything around them.
-- The schema as all earlier migrations left it, in one file. Later changes
-- go in new migrations after this one.

CREATE TABLE works (
	id         TEXT PRIMARY KEY,
	title      TEXT NOT NULL,
	authors    TEXT NOT NULL, -- JSON array
	-- Normalised title and authors: niqqud stripped, final forms folded, lowercased.
	-- Substring matching against this is the pilot's search (decision 0012).
	search_key TEXT NOT NULL,
	created_at INTEGER NOT NULL
, note TEXT);
CREATE TABLE editions (
	id             TEXT PRIMARY KEY,
	work_id        TEXT NOT NULL REFERENCES works(id),
	isbn13         TEXT UNIQUE,
	title          TEXT NOT NULL,
	publisher      TEXT,
	published_year INTEGER,
	language       TEXT,
	page_count     INTEGER,
	cover_url      TEXT,
	search_key     TEXT NOT NULL,
	created_at     INTEGER NOT NULL
, cover_tried_at INTEGER);
CREATE TABLE communities (
	id          TEXT PRIMARY KEY,
	slug        TEXT NOT NULL UNIQUE,
	name        TEXT NOT NULL,
	centre_lat  REAL NOT NULL,
	centre_lng  REAL NOT NULL,
	radius_m    INTEGER NOT NULL,
	join_policy TEXT NOT NULL CHECK (join_policy IN ('open', 'invite', 'approval')),
	loan_days   INTEGER NOT NULL DEFAULT 21,
	created_at  INTEGER NOT NULL
, member_invites_open INTEGER NOT NULL DEFAULT 5, member_invite_days INTEGER NOT NULL DEFAULT 14, default_locale TEXT NOT NULL DEFAULT 'en' CHECK (default_locale IN ('en', 'he')), compact INTEGER NOT NULL DEFAULT 0 CHECK (compact IN (0, 1)), type TEXT NOT NULL DEFAULT 'books' CHECK (type IN ('books', 'things')), languages TEXT NOT NULL DEFAULT 'en,he' CHECK (languages IN ('en', 'he', 'en,he')), texts TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(texts) AND json_type(texts) = 'object'), centre_label TEXT, accent TEXT
	CHECK (accent IS NULL OR (length(accent) = 7 AND accent GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')));
CREATE TABLE members (
	id             TEXT PRIMARY KEY,
	email          TEXT NOT NULL UNIQUE,
	display_name   TEXT NOT NULL,
	-- Coarse only. Exact coordinates live in member_places (M3), never here.
	area_lat       REAL,
	area_lng       REAL,
	area_label     TEXT,
	locale         TEXT NOT NULL DEFAULT 'en',
	created_at     INTEGER NOT NULL,
	deactivated_at INTEGER
, meeting_place TEXT, lend_limit INTEGER, last_seen_at INTEGER, invited_by TEXT REFERENCES members(id), invited_via TEXT REFERENCES invites(id), away_until INTEGER, browse_prefs TEXT);
CREATE TABLE copies (
	id            TEXT PRIMARY KEY,
	edition_id    TEXT NOT NULL REFERENCES editions(id),
	owner_id      TEXT NOT NULL REFERENCES members(id),
	state         TEXT NOT NULL CHECK (state IN
		('shelved', 'reserved', 'in_transit', 'on_loan', 'unavailable', 'lost', 'retired')),
	holder_id     TEXT REFERENCES members(id),
	condition     TEXT NOT NULL CHECK (condition IN ('new', 'good', 'worn', 'fragile')),
	lending       TEXT NOT NULL CHECK (lending IN ('lendable', 'reference', 'paused')),
	relay_allowed INTEGER NOT NULL DEFAULT 0,
	loan_days     INTEGER,
	note          TEXT,
	created_at    INTEGER NOT NULL
, details TEXT CHECK (details IS NULL OR json_valid(details)), quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1), search_key TEXT, photos TEXT CHECK (photos IS NULL OR (json_valid(photos) AND json_type(photos) = 'array')));
CREATE TABLE copy_shares (
	copy_id      TEXT NOT NULL REFERENCES copies(id),
	community_id TEXT NOT NULL REFERENCES communities(id),
	PRIMARY KEY (copy_id, community_id)
);
CREATE TABLE magic_links (
	id         TEXT PRIMARY KEY,
	email      TEXT NOT NULL,
	token_hash TEXT NOT NULL UNIQUE,
	invite_id  TEXT REFERENCES invites(id),   -- set when the link doubles as a join
	expires_at INTEGER NOT NULL,
	used_at    INTEGER,
	created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
	id           TEXT PRIMARY KEY,
	member_id    TEXT NOT NULL REFERENCES members(id),
	token_hash   TEXT NOT NULL UNIQUE,
	created_at   INTEGER NOT NULL,
	expires_at   INTEGER NOT NULL,
	last_seen_at INTEGER NOT NULL,
	revoked_at   INTEGER
);
CREATE TABLE invites (
	id           TEXT PRIMARY KEY,
	community_id TEXT NOT NULL REFERENCES communities(id),
	created_by   TEXT NOT NULL REFERENCES members(id),
	token_hash   TEXT NOT NULL UNIQUE,
	max_uses     INTEGER NOT NULL DEFAULT 1,
	uses         INTEGER NOT NULL DEFAULT 0,
	expires_at   INTEGER NOT NULL,
	revoked_at   INTEGER,
	created_at   INTEGER NOT NULL
, sent_to TEXT);
CREATE TABLE loans (
	id               TEXT PRIMARY KEY,
	copy_id          TEXT NOT NULL REFERENCES copies(id),
	borrower_id      TEXT NOT NULL REFERENCES members(id),
	lender_id        TEXT NOT NULL REFERENCES members(id),
	community_id     TEXT NOT NULL REFERENCES communities(id),
	status           TEXT NOT NULL CHECK (status IN
		('requested', 'accepted', 'declined', 'active', 'completed', 'cancelled', 'lost')),
	outcome          TEXT CHECK (outcome IN ('returned', 'relayed', 'lost', 'cancelled')),
	message          TEXT,
	requested_at     INTEGER NOT NULL,
	decided_at       INTEGER,
	started_at       INTEGER,
	due_at           INTEGER,
	closed_at        INTEGER,
	previous_loan_id TEXT REFERENCES loans(id)
, borrower_nudged_at INTEGER, lender_nudged_at INTEGER, reminded_unanswered_at INTEGER, reminded_due_at INTEGER, reminded_overdue_at INTEGER, escalated_at INTEGER, relay_from TEXT REFERENCES members(id), extensions INTEGER NOT NULL DEFAULT 0, quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1), of_set INTEGER NOT NULL DEFAULT 0 CHECK (of_set IN (0, 1)), lost_mark TEXT, relay_nudged_at INTEGER);
CREATE TABLE access_tokens (
	id           TEXT PRIMARY KEY,
	member_id    TEXT NOT NULL REFERENCES members(id),
	token_hash   TEXT NOT NULL UNIQUE,
	scopes       TEXT NOT NULL,            -- space-separated
	client_name  TEXT NOT NULL,
	created_at   INTEGER NOT NULL,
	expires_at   INTEGER,
	last_used_at INTEGER,
	revoked_at   INTEGER
);
CREATE TABLE consent_codes (
	code_hash  TEXT PRIMARY KEY,
	token_id   TEXT NOT NULL REFERENCES access_tokens(id),
	token_plain TEXT,                     -- held for at most 5 minutes, cleared on redeem
	expires_at INTEGER NOT NULL,
	used_at    INTEGER
);
CREATE TABLE availability (
	member_id TEXT NOT NULL REFERENCES members(id),
	weekday   INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Sunday
	period    TEXT NOT NULL CHECK (period IN ('morning', 'afternoon', 'evening')),
	PRIMARY KEY (member_id, weekday, period)
);
CREATE TABLE handoffs (
	id           TEXT PRIMARY KEY,
	loan_id      TEXT NOT NULL REFERENCES loans(id),
	direction    TEXT NOT NULL CHECK (direction IN ('out', 'back')),
	day          TEXT NOT NULL,                                     -- YYYY-MM-DD, local to the community
	period       TEXT NOT NULL CHECK (period IN ('morning', 'afternoon', 'evening')),
	proposed_by  TEXT NOT NULL REFERENCES members(id),
	status       TEXT NOT NULL CHECK (status IN ('proposed', 'agreed', 'completed', 'cancelled')),
	code         TEXT,                                              -- six characters, set when agreed; shown to the lender only
	created_at   INTEGER NOT NULL,
	agreed_at    INTEGER,
	completed_at INTEGER
);
CREATE TABLE waitlist (
	id               TEXT PRIMARY KEY,
	work_id          TEXT NOT NULL REFERENCES works(id),
	community_id     TEXT NOT NULL REFERENCES communities(id),
	member_id        TEXT NOT NULL REFERENCES members(id),
	created_at       INTEGER NOT NULL,
	offered_copy_id  TEXT REFERENCES copies(id),   -- first dibs on this copy…
	offer_expires_at INTEGER,                      -- …until here
	UNIQUE (work_id, community_id, member_id)
);
CREATE TABLE reports (
	id             TEXT PRIMARY KEY,
	community_id   TEXT NOT NULL REFERENCES communities(id),
	reporter_id    TEXT NOT NULL REFERENCES members(id),
	subject_member TEXT REFERENCES members(id),
	loan_id        TEXT REFERENCES loans(id),
	kind           TEXT NOT NULL CHECK (kind IN ('damage', 'loss', 'no_show', 'conduct', 'other')),
	body           TEXT,
	status         TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
	resolution     TEXT,
	created_at     INTEGER NOT NULL,
	closed_at      INTEGER,
	closed_by      TEXT REFERENCES members(id)
);
CREATE TABLE events (
	id           TEXT PRIMARY KEY,            -- ULID: sortable, doubles as a cursor
	community_id TEXT NOT NULL REFERENCES communities(id),
	kind         TEXT NOT NULL,
	data         TEXT NOT NULL,               -- JSON: ids only
	audience     TEXT NOT NULL,               -- '*' (whole community) or JSON array of member ids
	created_at   INTEGER NOT NULL
);
CREATE TABLE webhooks (
	id           TEXT PRIMARY KEY,
	community_id TEXT NOT NULL REFERENCES communities(id),
	member_id    TEXT NOT NULL REFERENCES members(id),
	url          TEXT NOT NULL,
	kinds        TEXT NOT NULL,               -- space-separated, or '*'
	secret       TEXT NOT NULL,
	created_at   INTEGER NOT NULL,
	disabled_at  INTEGER,
	failures     INTEGER NOT NULL DEFAULT 0,  -- consecutive; 25 disables the hook
	last_status  INTEGER,
	last_at      INTEGER
);
CREATE TABLE webhook_deliveries (
	id          TEXT PRIMARY KEY,
	webhook_id  TEXT NOT NULL REFERENCES webhooks(id),
	event_id    TEXT NOT NULL REFERENCES events(id),
	status      TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed')),
	attempts    INTEGER NOT NULL DEFAULT 0,
	next_at     INTEGER NOT NULL,
	last_status INTEGER,
	last_error  TEXT,
	created_at  INTEGER NOT NULL
);
CREATE TABLE work_tags (
	work_id    TEXT NOT NULL REFERENCES works(id),
	tag        TEXT NOT NULL,
	added_by   TEXT REFERENCES members(id),
	created_at INTEGER NOT NULL,
	PRIMARY KEY (work_id, tag)
);
CREATE TABLE tag_namespaces (
	id         TEXT PRIMARY KEY,            -- slug: language, audience, genre
	label_en   TEXT NOT NULL,
	label_he   TEXT NOT NULL,
	builtin    INTEGER NOT NULL DEFAULT 0,  -- shipped with the app; cannot be removed
	position   INTEGER NOT NULL DEFAULT 100,
	created_at INTEGER NOT NULL
, library_type TEXT);
CREATE TABLE tags (
	id         TEXT PRIMARY KEY,            -- ULID
	namespace  TEXT NOT NULL REFERENCES tag_namespaces(id),
	value      TEXT NOT NULL,
	-- namespace:value, denormalised: it is what the API, URLs and work_tags use.
	slug       TEXT NOT NULL UNIQUE,
	label_en   TEXT NOT NULL,
	label_he   TEXT NOT NULL,
	builtin    INTEGER NOT NULL DEFAULT 0,
	position   INTEGER NOT NULL DEFAULT 100,
	created_at INTEGER NOT NULL,
	created_by TEXT REFERENCES members(id),
	UNIQUE (namespace, value)
);
CREATE TABLE tag_proposals (
	id              TEXT PRIMARY KEY,
	community_id    TEXT NOT NULL REFERENCES communities(id),
	proposed_by     TEXT NOT NULL REFERENCES members(id),
	-- One of: a value inside an existing namespace, or a whole new label.
	namespace       TEXT REFERENCES tag_namespaces(id),
	namespace_label TEXT,
	label           TEXT NOT NULL,          -- what the member typed
	locale          TEXT NOT NULL,          -- which language they typed it in
	work_id         TEXT REFERENCES works(id),  -- applied here once approved
	status          TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
	note            TEXT,                   -- the librarian's word back
	tag_id          TEXT REFERENCES tags(id),
	created_at      INTEGER NOT NULL,
	decided_at      INTEGER,
	decided_by      TEXT REFERENCES members(id)
);
CREATE TABLE rate_limits (
	bucket     TEXT NOT NULL,     -- what is being limited, e.g. magic_link:email
	subject    TEXT NOT NULL,     -- the address, or the caller's IP
	window_end INTEGER NOT NULL,  -- unix seconds; the count resets after this
	count      INTEGER NOT NULL,
	PRIMARY KEY (bucket, subject)
);
CREATE TABLE push_subscriptions (
	id         TEXT PRIMARY KEY,
	member_id  TEXT NOT NULL REFERENCES members(id),
	endpoint   TEXT NOT NULL UNIQUE,
	p256dh     TEXT NOT NULL,          -- the browser's public key, base64url
	auth       TEXT NOT NULL,          -- its shared secret, base64url
	created_at INTEGER NOT NULL,
	last_ok_at INTEGER,
	failures   INTEGER NOT NULL DEFAULT 0
, session_id TEXT);
CREATE TABLE pending_emails (
	id         TEXT PRIMARY KEY,
	member_id  TEXT NOT NULL REFERENCES members(id),
	message    TEXT NOT NULL,          -- the notify Message, as JSON
	created_at INTEGER NOT NULL,
	send_after INTEGER NOT NULL,
	sent_at    INTEGER,
	dropped_at INTEGER                 -- they saw it in the app first
, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE work_distinct (
	a_id       TEXT NOT NULL REFERENCES works(id),
	b_id       TEXT NOT NULL REFERENCES works(id),  -- a_id < b_id, always
	decided_by TEXT REFERENCES members(id),
	created_at INTEGER NOT NULL,
	PRIMARY KEY (a_id, b_id)
);
CREATE TABLE cover_cache (
	source_url TEXT PRIMARY KEY,   -- the address the provider or client gave
	cover_url  TEXT NOT NULL,      -- our own copy of it
	created_at INTEGER NOT NULL
);
CREATE TABLE contact_messages (
	id         TEXT PRIMARY KEY,
	member_id  TEXT REFERENCES members(id),   -- null when nobody was signed in
	email      TEXT NOT NULL,                 -- where the answer goes
	topic      TEXT NOT NULL CHECK (topic IN ('feedback', 'data', 'complaint')),
	body       TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	handled_at INTEGER
, community_id TEXT REFERENCES communities(id));
CREATE TABLE work_communities (
	work_id      TEXT NOT NULL REFERENCES works(id),
	community_id TEXT NOT NULL REFERENCES communities(id),
	created_at   INTEGER NOT NULL,
	PRIMARY KEY (work_id, community_id)
);
CREATE TABLE tag_communities (
	tag_id       TEXT NOT NULL REFERENCES tags(id),
	community_id TEXT NOT NULL REFERENCES communities(id),
	created_at   INTEGER NOT NULL,
	PRIMARY KEY (tag_id, community_id)
);
CREATE TABLE "memberships" (
	member_id    TEXT NOT NULL REFERENCES members(id),
	community_id TEXT NOT NULL REFERENCES communities(id),
	role         TEXT NOT NULL CHECK (role IN ('member', 'moderator', 'admin')),
	status       TEXT NOT NULL CHECK (status IN ('pending', 'active', 'suspended', 'left')),
	joined_at    INTEGER NOT NULL,
	PRIMARY KEY (member_id, community_id)
);
CREATE TABLE report_replies (
	id         TEXT PRIMARY KEY,
	report_id  TEXT NOT NULL REFERENCES reports(id),
	author_id  TEXT NOT NULL REFERENCES members(id),
	-- Written as a moderator (shown to the reporter as "the moderators"),
	-- or by the reporter.
	from_moderators INTEGER NOT NULL,
	body       TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE TABLE loan_reads (
	member_id TEXT NOT NULL REFERENCES members(id),
	loan_id   TEXT NOT NULL REFERENCES loans(id),
	read_at   INTEGER NOT NULL,
	PRIMARY KEY (member_id, loan_id)
);
CREATE TABLE moderation_log (
	id           TEXT PRIMARY KEY,
	community_id TEXT NOT NULL REFERENCES communities(id),
	actor_id     TEXT NOT NULL REFERENCES members(id),
	-- The kind of change: the method and the route, ids replaced ("POST
	-- /v1/admin/members/:id/role").
	action       TEXT NOT NULL,
	-- What it was done to: a member, report, book, tag or invite id.
	target       TEXT,
	-- The request's own words (the new role, a resolution note), cut short.
	details      TEXT,
	created_at   INTEGER NOT NULL
, via TEXT);
CREATE TABLE read_works (
	member_id  TEXT NOT NULL REFERENCES members(id),
	work_id    TEXT NOT NULL REFERENCES works(id),
	created_at INTEGER NOT NULL,
	PRIMARY KEY (member_id, work_id)
);
CREATE TABLE wishlist (
	member_id   TEXT NOT NULL REFERENCES members(id),
	work_id     TEXT NOT NULL REFERENCES works(id),
	created_at  INTEGER NOT NULL,
	notified_at INTEGER,
	PRIMARY KEY (member_id, work_id)
);

-- Starting tag_namespaces.
INSERT INTO tag_namespaces VALUES('language','Language','שפה',1,10,unixepoch(),'books');
INSERT INTO tag_namespaces VALUES('audience','Audience','קהל יעד',1,20,unixepoch(),'books');
INSERT INTO tag_namespaces VALUES('genre','Genre','ז׳אנר',1,30,unixepoch(),'books');
INSERT INTO tag_namespaces VALUES('category','Category','קטגוריה',1,10,1792508943,'things');

-- Starting tags.
INSERT INTO tags VALUES('01J0TAG00000000000LANGHE0','language','he','language:he','Hebrew','עברית',1,10,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG00000000000LANGEN0','language','en','language:en','English','אנגלית',1,20,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG00000000000LANGOTH','language','other','language:other','Another language','שפה אחרת',1,30,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG0000000000AUDCHILD','audience','children','audience:children','Children','ילדים',1,10,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG00000000000AUDTEEN','audience','teen','audience:teen','Teens','נוער',1,20,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG0000000000AUDADULT','audience','adult','audience:adult','Adults','מבוגרים',1,30,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG000000000GENFICTIO','genre','fiction','genre:fiction','Fiction','פרוזה',1,10,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG000000000GENNONFIC','genre','nonfiction','genre:nonfiction','Non-fiction','עיון',1,20,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG000000000GENPOETRY','genre','poetry','genre:poetry','Poetry','שירה',1,30,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG000000000GENCOMICS','genre','comics','genre:comics','Comics','קומיקס',1,40,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG000000000GENRELIGI','genre','religion','genre:religion','Religion','יהדות ודת',1,50,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG000000000GENREFERE','genre','reference','genre:reference','Reference','עזר',1,60,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG000000000GENCOOKIN','genre','cooking','genre:cooking','Cooking','בישול',1,70,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG000000000GENBIOGRA','genre','biography','genre:biography','Biography','ביוגרפיה',1,80,unixepoch(),NULL);
INSERT INTO tags VALUES('01J0TAG0000000000CATTOOLS0','category','tools','category:tools','Tools','כלי עבודה',1,10,1792508943,NULL);
INSERT INTO tags VALUES('01J0TAG0000000000CATGARDN0','category','garden','category:garden','Garden','גינה',1,20,1792508943,NULL);
INSERT INTO tags VALUES('01J0TAG0000000000CATCAMPG0','category','camping','category:camping','Camping','קמפינג',1,30,1792508943,NULL);
INSERT INTO tags VALUES('01J0TAG0000000000CATPARTY0','category','party','category:party','Parties and events','אירועים ומסיבות',1,40,1792508943,NULL);
INSERT INTO tags VALUES('01J0TAG0000000000CATKITCH0','category','kitchen','category:kitchen','Kitchen','מטבח',1,50,1792508943,NULL);
INSERT INTO tags VALUES('01J0TAG0000000000CATBIKES0','category','bikes','category:bikes','Bikes','אופניים',1,60,1792508943,NULL);
INSERT INTO tags VALUES('01J0TAG0000000000CATSPORT0','category','sport','category:sport','Sport and outdoors','ספורט ופנאי',1,70,1792508943,NULL);
INSERT INTO tags VALUES('01J0TAG0000000000CATCHILD0','category','kids','category:kids','Children','ילדים',1,80,1792508943,NULL);
INSERT INTO tags VALUES('01J0TAG0000000000CATHOMEX0','category','home','category:home','Home','בית',1,90,1792508943,NULL);

CREATE INDEX works_search ON works(search_key);
CREATE INDEX editions_work ON editions(work_id);
CREATE INDEX members_area ON members(area_lat, area_lng);
CREATE INDEX copies_edition ON copies(edition_id);
CREATE INDEX copies_owner ON copies(owner_id);
CREATE INDEX copies_state ON copies(state);
CREATE INDEX magic_links_email ON magic_links(email, created_at);
CREATE INDEX sessions_member ON sessions(member_id);
CREATE INDEX invites_community ON invites(community_id, created_at);
CREATE INDEX loans_borrower ON loans(borrower_id, status);
CREATE INDEX loans_lender ON loans(lender_id, status);
CREATE INDEX loans_due ON loans(due_at) WHERE status = 'active';
CREATE INDEX access_tokens_member ON access_tokens(member_id);
CREATE UNIQUE INDEX handoffs_one_open_per_loan
	ON handoffs(loan_id, direction) WHERE status IN ('proposed', 'agreed');
CREATE INDEX waitlist_work ON waitlist(work_id, community_id, created_at);
CREATE INDEX waitlist_offer ON waitlist(offer_expires_at) WHERE offer_expires_at IS NOT NULL;
CREATE INDEX reports_open ON reports(community_id, status, created_at);
CREATE INDEX events_community ON events(community_id, id);
CREATE INDEX webhooks_member ON webhooks(member_id);
CREATE INDEX webhooks_community ON webhooks(community_id, disabled_at);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries(status, next_at);
CREATE INDEX webhook_deliveries_hook ON webhook_deliveries(webhook_id, created_at);
CREATE INDEX work_tags_tag ON work_tags(tag);
CREATE INDEX tags_namespace ON tags(namespace, position);
CREATE INDEX tag_proposals_open ON tag_proposals(community_id, status, created_at);
CREATE INDEX rate_limits_expiry ON rate_limits(window_end);
CREATE INDEX push_subscriptions_member ON push_subscriptions(member_id);
CREATE INDEX contact_open ON contact_messages(handled_at, created_at);
CREATE INDEX work_communities_community ON work_communities(community_id);
CREATE INDEX tag_communities_community ON tag_communities(community_id);
CREATE INDEX report_replies_report ON report_replies(report_id, created_at);
CREATE INDEX moderation_log_community ON moderation_log(community_id, created_at);
CREATE INDEX wishlist_work ON wishlist(work_id);
CREATE INDEX loans_relay ON loans(relay_from, status);
CREATE INDEX loans_copy ON loans(copy_id, status);
CREATE INDEX handoffs_open ON handoffs(loan_id) WHERE status = 'proposed';
CREATE INDEX reports_reporter ON reports(reporter_id);
CREATE INDEX copy_shares_community ON copy_shares(community_id, copy_id);
CREATE INDEX memberships_community ON memberships(community_id, status, role);
CREATE UNIQUE INDEX loans_one_active_per_copy ON loans(copy_id)
	WHERE status = 'active' AND of_set = 0;
CREATE UNIQUE INDEX loans_one_pending_per_copy ON loans(copy_id)
	WHERE status IN ('requested', 'accepted') AND of_set = 0;
CREATE INDEX loans_open_of_copy ON loans(copy_id, status) WHERE of_set = 1;
CREATE UNIQUE INDEX loans_one_open_set_loan_per_borrower ON loans(copy_id, borrower_id)
	WHERE of_set = 1 AND status IN ('requested', 'accepted', 'active');
CREATE UNIQUE INDEX waitlist_one_offer_per_copy ON waitlist(offered_copy_id)
	WHERE offered_copy_id IS NOT NULL;
CREATE INDEX pending_emails_waiting ON pending_emails(send_after);
CREATE INDEX loans_accepted_waiting ON loans(decided_at) WHERE status = 'accepted';
CREATE INDEX loans_open_by_community ON loans(community_id)
	WHERE status IN ('requested', 'accepted', 'active');
CREATE INDEX loans_requested_waiting ON loans(requested_at) WHERE status = 'requested';
