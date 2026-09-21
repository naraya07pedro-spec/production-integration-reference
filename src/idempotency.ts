import type { Pool } from "pg";
import type {
  IdempotencyStore,
  NormalizedLead,
  ReservationResult,
} from "./types.js";

export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly pool: Pool) {}

  async reserve(
    idempotencyKey: string,
    payload: NormalizedLead,
  ): Promise<ReservationResult> {
    const result = await this.pool.query<{ idempotency_key: string }>(
      [
        "INSERT INTO integration_events",
        "  (idempotency_key, state, payload, created_at, updated_at)",
        "VALUES ($1, 'RESERVED', $2::jsonb, now(), now())",
        "ON CONFLICT (idempotency_key) DO NOTHING",
        "RETURNING idempotency_key",
      ].join("\n"),
      [idempotencyKey, JSON.stringify(payload)],
    );

    if (result.rowCount === 1) {
      return { acquired: true, idempotencyKey };
    }

    const existing = await this.pool.query<{ state: string }>(
      "SELECT state FROM integration_events WHERE idempotency_key = $1",
      [idempotencyKey],
    );

    return {
      acquired: false,
      idempotencyKey,
      state: existing.rows[0]?.state ?? "UNKNOWN",
    };
  }

  async markSent(idempotencyKey: string, externalId: string | null): Promise<void> {
    await this.pool.query(
      [
        "UPDATE integration_events",
        "SET state = 'SENT', external_id = $2, updated_at = now()",
        "WHERE idempotency_key = $1",
      ].join("\n"),
      [idempotencyKey, externalId],
    );
  }

  async markFailed(idempotencyKey: string, errorClass: string): Promise<void> {
    await this.pool.query(
      [
        "UPDATE integration_events",
        "SET state = 'FAILED', error_class = $2, updated_at = now()",
        "WHERE idempotency_key = $1",
      ].join("\n"),
      [idempotencyKey, errorClass],
    );
  }
}
