# Integration reliability review

Evan Naraya's runnable TypeScript and PostgreSQL reference demonstrates safe intake, reservation before an external action, bounded retries and explicit persisted outcomes. It is synthetic reference/demo work, separate from historical n8n exports and private client systems.

## Thirty second source path

[Raw-byte HMAC](../src/webhook.ts) → [handler](../src/handler.ts) → [atomic reservation](../src/idempotency.ts) → [partial-failure tests](../tests/integration.test.ts) → [database contention](../tests/db/postgres.test.ts) → [signed end-to-end demo](../scripts/demo.ts) → [executed CI](https://github.com/naraya07pedro-spec/production-integration-reference/actions/workflows/ci.yml).

| Boundary | Implemented behavior | Material limit |
| --- | --- | --- |
| Intake | HMAC SHA-256 over original request bytes, timing-safe compare before parsing | Signed timestamp freshness bound at 300 seconds; within-window replay still relies on event reservation |
| Contract | Size, HMAC, JSON, signer-bound source, identity, email and region checks before reservation | `TRUSTED_SOURCE` is required at server startup, and a signed source mismatch is rejected before reservation; each separately trusted source needs its own credential/service boundary. |
| Identity | Server-configured source plus immutable event ID, independent of mutable email | HMAC authenticates bytes, not arbitrary source authority. Retention determines the replay horizon. |
| Contention | PostgreSQL unique constraint and INSERT ON CONFLICT decide one winner | Requires the real database; a memory fixture is separate evidence |
| Retry | 408, 429, 5xx and transport failures; bounded exponential delay/jitter, plus valid 429/503 Retry-After up to 30s | Provider must honor Idempotency-Key; no durable retry scheduler. Over-budget wait hints stop automatic retries for manual/provider reconciliation. |
| Outcome | Persist SENT only after confirmed response; thrown downstream calls leave RESERVED. Explicit operator/provider reconciliation may finalize FAILED from RESERVED; invalid state transitions fail explicitly. | A non-2xx or lost response does not prove a remote side effect did not occur. |
| Partial commit | Successful external action plus failed markSent leaves RESERVED | Human/provider reconciliation is required; no automatic takeover |
| Logging | Fixed event names and error classes; no raw payload/provider messages | DB stores normalized payload and needs deployment retention/access controls |

## Uncertain remote outcome (14 November 2026 proposal)

If a provider commits an event but the client loses its response, the local send throws even though the effect may already exist. The handler now retains RESERVED rather than automatically writing FAILED after any downstream exception (including exhausted 5xx, 4xx, malformed success, and transport failure). The durable key still prevents another side effect by replay. A human must verify the provider's authoritative event outcome before explicitly finalizing a confirmed failure or performing a controlled reconciliation. This is a conservative trade-off: records can remain RESERVED indefinitely without a reconciliation operator. The reference intentionally has no automatic lease takeover, scheduled probe, or automatic retry of a stale reservation.

Unit tests simulate a provider that accepts once but never returns a response and verify no replay after retries exhaust. The PostgreSQL test verifies an exhausted 503 retains RESERVED with no error_class and that a separately confirmed rejection can be finalized as FAILED. These tests are controlled fixtures, not evidence of real external provider correctness. A successful transport response is not proof of business completion.

## Read-only operator triage

`scripts/reconciliation-report.ts` provides a bounded, database-only inspection of aged `RESERVED` records. Its query selects only idempotency hash and timestamps, runs in a READ ONLY transaction through the CLI, and cannot finalize or replay records. Hashes are masked by default; `--full-keys` is a private operator action. Candidate age is **not** a proof of remote failure. PostgreSQL negative tests include a 90-minute-old RESERVED row, a newer RESERVED row and finalized rows, and confirm no state mutation. See [README](../README.md#read-only-reconciliation-triage) and [database tests](../tests/db/postgres.test.ts). No real provider reconciliation has been performed.

## Controlled partial failure case

Context: processLeadEvent reserves a synthetic event and the injected downstream accepts it. Failure: markSent is forced to throw a database-unavailable error. Root cause: provider and database writes cannot share a transaction. Safeguard: the reservation stays RESERVED rather than releasing ownership or retrying the external action. Verified result: the existing test asserts rejection and retained RESERVED state. See [integration.test.ts](../tests/integration.test.ts).

This is a controlled fault test, not a recovered customer incident. The durable PostgreSQL implementation is covered separately by database tests in CI. PostgreSQL state-transition tests also reject updates when an event has been deleted, finalized, or reconciled by another actor: a zero-row UPDATE is not a successful persisted outcome. These checks do **not** make the external provider write atomic with the database. Any manual retry must reconcile the provider outcome first; deleting the reservation would discard the protection.

## Other proof and recovery

Tests cover changed-email replay, malformed intake, reservation failure before send, permanent versus transient HTTP failure and privacy-safe logs. Database CI exercises contention, stored replay and persisted outcomes; the signed demo travels through the actual HTTP intake and mock receiver. [Historical daily-state case](debugging-case.md) is separate repository history. [VAREVANT flagship](https://github.com/naraya07pedro-spec/varevant.com/blob/main/n8n/FLAGSHIP-CASE-STUDY.md) separates historical controls from these reference guarantees.

Run `npm run typecheck` and `npm test`. For a disposable database, follow the [README](../README.md) and run `npm run test:db` and `npm run demo`. No exactly-once, client production use or uptime claim is made.
