-- Capacity / 内测发码管理员：openid 白名单（刷库增删即可，不再用 ADMIN_OPENID 环境变量）。
CREATE TABLE capacity_admins (
  openid      TEXT PRIMARY KEY,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 本地 mock 示例（按需取消注释或手动执行）：
-- INSERT INTO capacity_admins (openid, note) VALUES ('local-dev-openid', 'local mock')
--   ON CONFLICT (openid) DO NOTHING;
