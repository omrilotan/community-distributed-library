# Data drift

**From:** the weekly digest and the ops tools: `copy_loan_mismatch` (a copy on loan with no active
loan, or shelved while lent) or `loan_no_handoff` (a loan agreed two weeks ago with no handover
proposed).

**Means:** a request answered 200 but changed only half of what it should have. Members may see a
book as out when it is home, or wait on a loan nobody can hand over.

## First look

```sh
npx wrangler d1 execute <slug>-core --remote -c "$(node scripts/config.mjs <slug> core)" \
  --command "SELECT c.id, c.state, (SELECT GROUP_CONCAT(l.status) FROM loans l WHERE l.copy_id = c.id) FROM copies c WHERE c.state = 'on_loan' AND c.quantity = 1 AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id = c.id AND l.status = 'active')"
```

- `moderation_log` and `events` for the copy or loan: which action left it so.

## Safe now

- A moderator can close a loan or mark a copy from **Moderation**; do it only once the cause is
  known, so the evidence stays.

## Fix prompt notes

Add after step 1: "Find the handler that changed one table and not the other, from the events and
moderation_log rows of the copy or loan. Add a test that drives that handler and then runs the
check."
