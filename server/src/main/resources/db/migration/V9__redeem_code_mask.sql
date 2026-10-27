-- 兑换码展示掩码：发码时存「首 4 + 末 4」，仅供运营记录里逐张区分。
-- 不是完整明文，也不能用于兑换（兑换仍按 code_hash 精确匹配）。
-- 历史已发放的码没有明文可推，保持空串。
ALTER TABLE redeem_codes
  ADD COLUMN code_mask TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN redeem_codes.code_mask IS '展示用掩码，如 YUXR-****-VP87；历史行为空';
