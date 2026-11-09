# Production Integration Reference

A TypeScript + PostgreSQL webhook service that keeps a retried or replayed event from triggering the same downstream side effect twice.

[![CI](https://github.com/naraya07pedro-spec/production-integration-reference/actions/workflows/ci.yml/badge.svg)](https://github.com/naraya07pedro-spec/production-integration-reference/actions/workflows/ci.yml)
[![Node.js 24+](https://img.shields.io/badge/node.js-24%2B-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Hiring manager quick scan

**Role fit:** Integration Engineer · Backend/API Engineer · Automation Engineer

Reference/demo code with synthetic fixtures. Despite the repository name, this code has no production deployment.

- **Signature checked on raw bytes before JSON parsing:** [src/webhook.ts](src/webhook.ts), wired in [src/server.ts](src/server.ts); rejected-before-side-effect cases in [tests/server.test.ts](tests/server.test.ts).
- **PostgreSQL decides one winner before any HTTP call:** `INSERT … ON CONFLICT DO NOTHING` in [src/idempotency.ts](src/idempotency.ts); 12 concurrent contenders against a real database in [tests/db/postgres.test.ts](tests/db/postgres.test.ts).
- **Retries are classified and bounded:** [src/retry.ts](src/retry.ts) (408/429/5xx/transport only, max 5 attempts, capped backoff + jitter); [tests/retry.test.ts](tests/retry.test.ts), real loopback HTTP in [tests/http-client.test.ts](tests/http-client.test.ts).
- **Partial commit stays blocked instead of re-sending:** downstream success + failed `markSent` leaves `RESERVED` ([src/handler.ts](src/handler.ts), test in [tests/integration.test.ts](tests/integration.test.ts)).
- **Signed end-to-end run in CI:** [scripts/demo.ts](scripts/demo.ts) goes HTTP intake → PostgreSQL → mock receiver → replay blocked; executed by [the CI workflow](.github/workflows/ci.yml).

**Fastest review path:** [reliability review](docs/RELIABILITY-REVIEW.md) → [handler](src/handler.ts) → [reservation](src/idempotency.ts) → [tests](tests/) → [CI runs](https://github.com/naraya07pedro-spec/production-integration-reference/actions/workflows/ci.yml)

## Run it

Node.js 24+. No credentials or database needed:

```sh
npm ci
npm run typecheck
npm test
```

### Optional: database and end-to-end checks

These need a **disposable** PostgreSQL database. Tests and the demo create and drop their own randomly named schema; never point them at a real database.

```sh
docker run --rm --name integration-reference-db -e POSTGRES_USER=reference -e POSTGRES_PASSWORD=local-demo-only -e POSTGRES_DB=reference_test -p 127.0.0.1:5432:5432 -d postgres:17
# Wait until: docker exec integration-reference-db pg_isready -U reference -d reference_test
export TEST_DATABASE_URL=postgresql://reference:local-demo-only@localhost:5432/reference_test
npm run test:db
npm run demo
docker stop integration-reference-db
```

PowerShell: `$env:TEST_DATABASE_URL = 'postgresql://reference:local-demo-only@localhost:5432/reference_test'`. The credentials above are synthetic and local-only.

### Running the service

Apply `db/001_init.sql` (`psql "$DATABASE_URL" -f db/001_init.sql`), set the variables listed in [.env.example](.env.example), then `npm start`.
`POST /events/lead` expects `x-webhook-signature` (hex SHA-256 HMAC of the exact body). [scripts/demo.ts](scripts/demo.ts) is a working signed caller and mock receiver.
Use HTTPS outside localhost. Never commit environment files.

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
| Concurrent replay | Unique SQL constraint and atomic INSERT decide one winner before sending. The database test runs 12 contenders. |
| Transient failure | 408, 429, 500–599 and fetch transport/timeout failures: 3 attempts by default, at most 5; capped exponential delay plus jitter. |
| Permanent error | Other HTTP statuses, invalid success JSON, and application errors are not blindly retried. |
| State | SENT after success; FAILED after send failure; both block replay. |
| Ambiguous delivery | A timeout may occur after the provider accepted the request. The provider **must honor Idempotency-Key** for safe retries. |
| Crash / failed success-write | RESERVED remains blocked pending manual reconciliation; no automatic lease takeover. |
| Replay horizon | Existing event keys block repeated side effects while rows are retained. No timestamp freshness check; an unseen old signed event can still run. |

Failed/RESERVED events need reconciliation with the provider before any manual retry. Do not delete a reservation merely to unblock processing. A duplicate response reports stored state; it does not certify successful delivery.

## Scope and limits

What this repository does **not** prove:

- **Not exactly-once delivery.** Safety depends on the downstream provider honoring `Idempotency-Key`.
- **No production use.** No deployment, traffic, uptime, client, or business-outcome claims. All fixtures are synthetic.
- **Executed checks live in CI history**, not in this README. The workflow file alone proves nothing; see the [Actions runs](https://github.com/naraya07pedro-spec/production-integration-reference/actions/workflows/ci.yml).
- **The bundled n8n workflow is inactive and has never been executed.** [n8n/workflow.sanitized.json](n8n/workflow.sanitized.json) is authored and structure-tested only; import and runtime remain manual ([n8n/README.md](n8n/README.md)).
- **Historical n8n screenshots are separate evidence.** They come from other VAREVANT workflows and do not validate this code ([operational evidence](docs/operational-evidence/README.md), [source-integrity notes](docs/evidence/README.md)).
- **Out of scope:** Retry-After coordination, distributed rate limiting, queueing, credential rotation, retention policy, deployment authentication, timestamp-based replay windows.
- **Data handling:** logs use fixed event names and categories (no payloads, tokens, URLs, provider messages, or external IDs), but the database stores the normalized payload; a real deployment needs restricted DB access and a retention policy.

## Related material

- [Historical debugging case](docs/debugging-case.md): a separate VAREVANT state-overwrite bug, reconstructed from public commits.
- [Metrics collection plan](docs/instrumentation-plan.md): design only, no metrics collected.
- Origin: derived from [VAREVANT source at 78acd16](https://github.com/naraya07pedro-spec/varevant.com/tree/78acd16377bab53a1495fe53abe00a0951a4cf29/examples/production-integration-reference), then hardened independently. Historical workflow source: [VAREVANT n8n engineering pack](https://github.com/naraya07pedro-spec/varevant.com/tree/main/n8n).

## License

[MIT](LICENSE)
