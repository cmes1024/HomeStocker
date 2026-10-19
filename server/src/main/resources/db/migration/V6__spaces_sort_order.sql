-- Spaces custom order (drag / move up-down)
-- 大间隔序号：insert 取 max+1000，reorder 按索引 *1000 全量重编号；
-- 同点插入取中点即可，删除留空档不影响顺序，结构上无需重排。
ALTER TABLE spaces ADD COLUMN sort_order BIGINT NOT NULL DEFAULT 0;

-- 存量回填：按家庭内创建顺序编号（原默认空间排首，回填后仍自然靠前）
UPDATE spaces SET sort_order = t.seq
FROM (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY family_id ORDER BY created_at ASC, id ASC) - 1) * 1000 AS seq
  FROM spaces
) t
WHERE spaces.id = t.id;
