-- 在 Supabase SQL Editor 中运行（https://supabase.com/dashboard/project/lqcuklhldvkwbkpftjzu/sql/new）
-- 创建 duetto 认证持久化表
CREATE TABLE IF NOT EXISTS duetto_auth (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  salt text NOT NULL,
  hash text NOT NULL,
  secret text NOT NULL,
  created bigint NOT NULL
);

-- 允许 service_role 密钥读写
ALTER TABLE duetto_auth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON duetto_auth
  FOR ALL USING (true) WITH CHECK (true);
