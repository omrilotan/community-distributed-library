-- Local development only: the seed library as a library of things.
-- npm run db:seed:things switches it and lists a few things for Dana and Sam;
-- npm run library:books switches it back; the things stay listed until the local
-- database is made afresh (delete .wrangler/state, then npm run db:migrate and db:seed).
UPDATE communities SET type = 'things' WHERE id = '01J0COMMUNITY0000000FINCH';

INSERT OR IGNORE INTO works (id, title, authors, search_key, created_at) VALUES ('01J0THINGWORKDRILL00000000', 'Cordless drill', '[]', 'cordless drill', unixepoch());
INSERT OR IGNORE INTO editions (id, work_id, isbn13, title, search_key, created_at) VALUES ('01J0THINGEDITDRILL00000000', '01J0THINGWORKDRILL00000000', NULL, 'Cordless drill', 'cordless drill', unixepoch());
INSERT OR IGNORE INTO copies (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, details, quantity, search_key, created_at)
	VALUES ('01J0THINGCOPYDRILL00000000', '01J0THINGEDITDRILL00000000', '01J0MEMBER00000000000DANA', 'shelved', '01J0MEMBER00000000000DANA', 'good', 'lendable', 1, '{"brand": "Makita", "model": "DHP482", "included": "Two batteries, charger, case", "needs": "Your own drill bits"}', 1, 'cordless drill makita dhp482', unixepoch());
INSERT OR IGNORE INTO copy_shares (copy_id, community_id) VALUES ('01J0THINGCOPYDRILL00000000', '01J0COMMUNITY0000000FINCH');
INSERT OR IGNORE INTO work_communities (work_id, community_id, created_at) VALUES ('01J0THINGWORKDRILL00000000', '01J0COMMUNITY0000000FINCH', unixepoch());
INSERT OR IGNORE INTO work_tags (work_id, tag, created_at) VALUES ('01J0THINGWORKDRILL00000000', 'category:tools', unixepoch());

INSERT OR IGNORE INTO works (id, title, authors, search_key, created_at) VALUES ('01J0THINGWORKCHAIR00000000', 'Folding chairs', '[]', 'folding chairs', unixepoch());
INSERT OR IGNORE INTO editions (id, work_id, isbn13, title, search_key, created_at) VALUES ('01J0THINGEDITCHAIR00000000', '01J0THINGWORKCHAIR00000000', NULL, 'Folding chairs', 'folding chairs', unixepoch());
INSERT OR IGNORE INTO copies (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, details, quantity, search_key, created_at)
	VALUES ('01J0THINGCOPYCHAIR00000000', '01J0THINGEDITCHAIR00000000', '01J0MEMBER0000000000SAM00', 'shelved', '01J0MEMBER0000000000SAM00', 'good', 'lendable', 0, '{"included": "Carry bag for each pair", "care": "Wipe before returning"}', 12, 'folding chairs', unixepoch());
INSERT OR IGNORE INTO copy_shares (copy_id, community_id) VALUES ('01J0THINGCOPYCHAIR00000000', '01J0COMMUNITY0000000FINCH');
INSERT OR IGNORE INTO work_communities (work_id, community_id, created_at) VALUES ('01J0THINGWORKCHAIR00000000', '01J0COMMUNITY0000000FINCH', unixepoch());
INSERT OR IGNORE INTO work_tags (work_id, tag, created_at) VALUES ('01J0THINGWORKCHAIR00000000', 'category:party', unixepoch());

INSERT OR IGNORE INTO works (id, title, authors, search_key, created_at) VALUES ('01J0THINGWORKTENTX00000000', 'Two-person tent', '[]', 'two-person tent', unixepoch());
INSERT OR IGNORE INTO editions (id, work_id, isbn13, title, search_key, created_at) VALUES ('01J0THINGEDITTENTX00000000', '01J0THINGWORKTENTX00000000', NULL, 'Two-person tent', 'two-person tent', unixepoch());
INSERT OR IGNORE INTO copies (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, details, quantity, search_key, created_at)
	VALUES ('01J0THINGCOPYTENTX00000000', '01J0THINGEDITTENTX00000000', '01J0MEMBER00000000000DANA', 'shelved', '01J0MEMBER00000000000DANA', 'good', 'lendable', 1, '{"brand": "Vango", "included": "Pegs, poles, footprint", "care": "Dry it before packing it away"}', 1, 'two-person tent vango', unixepoch());
