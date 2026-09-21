# Future evidence collection plan

**Design only. WAITING_FOR_EVIDENCE: no production metrics have been collected here.**
Do not instrument a live workflow without its owner's change process.

Emit counters at these boundaries; export to an existing metrics backend or a separate
append-only metrics store. Counters are operational observations, not a billing ledger;
a process crash can occur between work and metric emission.

| Metric | Definition / emission point |
| --- | --- |
| execution_count | Authenticated, parsed intake requests entering processing, including replays |
| success_count | Requests that finish the SENT write |
| failure_count | Processing exceptions; excludes validation blocks and duplicate responses |
| duplicate_prevented_count | Reservation not acquired, including RESERVED/FAILED replays |
| retry_count | Additional downstream attempt actually started, excluding attempt 1 |
| permanent_failure_count | Downstream failure rejected by the retry classifier |
| avg_processing_latency_ms | Sum of processing duration / observed completed processing requests; publish sum and count too |
| external_integration_count | Gauge of configured logical integrations; this reference has one boundary, not measured production traffic |

Use monotonic timing. Keep validation_blocked_count, unknown_outcome_count and
state_write_failure_count separate so the metrics do not imply every failure was safely undone.
Expose retry exhaustion separately from permanent failures.

Labels: deployment environment, workflow version, fixed outcome/error category,
logical integration name from an allowlist. Never label with email, event ID,
idempotency hash, payload, URL, bearer token, signature, credential name, or provider response.

Before publishing a report: define UTC observation window, exact deployment commit,
counter-reset behavior, scrape gaps, denominator, synthetic/production separation,
and an access-controlled source record. Show missing data as unknown. Do not calculate
time saved, reliability percentages, or external integration counts from architecture diagrams.
No production flow was changed for this plan.
