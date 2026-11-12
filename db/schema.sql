-- Our Little Kitchen - Postgres schema (Neon)
-- Applied idempotently at server startup by db.ts.
-- The app keeps its state as a single JSONB document, so the client contract
-- (GET/POST /api/storage) stays exactly the same while data lives in Postgres.

CREATE TABLE IF NOT EXISTS app_state (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_state_updated_at_idx
  ON app_state (updated_at DESC);
