# Security Policy

## Project scope

This repository is an **executable integration reference**, not an operated customer service. Its examples use synthetic data and disposable local test credentials. Its tests demonstrate specific behavior at tested revisions, not a universal security guarantee.

## Report a vulnerability privately

Please **do not** open a public issue with exploit details, active credentials, customer records, or sensitive request bodies.

1. If GitHub offers **Report a vulnerability** in this repository's **Security** tab, use that private channel.
2. Otherwise, contact the maintainer at **evannarayahp@gmail.com** with the subject `Security report: production-integration-reference`. This is the public contact address already listed on the maintainer's GitHub profile.

Include, when safe:
- The affected commit SHA, file or API endpoint, and environment.
- Minimal reproduction using **synthetic data** only.
- Observed behavior, expected behavior, and estimated impact.
- Whether the report concerns HMAC verification, replay/idempotency, downstream side effects, authorization, secrets, or dependencies.

Do **not** send API keys, personal data, full customer payloads, or destructive proof-of-concept requests. No response-time or bounty commitment is implied.

## Security boundaries

- The webhook HMAC is checked against the **raw request bytes** before parsing. Test fixtures are not a substitute for actual signing-key lifecycle controls.
- PostgreSQL event reservation and downstream idempotency assumptions are distinct. An upstream timeout **does not** prove the downstream effect failed.
- The README describes intentionally conservative behavior for ambiguous outcomes, partial persistence failure, retries, and replay.
- CI and tests validate specific conditions only; they do not establish safety for arbitrary providers or a production deployment.

Refer to [README.md](README.md), [reliability review](docs/RELIABILITY-REVIEW.md), and [test cases](tests/) for executable evidence.

## Supported versions and disclosure

The maintained reference is the repository's default branch and its explicitly identified tested revisions. No long-term security-support window is promised for historical commits or example exports.

Reports are reviewed for applicability, exploit preconditions, possible remediation, and whether a public advisory is appropriate. Disclosure should follow a coordinated process where feasible; fixes are not considered validated until relevant tests and CI run on the exact patched revision.

## Dependency maintenance

Dependency version-update proposals are configured in [`.github/dependabot.yml`](.github/dependabot.yml). GitHub vulnerability alerts and automated security-update availability depend on repository settings and platform support; the presence of this file alone does **not** prove those settings are enabled. Review dependency and GitHub Actions upgrades individually, especially major changes; do not merge them automatically.
