-- 通话专用配置：对话模型 / 音色 / 指向哪把密钥。
-- 与家庭管家解耦：管家改 family_ai_keys.model 不再影响通话。
-- key_id 只存指针，api_key 与 base_url 仍只有一份；密钥被删时置空，通话自动回退第一把 MiMo。
CREATE TABLE IF NOT EXISTS family_voice_settings (
  family_id  TEXT PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  key_id     TEXT REFERENCES family_ai_keys(id) ON DELETE SET NULL,
  model      TEXT NOT NULL,
  voice      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
