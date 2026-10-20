-- Local development only: one example library and two members, in north London.
INSERT OR REPLACE INTO communities
	(id, slug, name, centre_lat, centre_lng, radius_m, join_policy, loan_days, created_at)
VALUES
	('01J0COMMUNITY0000000FINCH', 'our-street', 'Our Street Library',
	 51.6012, -0.1924, 3000, 'invite', 21, unixepoch());

-- What it says about itself.
UPDATE communities SET texts = json_object(
	'en', json_object(
		'tagline', 'Neighbours lending each other the books already on their shelves. Hebrew and English, no money, no fines.',
		'about', 'Our Street Library belongs to the families on a few streets. You join by invitation from a member, and you only ever see your own community''s books.'
	),
	'he', json_object(
		'name', 'הספרייה של הרחוב שלנו',
		'tagline', 'שכנים משאילים זה לזה את הספרים שכבר עומדים אצלם על המדף. בעברית ובאנגלית, בלי כסף ובלי קנסות.',
		'about', 'הספרייה של הרחוב שלנו שייכת למשפחות שגרות בכמה רחובות. מצטרפים בהזמנה מחבר קיים, וכל אחד רואה רק את הספרים של הקהילה שלו.'
	)
) WHERE id = '01J0COMMUNITY0000000FINCH';

-- Ignore, never replace: a developer who signed in with their own address
-- on one of these rows keeps it when the seed runs again.
INSERT OR IGNORE INTO members
	(id, email, display_name, area_lat, area_lng, area_label, locale, created_at)
VALUES
	('01J0MEMBER00000000000DANA', 'dana@example.com', 'Dana', 51.6021, -0.1890, 'Church End', 'en', unixepoch()),
	('01J0MEMBER0000000000SAM00', 'sam@example.com', 'Sam', 51.5980, -0.1975, 'North Finchley', 'he', unixepoch());

INSERT OR IGNORE INTO memberships (member_id, community_id, role, status, joined_at)
VALUES
	('01J0MEMBER00000000000DANA', '01J0COMMUNITY0000000FINCH', 'admin', 'active', unixepoch()),
	('01J0MEMBER0000000000SAM00', '01J0COMMUNITY0000000FINCH', 'member', 'active', unixepoch());

-- A catalogue to develop and test against. The browser tests page through the
-- storefront, which needs more books than a page holds; production data never
-- reaches a fresh checkout, so it is generated here. Dana owns them all, so
-- Sam — who the browser tests sign in as — sees a shelf that is not their own.
INSERT OR IGNORE INTO works (id, title, authors, search_key, created_at)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 60)
SELECT
	printf('01J0SEEDWORK%014d', i),
	CASE i % 4
		WHEN 0 THEN printf('מסע אל האי %d', i)
		WHEN 1 THEN printf('The Lantern Room %d', i)
		WHEN 2 THEN printf('ספר הפלאים %d', i)
		ELSE printf('Quiet Harbour %d', i)
	END,
	json_array(CASE i % 3 WHEN 0 THEN 'רונית חכם' WHEN 1 THEN 'A. Seeder' ELSE 'ינץ לוי' END),
	printf('seeded book %d', i),
	unixepoch() - i * 60
FROM n;

INSERT OR IGNORE INTO editions (id, work_id, title, search_key, created_at)
SELECT
	printf('01J0SEEDEDTN%014d', CAST(substr(id, 13) AS INTEGER)),
	id,
	title,
	search_key,
	created_at
FROM works WHERE id LIKE '01J0SEEDWORK%';

INSERT OR IGNORE INTO copies
	(id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, created_at)
SELECT
	printf('01J0SEEDCOPY%014d', CAST(substr(e.id, 13) AS INTEGER)),
	e.id,
	'01J0MEMBER00000000000DANA',
	'shelved',
	'01J0MEMBER00000000000DANA',
	'good',
	'lendable',
	1,
	e.created_at
FROM editions e WHERE e.id LIKE '01J0SEEDEDTN%';

INSERT OR IGNORE INTO copy_shares (copy_id, community_id)
SELECT id, '01J0COMMUNITY0000000FINCH' FROM copies WHERE id LIKE '01J0SEEDCOPY%';

-- Enough tagging for the quick filters and the facet rows to have something.
INSERT OR IGNORE INTO work_tags (work_id, tag, added_by, created_at)
SELECT
	id,
	CASE CAST(substr(id, 13) AS INTEGER) % 3
		WHEN 0 THEN 'audience:children'
		WHEN 1 THEN 'audience:adults'
		ELSE 'audience:teens'
	END,
	'01J0MEMBER00000000000DANA',
	created_at
FROM works WHERE id LIKE '01J0SEEDWORK%';

-- Every book belongs where its copies are shared, and every tag so far to
-- the one community (migration 0024 does the same for data already there).
INSERT OR IGNORE INTO work_communities (work_id, community_id, created_at)
SELECT e.work_id, cs.community_id, unixepoch()
  FROM copy_shares cs
  JOIN copies c ON c.id = cs.copy_id
  JOIN editions e ON e.id = c.edition_id;

INSERT OR IGNORE INTO tag_communities (tag_id, community_id, created_at)
SELECT t.id, '01J0COMMUNITY0000000FINCH', unixepoch() FROM tags t WHERE t.builtin = 0;