INSERT OR IGNORE INTO copy_shares (copy_id, community_id) VALUES ('01J0THINGCOPYTENTX00000000', '01J0COMMUNITY0000000FINCH');
INSERT OR IGNORE INTO work_communities (work_id, community_id, created_at) VALUES ('01J0THINGWORKTENTX00000000', '01J0COMMUNITY0000000FINCH', unixepoch());
INSERT OR IGNORE INTO work_tags (work_id, tag, created_at) VALUES ('01J0THINGWORKTENTX00000000', 'category:camping', unixepoch());

INSERT OR IGNORE INTO works (id, title, authors, search_key, created_at) VALUES ('01J0THINGWORKMOWER00000000', 'Lawn mower', '[]', 'lawn mower', unixepoch());
INSERT OR IGNORE INTO editions (id, work_id, isbn13, title, search_key, created_at) VALUES ('01J0THINGEDITMOWER00000000', '01J0THINGWORKMOWER00000000', NULL, 'Lawn mower', 'lawn mower', unixepoch());
INSERT OR IGNORE INTO copies (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, details, quantity, search_key, created_at)
	VALUES ('01J0THINGCOPYMOWER00000000', '01J0THINGEDITMOWER00000000', '01J0MEMBER0000000000SAM00', 'shelved', '01J0MEMBER0000000000SAM00', 'good', 'lendable', 1, '{"brand": "Bosch", "model": "Rotak 32", "needs": "An outdoor socket"}', 1, 'lawn mower bosch rotak 32', unixepoch());
INSERT OR IGNORE INTO copy_shares (copy_id, community_id) VALUES ('01J0THINGCOPYMOWER00000000', '01J0COMMUNITY0000000FINCH');
INSERT OR IGNORE INTO work_communities (work_id, community_id, created_at) VALUES ('01J0THINGWORKMOWER00000000', '01J0COMMUNITY0000000FINCH', unixepoch());
INSERT OR IGNORE INTO work_tags (work_id, tag, created_at) VALUES ('01J0THINGWORKMOWER00000000', 'category:garden', unixepoch());

INSERT OR IGNORE INTO works (id, title, authors, search_key, created_at) VALUES ('01J0THINGWORKPLATE00000000', 'Party plates', '[]', 'party plates', unixepoch());
INSERT OR IGNORE INTO editions (id, work_id, isbn13, title, search_key, created_at) VALUES ('01J0THINGEDITPLATE00000000', '01J0THINGWORKPLATE00000000', NULL, 'Party plates', 'party plates', unixepoch());
INSERT OR IGNORE INTO copies (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, details, quantity, search_key, created_at)
	VALUES ('01J0THINGCOPYPLATE00000000', '01J0THINGEDITPLATE00000000', '01J0MEMBER00000000000DANA', 'shelved', '01J0MEMBER00000000000DANA', 'good', 'lendable', 0, '{"included": "Stacking crate"}', 30, 'party plates', unixepoch());
INSERT OR IGNORE INTO copy_shares (copy_id, community_id) VALUES ('01J0THINGCOPYPLATE00000000', '01J0COMMUNITY0000000FINCH');
INSERT OR IGNORE INTO work_communities (work_id, community_id, created_at) VALUES ('01J0THINGWORKPLATE00000000', '01J0COMMUNITY0000000FINCH', unixepoch());
INSERT OR IGNORE INTO work_tags (work_id, tag, created_at) VALUES ('01J0THINGWORKPLATE00000000', 'category:kitchen', unixepoch());
