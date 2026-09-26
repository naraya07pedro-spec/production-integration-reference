# Production Integration Reference

A runnable **TypeScript + PostgreSQL integration reference** for technical review.
It demonstrates signed webhook intake, atomic reservation before HTTP side effects,
classified retries, and persisted outcomes. **Reference/demo code; no client or production-use claim.**

**Operational n8n evidence:** [reviewer-first execution, routing, sendability, and failure evidence](docs/operational-evidence/README.md).

**Review order:** [handler](src/handler.ts) → [PostgreSQL reservation](src/idempotency.ts) →
[tests](tests/) → [CI](https://github.com/naraya07pedro-spec/production-integration-reference/actions/workflows/ci.yml) →
[operational n8n evidence](docs/operational-evidence/README.md) → [historical evidence notes](docs/evidence/README.md) → [inactive synthetic n8n JSON](n8n/workflow.sanitized.json) →
[debugging case](docs/debugging-case.md).

## Run in two minutes

Node.js 24+:

```sh
npm ci
npm run typecheck
npm test
```

Unit and loopback HTTP tests need no credentials or database.
For real database concurrency tests and the signed end-to-end demo, use a **disposable** PostgreSQL database:

```sh
docker run --rm --name integration-reference-db -e POSTGRES_USER=reference -e POSTGRES_PASSWORD=local-demo-only -e POSTGRES_DB=reference_test -p 127.0.0.1:5432:5432 -d postgres:17
# Wait until: docker exec integration-reference-db pg_isready -U reference -d reference_test
export TEST_DATABASE_URL=postgresql://reference:local-demo-only@localhost:5432/reference_test
npm run test:db
npm run demo
docker stop integration-reference-db
```

PowerShell: use `$env:TEST_DATABASE_URL = 'postgresql://reference:local-demo-only@localhost:5432/reference_test'`.
These commands use explicitly synthetic, local-only database credentials.
Tests/demo create and drop their own randomly named schema; never point them at production.

## Architecture

```mermaid
flowchart LR
  A[Signed event / n8n demo] --> B[Verify raw-byte HMAC]
  B --> C[Normalize and validate]
  C --> D[Postgres unique reservation]
  D -->|existing key| E[Return stored state]
  D -->|acquired| F[HTTP request with stable idempotency key]
  F -->|408 / 429 / 5xx / transport| G[Bounded backoff + jitter]
  G --> F
  F --> H[Persist SENT or FAILED]
```

## Decisions and failure model

| Decision / failure | Behavior and limit |
| --- | --- |
| HMAC | SHA-256 over exact body bytes; timing-safe comparison; reject before JSON parsing. |
| Invalid input | 400 malformed JSON, 401 invalid signature, 413 over 64 KiB, 422 invalid fields/region. |
| Event identity | Hash of source + immutable event ID; email changes do not evade deduplication. Source must be a trusted namespace. |
| Concurrent replay | Unique SQL constraint and atomic INSERT decide one winner before sending. CI exercises 12 contenders. |
| Transient failure | 408, 429, 500–599 and fetch transport/timeout failures: 3 attempts by default, at most 5; capped exponential delay plus jitter. |
| Permanent error | Other HTTP statuses, invalid success JSON, and application errors are not blindly retried. |
| State | SENT after success; FAILED after send failure; both block replay. |
| Ambiguous delivery | A timeout may occur after the provider accepted the request. The provider **must honor Idempotency-Key** for safe retries. |
| Crash / failed success-write | RESERVED remains blocked pending manual reconciliation; no automatic lease takeover. |
| Replay horizon | Existing event keys block repeated side effects while rows are retained. No timestamp freshness check; an unseen old signed event can still run. |

This is **not exactly-once delivery**. Failed/RESERVED events require reconciliation with the provider before any manual retry. Do not delete a reservation merely to unblock processing. A duplicate response reports stored state; it does not certify successful delivery. Retry-After coordination, distributed rate limiting, queueing, credential rotation, retention policy, and deployment authentication are outside this reference.

## Inspect or run the service

- [SQL migration](db/001_init.sql), [retry policy](src/retry.ts), [HMAC](src/webhook.ts), [server](src/server.ts)
- [Database test](tests/db/postgres.test.ts), [HTTP tests](tests/http-client.test.ts)
- [Sanitized n8n workflow](n8n/workflow.sanitized.json) and [import/setup boundary](n8n/README.md)
- [Historical debugging case](docs/debugging-case.md) and [metrics collection plan](docs/instrumentation-plan.md)

For a separately configured service, apply `db/001_init.sql` with `psql "$DATABASE_URL" -f db/001_init.sql`,
then set `DATABASE_URL`, `WEBHOOK_SECRET`, `DOWNSTREAM_URL`, `DOWNSTREAM_TOKEN` and run `npm start`.
`POST /events/lead` expects `x-webhook-signature` (hex SHA-256 HMAC).
See [scripts/demo.ts](scripts/demo.ts) for a working signed caller and mock receiver.
Use HTTPS outside localhost. Never commit environment files.

## Evidence boundary

Derived from [VAREVANT source at 78acd16](https://github.com/naraya07pedro-spec/varevant.com/tree/78acd16377bab53a1495fe53abe00a0951a4cf29/examples/production-integration-reference), then hardened independently.
The public CI history is the authority for executed checks, not the existence of a workflow file.
Local/CI fixtures are synthetic. No production execution counts, uptime, business outcomes, runtime validation of the synthetic n8n demo, or accepted upstream contributions are claimed.
[Operational n8n evidence](docs/operational-evidence/README.md) provides the reviewer-first index; [historical evidence notes](docs/evidence/README.md) preserve source-integrity and boundary details.

Logs use fixed event names and categories; no payloads, tokens, URLs, provider messages, or external IDs.
The database deliberately stores the normalized payload: real deployments need restricted DB access and a retention policy.
