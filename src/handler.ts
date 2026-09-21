import { createHash } from "node:crypto";
import { withRetry } from "./retry.js";
import type { DownstreamClient, IdempotencyStore, Logger, NormalizedLead } from "./types.js";

export function normalizeLead(input: unknown): NormalizedLead {
  const obj = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : {};
  const text = (key: string, fallback = "") =>
    typeof obj[key] === "string" ? obj[key].trim() : fallback;
  return { id: text("id"), email: text("email").toLowerCase(),
    region: text("region").toUpperCase(), source: text("source", "unknown").toLowerCase(),
    message: text("message") };
}
export function validateLead(lead: NormalizedLead): string[] {
  const errors: string[] = [];
  if (!lead.id || lead.id.length > 200) errors.push("id_required_or_too_long");
  if (!/^\S+@\S+\.\S+$/.test(lead.email) || lead.email.length > 254) errors.push("valid_email_required");
  if (!lead.region || lead.region.length > 8) errors.push("region_required");
  if (!lead.source || lead.source.length > 100) errors.push("invalid_source");
  if (lead.message.length > 10000) errors.push("message_too_long");
  return errors;
}
// Immutable event identity; changing an email must not bypass duplicate protection.
// JSON tuple encoding avoids delimiter collisions. Source must be a trusted namespace.
export function buildIdempotencyKey(lead: NormalizedLead): string {
  return createHash("sha256").update(JSON.stringify([lead.source, lead.id])).digest("hex");
}
export async function processLeadEvent(
  input: unknown,
  deps: { store: IdempotencyStore; downstream: DownstreamClient; logger: Logger },
  config: { allowedRegions?: string[]; maxAttempts?: number; baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>; random?: () => number } = {},
): Promise<
  | { status: "blocked"; reason: "validation_failed"; errors: string[] }
  | { status: "duplicate"; state: string; idempotencyKey: string }
  | { status: "sent"; idempotencyKey: string; externalId: string | null }
> {
  const lead = normalizeLead(input);
  const errors = validateLead(lead);
  if (!new Set(config.allowedRegions ?? ["ID", "SG", "AU"]).has(lead.region)) errors.push("region_not_allowed");
  if (errors.length) {
    deps.logger.info("lead_blocked", { reason: "validation_failed", errors });
    return { status: "blocked", reason: "validation_failed", errors };
  }
  const idempotencyKey = buildIdempotencyKey(lead);
  const reservation = await deps.store.reserve(idempotencyKey, lead);
  if (!reservation.acquired) {
    deps.logger.info("duplicate_blocked", { state: reservation.state });
    return { status: "duplicate", state: reservation.state, idempotencyKey };
  }
  let result: { externalId: string | null };
  try {
    result = await withRetry(() => deps.downstream.sendLead(lead, idempotencyKey), {
      ...config,
      onRetry: attempt => deps.logger.info("downstream_retry", { attempt }),
    });
  } catch (error) {
    // Store a fixed category: arbitrary Error.name/message can contain provider data.
    await deps.store.markFailed(idempotencyKey, "downstream_failure");
    deps.logger.error("lead_send_failed", { reason: "downstream_failure" });
    throw error;
  }
  // Do not mark FAILED when the downstream succeeded but the state write failed.
  // Leave RESERVED for manual reconciliation; automatic takeover could duplicate a side effect.
  await deps.store.markSent(idempotencyKey, result.externalId);
  deps.logger.info("lead_sent");
  return { status: "sent", idempotencyKey, externalId: result.externalId };
}
