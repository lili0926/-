-- 在 Supabase SQL Editor 中运行（https://supabase.com/dashboard/project/lqcuklhldvkwbkpftjzu/sql/new）
-- 创建 duetto 认证持久化表（支持 auth + ncm_cookie）
CREATE TABLE IF NOT EXISTS duetto_auth (
  id integer PRIMARY KEY CHECK (id IN (1,2)),
  salt text,
  hash text,
  secret text,
  created bigint,
  cval text
);

ALTER TABLE duetto_auth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON duetto_auth
  FOR ALL USING (true) WITH CHECK (true);

-- 如果之前已经创建了旧表（没有 cval 列），运行下面这行：
-- ALTER TABLE duetto_auth ADD COLUMN IF NOT EXISTS cval text;
