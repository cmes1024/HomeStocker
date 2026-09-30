-- HomeStocker baseline schema (PostgreSQL).
-- Aligned with miniprogram/cloud/collections.md; normalized for RDBMS.
-- No seed business data here. AI prompt/capability seeds come in a later migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- users ----------
CREATE TABLE users (
  openid              TEXT PRIMARY KEY,
  current_family_id   TEXT,
  nickname            TEXT NOT NULL DEFAULT '',
  avatar_url          TEXT NOT NULL DEFAULT '',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- families ----------
CREATE TABLE families (
  id                        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                      TEXT NOT NULL,
  invite_code               TEXT NOT NULL,
  owner_openid              TEXT NOT NULL,
  member_count              INT NOT NULL DEFAULT 1,
  item_count                INT NOT NULL DEFAULT 0,
  background_json           JSONB NOT NULL DEFAULT '{"type":"theme","value":"orange"}'::jsonb,
  expire_reminder_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  tags_seeded_at            TIMESTAMPTZ,
  entitlement_json          JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uk_families_invite_code ON families (invite_code);

-- ---------- memberships ----------
CREATE TABLE memberships (
  openid                        TEXT NOT NULL,
  family_id                     TEXT NOT NULL REFERENCES families (id),
  joined_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  subscribe_expire_granted_at   TIMESTAMPTZ,
  PRIMARY KEY (openid, family_id)
);
CREATE INDEX idx_memberships_openid ON memberships (openid);
CREATE INDEX idx_memberships_family_id ON memberships (family_id);

-- ---------- spaces / locations ----------
CREATE TABLE spaces (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  family_id    TEXT NOT NULL REFERENCES families (id),
  name         TEXT NOT NULL,
  floor_id     TEXT,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  cover_key    TEXT,
  image_key    TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spaces_family_id ON spaces (family_id);

CREATE TABLE locations (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  family_id    TEXT NOT NULL REFERENCES families (id),
  space_id     TEXT NOT NULL REFERENCES spaces (id),
  name         TEXT NOT NULL,
  image_key    TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_locations_space_id ON locations (space_id);
CREATE INDEX idx_locations_family_id ON locations (family_id);

-- ---------- tags ----------
CREATE TABLE tags (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  family_id    TEXT NOT NULL REFERENCES families (id),
  name         TEXT NOT NULL,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tags_family_id ON tags (family_id);

-- ---------- items ----------
CREATE TABLE items (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  family_id          TEXT NOT NULL REFERENCES families (id),
  name               TEXT NOT NULL,
  quantity           NUMERIC NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit               TEXT NOT NULL DEFAULT '',
  note               TEXT NOT NULL DEFAULT '',
  space_id           TEXT NOT NULL REFERENCES spaces (id),
  location_id        TEXT REFERENCES locations (id),
  production_date    DATE,
  expire_date        DATE,
  created_by         TEXT NOT NULL,
  source             TEXT NOT NULL DEFAULT 'ui' CHECK (source IN ('ui', 'agent')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_family_updated ON items (family_id, updated_at DESC);
CREATE INDEX idx_items_family_space ON items (family_id, space_id);
CREATE INDEX idx_items_family_expire ON items (family_id, expire_date);
CREATE INDEX idx_items_location ON items (location_id);

CREATE TABLE item_tags (
  item_id   TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  tag_id    TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX idx_item_tags_tag ON item_tags (tag_id);

CREATE TABLE item_images (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id      TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  sort_order   INT NOT NULL DEFAULT 0,
  object_key   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, sort_order)
);

-- ---------- activities ----------
CREATE TABLE activities (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  family_id        TEXT NOT NULL REFERENCES families (id),
  item_id          TEXT NOT NULL,
  action           TEXT NOT NULL,
  actor_openid     TEXT NOT NULL,
  item_name        TEXT NOT NULL DEFAULT '',
  batch_count      INT,
  space_id         TEXT,
  space_name       TEXT,
  location_id      TEXT,
  location_name    TEXT,
  quantity         NUMERIC,
  unit             TEXT,
  changed_fields   JSONB,
  summary          TEXT,
  source           TEXT NOT NULL DEFAULT 'ui',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_family_created ON activities (family_id, created_at DESC);
CREATE INDEX idx_activities_item_created ON activities (item_id, created_at DESC);

-- ---------- expire subscriptions ----------
CREATE TABLE item_expire_subs (
  item_id      TEXT NOT NULL,
  openid       TEXT NOT NULL,
  family_id    TEXT NOT NULL REFERENCES families (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, openid)
);
CREATE INDEX idx_expire_subs_family_openid ON item_expire_subs (family_id, openid);
CREATE INDEX idx_expire_subs_item ON item_expire_subs (item_id);

-- ---------- capacity / redeem ----------
CREATE TABLE family_subscriptions (
  family_id            TEXT PRIMARY KEY REFERENCES families (id),
  plan_id              TEXT NOT NULL,
  product              TEXT NOT NULL,
  source               TEXT NOT NULL,
  expires_at           TIMESTAMPTZ NOT NULL,
  limits_override      JSONB,
  last_redeem_code_id  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE redeem_codes (
  code_hash          TEXT PRIMARY KEY,
  product            TEXT NOT NULL,
  days               INT NOT NULL,
  plan_id            TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('unused', 'used', 'revoked')),
  used_by_family_id  TEXT,
  used_by_openid     TEXT,
  used_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  note               TEXT NOT NULL DEFAULT ''
);

-- ---------- AI ----------
CREATE TABLE family_ai_keys (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  family_id    TEXT NOT NULL REFERENCES families (id),
  provider     TEXT NOT NULL DEFAULT 'deepseek',
  label        TEXT NOT NULL DEFAULT 'DeepSeek',
  base_url     TEXT NOT NULL,
  model        TEXT NOT NULL,
  api_key      TEXT NOT NULL,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_family_ai_keys_family ON family_ai_keys (family_id);

CREATE TABLE family_trees (
  family_id    TEXT PRIMARY KEY REFERENCES families (id),
  rev          BIGINT NOT NULL DEFAULT 1,
  tree_json    JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_prompts (
  id           TEXT PRIMARY KEY,
  version      INT NOT NULL,
  system_text  TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_capabilities (
  id           TEXT PRIMARY KEY,
  version      INT NOT NULL,
  apis_json    JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- users.current_family_id is soft-ref (family may be deleted / left); no FK to ease leave/dissolve flows.
