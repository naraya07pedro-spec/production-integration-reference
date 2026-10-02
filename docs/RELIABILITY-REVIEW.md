# Integration reliability review

Evan Naraya's runnable TypeScript and PostgreSQL reference demonstrates safe intake, reservation before an external action, bounded retries and explicit persisted outcomes. It is synthetic reference/demo work, separate from historical n8n exports and private client systems.

## Thirty second source path

[Raw-byte HMAC](../src/webhook.ts) → [handler](../src/handler.ts) → [atomic reservation](../src/idempotency.ts) → [partial-failure tests](../tests/integration.test.ts) → [database contention](../tests/db/postgres.test.ts) → [signed end-to-end demo](../scripts/demo.ts) → [executed CI](https://github.com/naraya07pedro-spec/production-integration-reference/actions/workflows/ci.yml).

| Boundary | Implemented behavior | Material limit |
| --- | --- | --- |
| Intake | HMAC SHA-256 over original request bytes, timing-safe compare before parsing | No timestamp freshness rule for unseen old signed events |
| Contract | Size, JSON, identity, email and region checks before reservation | A trusted source namespace is part of deployment configuration |
| Identity | Source plus immutable event ID, independent of mutable email | Retention determines the replay horizon |
| Contention | PostgreSQL unique constraint and INSERT ON CONFLICT decide one winner | Requires the real database; a memory fixture is separate evidence |
| Retry | 408, 429, 5xx and transport failures; bounded exponential delay and jitter | Provider must honor Idempotency-Key; no Retry-After coordinator |
| Outcome | Persist SENT or FAILED; existing states block another action | Provider acceptance is not final recipient delivery |
| Partial commit | Successful external action plus failed markSent leaves RESERVED | Human/provider reconciliation is required; no automatic takeover |
| Logging | Fixed event names and error classes; no raw payload/provider messages | DB stores normalized payload and needs deployment retention/access controls |

## Controlled partial failure case

Context: processLeadEvent reserves a synthetic event and the injected downstream accepts it. Failure: markSent is forced to throw a database-unavailable error. Root cause: provider and database writes cannot share a transaction. Safeguard: the reservation stays RESERVED rather than releasing ownership or retrying the external action. Verified result: the existing test asserts rejection and retained RESERVED state. See [integration.test.ts](../tests/integration.test.ts).

This is a controlled fault test, not a recovered customer incident. The durable PostgreSQL implementation is covered separately by database tests in CI. Any manual retry must reconcile the provider outcome first; deleting the reservation would discard the protection.

## Other proof and recovery

Tests cover changed-email replay, malformed intake, reservation failure before send, permanent versus transient HTTP failure and privacy-safe logs. Database CI exercises contention, stored replay and persisted outcomes; the signed demo travels through the actual HTTP intake and mock receiver. [Historical daily-state case](debugging-case.md) is separate repository history. [VAREVANT flagship](https://github.com/naraya07pedro-spec/varevant.com/blob/main/n8n/FLAGSHIP-CASE-STUDY.md) separates historical controls from these reference guarantees.

Run `npm run typecheck` and `npm test`. For a disposable database, follow the [README](../README.md) and run `npm run test:db` and `npm run demo`. No exactly-once, client production use or uptime claim is made.
