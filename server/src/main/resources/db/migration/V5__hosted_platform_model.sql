ALTER TABLE redeem_codes
  ADD COLUMN hosted_model BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE family_subscriptions
  ADD COLUMN hosted_model_until TIMESTAMPTZ,
  ADD COLUMN model_source TEXT;

CREATE TABLE platform_ai_keys (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  label       TEXT NOT NULL,
  model       TEXT NOT NULL,
  api_key     TEXT NOT NULL,
  position    INT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_ai_keys_position ON platform_ai_keys (position);
