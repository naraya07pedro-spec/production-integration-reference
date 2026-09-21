export type LeadInput = {
  id?: unknown;
  email?: unknown;
  region?: unknown;
  source?: unknown;
  message?: unknown;
};

export type NormalizedLead = {
  id: string;
  email: string;
  region: string;
  source: string;
  message: string;
};

export type ReservationResult =
  | { acquired: true; idempotencyKey: string }
  | { acquired: false; idempotencyKey: string; state: string };

export interface IdempotencyStore {
  reserve(idempotencyKey: string, payload: NormalizedLead): Promise<ReservationResult>;
  markSent(idempotencyKey: string, externalId: string | null): Promise<void>;
  markFailed(idempotencyKey: string, errorClass: string): Promise<void>;
}

export interface DownstreamClient {
  sendLead(lead: NormalizedLead, idempotencyKey: string): Promise<{ externalId: string | null }>;
}

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}
