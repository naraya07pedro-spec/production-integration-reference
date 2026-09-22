# Historical n8n Evidence

This page contains public-safe historical evidence from a separate VAREVANT workflow. One original screenshot is published; four additional audited captures await privacy redaction.

> These screenshots document separate historical VAREVANT workflows. They do not represent execution of the inactive synthetic n8n demo included in this repository, and they make no claim about production traffic, uptime, client impact, or business outcomes.

## Executed routing path

![Historical n8n routing execution with merged item counts and the No Sendable Now branch](05-n8n-routing-executed-path.png)

Executed historical n8n routing segment showing merged input counts, deterministic sendability selection, and a no-send fallback path.

What it verifies:

- The visible executed path reads 4,414 items from Prospect Master and 32 from Suppression & Risk, then merges 4,446 items.
- The selection step outputs one item; `Any Sendable?` takes its false branch to `No Sendable Now`.
- The loop, freeze, and claim nodes are visible but are not shown as executed in this capture.

These are UI item counts, not verified unique people, clients, messages sent, or production traffic. The screenshot does not expose the selection code, establish correctness of the underlying rules, or show an overall success record or timestamp.

## Evidence matrix

“Verified” below refers to evidence inspectable on this page. Private audit findings are not substituted for published proof.

| Evidence | Verified | Not verified / boundary |
| --- | --- | --- |
| Historical n8n workflow structure | YES — visible routing segment | Full architecture and rule implementation |
| Historical routing execution | YES — green path, item counts, no-send branch | Email delivery or whole-workflow completion |
| Successful execution screenshot | NO — not published | Audited source awaits privacy redaction |
| Failed execution screenshot | NO — not published | Audited source awaits privacy redaction |
| Execution timestamps/durations | NO — not published | History capture awaits privacy redaction |
| After-fix recovery | NO | NOT_FOUND in audited screenshot evidence |
| Reusable sub-workflow screenshot | NO | NOT_FOUND in audited screenshot evidence |
| Aggregate production metrics | NO | No verified aggregate data |
| Production traffic, uptime | NO | Not established by this capture |
| Client impact, business outcomes | NO | Not established by this capture |
| Runtime validation of synthetic demo | NO | Import, credential binding, and execution remain manual |

## Publication register

| Planned file | Publication status | Privacy review |
| --- | --- | --- |
| `01-n8n-master-workflow.png` | MANUAL_REDACTION_REQUIRED — not committed | Browser tabs/address bar, identifiers, Gmail/sender text |
| `02-n8n-execution-overview.png` | MANUAL_REDACTION_REQUIRED — not committed | Browser tabs/address bar, identifiers, personal notification |
| `03-n8n-successful-test-execution.png` | MANUAL_REDACTION_REQUIRED — not committed | Browser tabs/address bar and account identifiers |
| `04-n8n-failed-execution.png` | MANUAL_REDACTION_REQUIRED — not committed | Browser tabs/address bar, account identifiers, sender annotation |
| [05-n8n-routing-executed-path.png](05-n8n-routing-executed-path.png) | SAFE_TO_PUBLISH | Visually reviewed; no sensitive values detected |

The published PNG is byte-for-byte identical to the audited source, renamed only. Its existing crop was not changed. No generated content, redaction, rescaling, or reconstruction was applied.

- Resolution: 1207 × 364 pixels.
- SHA-256: `015ccb090cfb1d2283a01bc2153b05198ff090d85c2bc71b19d6603f577f738b`.

Only privacy masking is appropriate for the remaining captures: preserve node states, labels, timestamps, durations, counts, connections, and error text. Unsafe originals and near-duplicate screenshots are excluded from this repository.

## Other inspectable proof

- [Source and tests](../../tests/) and [GitHub Actions](https://github.com/naraya07pedro-spec/production-integration-reference/actions/workflows/ci.yml) cover the TypeScript/PostgreSQL reference using synthetic fixtures.
- [Inactive synthetic n8n demo](../../n8n/README.md) has structural checks; these historical screenshots do not validate its runtime.
- [Historical debugging case](../debugging-case.md) documents a separate repository state-management bug, not recovery from an n8n failure.
