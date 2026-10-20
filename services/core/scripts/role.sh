#!/bin/sh
# Give an email address a role in a library, creating the member if needed.
#   services/core/scripts/role.sh you@example.com admin                       # local database
#   services/core/scripts/role.sh you@example.com moderator --remote          # the manifest's last library
#   services/core/scripts/role.sh you@example.com admin --remote staging      # another library
# Roles: member, moderator, admin. A library is a slug from the manifest;
# each database holds one library, so the community is the one there is.
set -eu
# Addresses are kept in lower case, as sign-in looks them up: Dana@Example.com
# typed here could otherwise never sign in.
EMAIL=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
ROLE="$2"; MODE="${3:---local}"; LIBRARY="${4:-}"
case "$ROLE" in member|moderator|admin) ;; *) echo "role must be member, moderator or admin" >&2; exit 1 ;; esac
# A ULID is 26 characters of Crockford base32, which has no I, L, O or U. The
# prefix is opaque; the role is in memberships.
ID="01J0KEEPER0$(printf '%s' "$EMAIL" | shasum | cut -c1-15 | tr 'a-f' 'A-F')"
NAME="${EMAIL%%@*}"
COMMUNITY="(SELECT id FROM communities)"
SQL="INSERT OR IGNORE INTO members (id, email, display_name, locale, created_at) VALUES ('$ID', '$EMAIL', '$NAME', 'en', unixepoch());
INSERT OR IGNORE INTO memberships (member_id, community_id, role, status, joined_at)
  SELECT id, $COMMUNITY, '$ROLE', 'active', unixepoch() FROM members WHERE email = '$EMAIL';
UPDATE memberships SET role = '$ROLE', status = 'active' WHERE community_id = $COMMUNITY
  AND member_id = (SELECT id FROM members WHERE email = '$EMAIL');
SELECT m.email, ms.role FROM members m JOIN memberships ms ON ms.member_id = m.id WHERE m.email = '$EMAIL';"
cd "$(dirname "$0")/../../.."
if [ "$MODE" = "--remote" ]; then
	if [ -z "$LIBRARY" ]; then
		LIBRARY=$(node --input-type=module -e 'import { manifest } from "./scripts/libraries.mjs"; const { libraries } = manifest(); console.log(libraries[libraries.length - 1].slug)')
	fi
	npx wrangler d1 execute "$LIBRARY-core" --remote -c "$(node scripts/config.mjs "$LIBRARY" core)" --command "$SQL"
else
	npx wrangler d1 execute cdl-core --local --persist-to .wrangler/state -c services/core/wrangler.jsonc --command "$SQL"
fi
