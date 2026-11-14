import { Pool, type PoolClient } from "pg";
import { pathToFileURL } from "node:url";

// Read-only operational inspection. No state changes or provider calls.
export type ReconciliationCandidate = {
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
};
export type ReportOptions = {
  olderThanMinutes: number;
  limit: number;
  fullKeys: boolean;
};

function boundedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(name + " must be an integer between " + min + " and " + max);
  return value;
}

export function parseReportArgs(args: string[]): ReportOptions {
  let olderThanMinutes = 15;
  let limit = 50;
  let fullKeys = false;
  const used = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!flag || used.has(flag)) throw new Error("Unknown or repeated flag");
    used.add(flag);
    if (flag === "--full-keys") {
      fullKeys = true;
    } else if (flag === "--older-than-minutes" || flag === "--limit") {
      const value = args[++i];
      if (value === undefined || !/^[0-9]+$/.test(value))
        throw new Error("Missing or invalid numeric argument");
      if (flag === "--older-than-minutes") olderThanMinutes = Number(value);
      else limit = Number(value);
    } else {
      throw new Error("Unknown flag");
    }
  }
  boundedInteger(olderThanMinutes, "olderThanMinutes", 1, 43200);
  boundedInteger(limit, "limit", 1, 100);
  return { olderThanMinutes, limit, fullKeys };
}

export async function listReconciliationCandidates(
  client: PoolClient,
  options: Pick<ReportOptions, "olderThanMinutes" | "limit">,
): Promise<ReconciliationCandidate[]> {
  const age = boundedInteger(options.olderThanMinutes, "olderThanMinutes", 1, 43200);
  const limit = boundedInteger(options.limit, "limit", 1, 100);
  const result = await client.query<{idempotency_key: string; created_at: Date; updated_at: Date}>(
    [
      "SELECT idempotency_key, created_at, updated_at",
      "FROM integration_events",
      "WHERE state = 'RESERVED'",
      "  AND created_at <= now() - ($1::integer * interval '1 minute')",
      "ORDER BY created_at ASC, idempotency_key ASC",
      "LIMIT $2",
    ].join("\n"),
    [age, limit],
  );
  return result.rows.map(row => ({
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function formatReconciliationCandidate(candidate: ReconciliationCandidate, fullKeys = false) {
  return {
    idempotencyKey: fullKeys
      ? candidate.idempotencyKey
      : candidate.idempotencyKey.slice(0, 12) + "...",
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

async function main() {
  const options = parseReportArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    max: 1,
  });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      const rows = await listReconciliationCandidates(client, options);
      await client.query("COMMIT");
      console.log(JSON.stringify({
        kind: "unconfirmed_outcome_candidates",
        note: "Age alone does not prove a failed or completed provider write",
        olderThanMinutes: options.olderThanMinutes,
        returnedCount: rows.length,
        limit: options.limit,
        identifiersMasked: !options.fullKeys,
        records: rows.map(row => formatReconciliationCandidate(row, options.fullKeys)),
      }, null, 2));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Never echo a database URL, raw provider exception, event payload or token.
    console.error("Reconciliation report failed: verify CLI parameters, DB access and schema.");
    process.exitCode = 1;
  });
}
