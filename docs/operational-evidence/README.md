# Operational n8n Evidence

Historical, privacy-reviewed n8n screenshots from VAREVANT workflows, organized for fast technical review. These captures show specific execution states and control-flow signals; they do not establish aggregate reliability, production traffic, client impact, or business outcomes.

## What this evidence shows

- scheduled/execution history with both success and failure states;
- a completed manual workflow test;
- discovery and routing paths with visible node execution;
- failure visibility at a named handler;
- sendability/routing decisions and item-state transitions.

## Evidence index

### Evidence 1 — Execution history with success and failure

![n8n execution history with success and error states](../evidence/06-n8n-execution-overview.webp)

**Context:** historical n8n execution list for a VAREVANT workflow.

**Verified:** one visible successful run and one visible failed run, including timestamps and durations.

**Engineering significance:** failure visibility and execution-state observability are present in the workflow UI.

**Boundary:** two visible records do not establish uptime, success rate, or downstream delivery.

### Evidence 2 — Completed manual test path

![n8n successful manual test path](../evidence/02-n8n-successful-test-execution.webp)

**Context:** historical manual test execution.

**Verified:** the visible executed path reaches the no-candidate stop branch and n8n reports the workflow as successfully executed.

**Engineering significance:** the screenshot shows a bounded stop path rather than forcing downstream work when no candidate batch is available.

**Boundary:** this does not prove email delivery, every branch, or the inactive synthetic n8n demo in this repository.

### Evidence 3 — Discovery execution path

![n8n discovery execution path](../evidence/01-n8n-discovery-execution-path.webp)

**Context:** historical discovery workflow segment.

**Verified:** search, aggregation, candidate-processing, and no-candidate stop nodes are visibly executed with item counts.

**Engineering significance:** the path exposes intermediate processing state and a deterministic stop condition.

**Boundary:** node labels and green execution states do not prove aggregate production behavior or correctness of unshown code.

### Evidence 4 — Routing and sendability path

![n8n routing execution path](../evidence/03-n8n-routing-executed-path-alt.webp)

**Context:** historical routing segment combining prospect and suppression/risk inputs.

**Verified:** visible item counts flow through merge and sendability selection; the false branch reaches `No Sendable Now`.

**Engineering significance:** the capture demonstrates explicit routing, suppression-aware selection, and a no-send fallback instead of unconditional dispatch.

**Boundary:** the screenshot does not expose the selection implementation or prove that every item was classified correctly.

### Evidence 5 — Surfaced workflow failure

![n8n failed execution with handler error](../evidence/04-n8n-failed-execution.webp)

**Context:** historical failed execution at `Handle Public Search Fetch Error`.

**Verified:** n8n surfaces the exact payload-shape error: `A 'json' property isn't an object [item 0]`.

**Engineering significance:** the failure is visible at a named handler instead of being silently swallowed, which is useful for debugging and recovery work.

**Boundary:** the available public evidence does not prove the root cause, fix, or a later successful execution of the same failing path.

## Summary

| Evidence | Verified | Engineering signal | Not established |
| --- | --- | --- | --- |
| Execution history | One success + one error visible | Observability / failure visibility | Aggregate reliability, uptime |
| Manual test | Visible successful completion | Bounded stop path | Delivery or all-branch coverage |
| Discovery path | Executed nodes + item counts | State visibility / deterministic stop | Hidden node correctness |
| Routing path | Merge, selection, no-send branch | Routing / suppression / no-send guard | Correctness of selection code |
| Failed execution | Named handler + exact error | Debuggable failure surface | Root cause, fix, recovery |

## Privacy and source integrity

The public images above are the already-sanitized historical copies in [`docs/evidence/`](../evidence/). The existing gallery records that they were supplied as sanitized source images and visually reviewed for readable sensitive values. A separate master workflow capture remains withheld because sender identity is visible.

No screenshot is reconstructed here. This page only provides a recruiter-first review path over the existing public evidence.
