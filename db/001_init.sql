CREATE TABLE IF NOT EXISTS integration_events (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('RESERVED', 'SENT', 'FAILED')),
  payload JSONB NOT NULL,
  external_id TEXT,
  error_class TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_events_state_idx
  ON integration_events (state, updated_at DESC);
