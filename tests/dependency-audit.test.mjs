import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAudit } from "../scripts/dependency-audit.mjs";

const zero = {
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
  vulnerabilities: {},
};
const audited = (data, status = 0) => summarizeAudit(JSON.stringify(data), status);

test("audit passes only for a well-formed zero-advisory scan with exit status zero", () => {
  assert.equal(audited(zero).status, "passed");
  assert.equal(audited(zero, 1).reason, "audit_command_failed");
});
test("audit fails on moderate or higher findings and preserves package evidence", () => {
  const input = {
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 },
    },
    vulnerabilities: {
      "example-package": {
        severity: "moderate", isDirect: false, range: "<2.0.0", fixAvailable: true,
        via: [{ name: "SYNTHETIC-ADVISORY", source: 12345 }],
      },
    },
  };
  const out = audited(input, 1);
  assert.equal(out.status, "failed");
  assert.equal(out.reason, "moderate_or_higher_advisory");
  assert.deepEqual(out.packages.map((p) => p.name), ["example-package"]);
  assert.deepEqual(out.packages[0].advisoryIds, [12345]);
});
test("audit never passes on invalid JSON, schema, inconsistent counts or registry errors", () => {
  assert.equal(summarizeAudit("not json", 0).status, "failed");
  assert.equal(summarizeAudit("", null, true).status, "failed");
  assert.equal(audited({ error: { code: "ENOAUDIT" } }).status, "failed");
  assert.equal(audited({ ...zero, metadata: { vulnerabilities: { total: 0 } } }).status, "failed");
  assert.equal(audited({
    metadata: { vulnerabilities: { ...zero.metadata.vulnerabilities, total: 1 } },
    vulnerabilities: {},
  }).status, "failed");
  assert.equal(audited({
    metadata: { vulnerabilities: { ...zero.metadata.vulnerabilities, low: 1, total: 1 } },
    vulnerabilities: {},
  }).status, "failed");
});
test("low-only advisories do not trip a moderate threshold, but remain in the report", () => {
  const out = audited({
    metadata: {
      vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0, total: 1 },
    },
    vulnerabilities: { sample: { severity: "low", range: "<1.2.3", via: [], fixAvailable: false } },
  });
  assert.equal(out.status, "passed");
  assert.equal(out.counts.low, 1);
  assert.equal(out.packages[0].name, "sample");
});
