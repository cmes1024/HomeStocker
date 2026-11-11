-- ---------- share-to-earn capacity reward ----------
-- 新人 = 从未拥有过家庭。不可逆标记放在 users，避免 leave 后重新变成新人。
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_ever_had_family BOOLEAN NOT NULL DEFAULT FALSE;

-- 存量回填：已有 membership 的用户一律视为老用户。
UPDATE users
SET has_ever_had_family = TRUE
WHERE openid IN (SELECT DISTINCT openid FROM memberships);

-- 一条长期分享链接绑定一个邀请者和一个奖励落点家庭。
-- reward_family_id 故意不设外键：户主解散家庭时链接记录仍可保留，由发奖侧判定失效。
CREATE TABLE IF NOT EXISTS invite_links (
  token             TEXT PRIMARY KEY,
  inviter_openid    TEXT NOT NULL,
  reward_family_id  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invite_links_inviter
  ON invite_links (inviter_openid, status);

-- 一个微信号一辈子只贡献一次奖励（invitee_openid 唯一）。
-- pending 由首次建家写路径在同一事务内插入；发奖在独立事务里消费，避免外键失败连累建家。
CREATE TABLE IF NOT EXISTS invite_activations (
  invitee_openid    TEXT PRIMARY KEY,
  token             TEXT NOT NULL,
  inviter_openid    TEXT NOT NULL,
  reward_family_id  TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('pending', 'granted', 'skipped')),
  days              INT,
  skip_reason       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invite_activations_inviter
  ON invite_activations (inviter_openid, status, created_at);
