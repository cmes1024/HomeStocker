-- 平台级分享奖励配置（单行）。
-- enabled=false 时家庭页不展示邀请模块，且不再发放新奖励；
-- max_activations=0 表示不限制次数。
CREATE TABLE IF NOT EXISTS invite_settings (
  id              BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  reward_days     INT NOT NULL DEFAULT 7 CHECK (reward_days BETWEEN 1 AND 365),
  max_activations INT NOT NULL DEFAULT 5 CHECK (max_activations BETWEEN 0 AND 100),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

INSERT INTO invite_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
