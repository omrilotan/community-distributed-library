# Delivery degraded

**From:** the weekly digest and the ops tools: `emails_given_up` (emails dropped after five tries),
`webhooks_failing` (deliveries failed for good) or `push_gone` (browsers that threw a subscription
away, for information).

**Means:** some members missed a message, or a member's webhook stopped working.

## First look

- **Observability**, `event` = `email.given_up` or `email.send_failed`, and `push.rejected` by
  `status`.
- `webhook_deliveries` with `status = 'failed'`: `last_status` and `last_error` say why. A hook
  that keeps failing switches itself off; its owner sees why on `/connect`.

## Safe now

- Nothing: given-up emails are gone, and members see the same news in the app.

## Fix prompt notes

Add after step 1: "A receiver that answers 4xx or times out is the receiver's problem. Only a
failure in how core builds or signs the delivery is ours."
