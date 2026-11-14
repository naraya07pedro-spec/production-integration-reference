import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const levels = ["info", "low", "moderate", "high", "critical"];

export function summarizeAudit(stdout, exitCode, commandError = false) {
  const failed = (reason) => ({
    status: "failed", reason, policy: "moderate",
    counts: null, packages: [],
  });
  if (commandError || !Number.isInteger(exitCode)) return failed("audit_command_unavailable");
  let body;
  try { body = JSON.parse(stdout); }
  catch { return failed("invalid_audit_json"); }
  if (!body || typeof body !== "object" || body.error || !body.metadata ||
      !body.metadata.vulnerabilities || !body.vulnerabilities ||
      typeof body.vulnerabilities !== "object" ||
      Array.isArray(body.vulnerabilities)) return failed("invalid_audit_schema");
  const counts = body.metadata.vulnerabilities;
  if (!levels.every((level) => Number.isSafeInteger(counts[level]) && counts[level] >= 0) ||
      !Number.isSafeInteger(counts.total) || counts.total < 0 ||
      levels.reduce((sum, level) => sum + counts[level], 0) !== counts.total)
    return failed("invalid_audit_counts");
  const packages = Object.entries(body.vulnerabilities).map(([name, entry]) => ({
    name,
    severity: entry?.severity ?? "unknown",
    direct: entry?.isDirect === true,
    range: typeof entry?.range === "string" ? entry.range : null,
    fixAvailable: entry?.fixAvailable ?? null,
    advisoryIds: Array.isArray(entry?.via)
      ? entry.via.filter((v) => v && typeof v === "object")
        .map((v) => v.source ?? v.name ?? null).filter((v) => v !== null)
      : [],
  })).sort((a, b) => a.name.localeCompare(b.name));
  // Fail closed if reported counts do not agree with advisory package objects.
  if (packages.length !== counts.total ||
      packages.some((item) => !levels.includes(item.severity)))
    return failed("inconsistent_audit_findings");
  const vulnerable = counts.moderate + counts.high + counts.critical;
  return {
    status: vulnerable || exitCode !== 0 ? "failed" : "passed",
    reason: vulnerable ? "moderate_or_higher_advisory" :
      exitCode !== 0 ? "audit_command_failed" : "none",
    policy: "moderate",
    counts: Object.fromEntries([...levels, "total"].map((key) => [key, counts[key]])),
    packages,
  };
}

export function runAudit() {
  const result = spawnSync("npm", ["audit", "--audit-level=moderate", "--json"], {
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 120_000,
  });
  const report = summarizeAudit(result.stdout ?? "", result.status, Boolean(result.error));
  const output = {
    checkedAt: new Date().toISOString(),
    sourceSha: process.env.EVIDENCE_SOURCE_SHA ?? process.env.GITHUB_SHA ?? null,
    environment: process.env.GITHUB_ACTIONS === "true" ? "github_actions" : "local",
    ...report,
  };
  mkdirSync("artifacts", { recursive: true });
  writeFileSync("artifacts/dependency-audit.json", JSON.stringify(output, null, 2) + "\n");
  // Print sanitized summaries only, not npm registry errors, tokens or raw output.
  console.log(JSON.stringify({
    status: output.status, reason: output.reason,
    counts: output.counts, packageNames: output.packages.map((p) => p.name),
  }));
  if (output.status !== "passed") process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runAudit();
