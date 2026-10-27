-- 临期提醒可配置：提醒时间线（提前天数）+ 每日发送时间（时/分）+ 当天发送幂等标记。
-- 默认值与改造前写死的行为一致（提前 3 天、08:00），存量家庭无需回填。
-- 说明：改造前候选日虽是 {当天, +1, +3}，但一次性订阅发送成功即删，实际只会命中最早一档，
-- 因此默认 3 天才是等价默认值（默认 0 会让存量物品的提醒晚 3 天）。
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS expire_reminder_days    INT      NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS expire_reminder_hour    SMALLINT NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS expire_reminder_minute  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expire_notify_last_date DATE;

-- IF NOT EXISTS 同 V6：万一某环境手工执行过本脚本而 flyway_schema_history 未记录，重跑不炸。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'families_expire_reminder_days_check'
  ) THEN
    ALTER TABLE families
      ADD CONSTRAINT families_expire_reminder_days_check
      CHECK (expire_reminder_days BETWEEN 0 AND 30);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'families_expire_reminder_hour_check'
  ) THEN
    ALTER TABLE families
      ADD CONSTRAINT families_expire_reminder_hour_check
      CHECK (expire_reminder_hour BETWEEN 0 AND 23);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'families_expire_reminder_minute_check'
  ) THEN
    ALTER TABLE families
      ADD CONSTRAINT families_expire_reminder_minute_check
      CHECK (expire_reminder_minute BETWEEN 0 AND 59);
  END IF;
END $$;
