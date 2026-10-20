---
name: make-admin
description: Give someone a role (admin, moderator or member) in one of the person's own Community Distributed Libraries, from the command line. Use when someone is locked out of their library, needs another admin or moderator, or asks to change a member's role without the website.
---

# Give someone a role

Most role changes are made in the library itself, in **Moderation** > **Members**. Use this when
that is not possible, for example when no admin can sign in.

1. Ask for the email address, the role (`admin`, `moderator` or `member`), and which library, by its
   slug from `libraries.json`. With one library, use it.
2. Confirm in one line ("Make sam@example.org an admin of our-street?") and wait for a yes. This
   changes the live library. When it takes an admin down to moderator or member, first make sure
   another admin remains, or nobody can manage the library from the website.
3. Run, loading the keys in the same command (never print them):

   ```sh
   set -a; . ./.env; set +a; services/core/scripts/role.sh <email> <role> --remote <slug>
   ```

   It makes the member if they are new, and prints their email and role when done.

4. Tell them that person can now sign in at the library's address with that email.
