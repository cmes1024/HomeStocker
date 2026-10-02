-- Family AI habits (per-family preference slots, max 7)
CREATE TABLE family_ai_habits (
  family_id    TEXT PRIMARY KEY REFERENCES families (id) ON DELETE CASCADE,
  habits_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
