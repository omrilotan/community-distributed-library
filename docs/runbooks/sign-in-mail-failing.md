# Members can't sign in

**From:** Workers Issues, `check.failed sign_in_mail_failing`. A sign-in email failed to go in the
last hour (`tallies`, `sign_in_mail_failed`).

**Means:** a member who asks for a sign-in link gets nothing. Members already signed in are fine.

## First look

- **Observability**, `<slug>-notify`, `event` = `email.send_failed`: the provider's code and reason.
- **Email Service → Email Sending**: the sender domain is still verified and sending is on.
- `npm run check:setup`: says if Email Sending is off for the library's domain.

## Safe now

- Turn sending back on: `npx wrangler email sending enable <domain>`.
- Members can sign in on a device that is already signed in, and send themselves a link from
  **Profile → Sign in on another device**.

## Fix prompt notes

Add after step 1: "Check the Email Sending status for the sender domain first; a sending suspension
or a domain left unverified is not a code bug. Only a failure in how notify builds or sends the
message is."
