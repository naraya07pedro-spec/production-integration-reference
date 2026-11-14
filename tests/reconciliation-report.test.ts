import assert from "node:assert/strict";
import test from "node:test";
import {
  formatReconciliationCandidate,
  parseReportArgs,
} from "../scripts/reconciliation-report.js";

test("reconciliation inspection CLI defaults to bounded, masked, read-only output", () => {
  assert.deepEqual(parseReportArgs([]), {olderThanMinutes:15, limit:50, fullKeys:false});
  assert.deepEqual(
    parseReportArgs(["--older-than-minutes","60","--limit","2"]),
    {olderThanMinutes:60, limit:2, fullKeys:false},
  );
  for (const args of [
    ["--limit","0"], ["--limit","101"], ["--limit","1.5"],
    ["--older-than-minutes","0"], ["--older-than-minutes","43201"],
    ["--limit"], ["--limit","2","--limit","3"], ["--invalid"],
  ]) assert.throws(() => parseReportArgs(args));
});

test("report output hides full stable event hashes unless explicitly requested", () => {
  const row = {
    idempotencyKey:"0123456789abcdef0123456789abcdef",
    createdAt:new Date("2026-11-14T02:00:00Z"),
    updatedAt:new Date("2026-11-14T02:01:00Z"),
  };
  const hidden=formatReconciliationCandidate(row);
  assert.equal(hidden.idempotencyKey,"0123456789ab...");
  assert.ok(!JSON.stringify(hidden).includes(row.idempotencyKey));
  assert.equal(formatReconciliationCandidate(row,true).idempotencyKey,row.idempotencyKey);
  assert.equal(hidden.createdAt,"2026-11-14T02:00:00.000Z");
});
