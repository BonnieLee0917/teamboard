-- D1 migration 0003 · PRD §5 schema alignment
-- 目标：把 0001/0002 的偏离点向 PRD §5 逐步拉齐
-- D1/SQLite 不支持 ALTER COLUMN / ALTER CHECK，所以：
--   - 新增列用 ADD COLUMN
--   - CHECK 约束偏离：靠 app 层 handler 强制，等量 migration 不做 DROP
--   - 字段名偏离（assigner→creator / done_at→completed_at）：ADD COLUMN 新列，写时双写，读时优先新列

-- ─── tasks：PRD 字段补齐 ─────────────────────────────────

-- PRD: creator_id (对应现有 assigner_id；前端/API 统一用 creator_id，assigner_id 保留向后兼容)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS creator_id TEXT;
-- 回填：把 assigner_id 复制过来
UPDATE tasks SET creator_id = assigner_id WHERE creator_id IS NULL;

-- PRD: completed_at (对应现有 done_at；双写，读时优先 completed_at)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at INTEGER;
-- 回填
UPDATE tasks SET completed_at = done_at WHERE completed_at IS NULL AND done_at IS NOT NULL;

-- PRD: due_at
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_at INTEGER;

-- ─── task_dependencies：独立 DAG 表 ─────────────────────────
-- PRD §5 要单独建表，0001/0002 只有 parent_id；现在补上
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id      TEXT NOT NULL,
  depends_on   TEXT NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  PRIMARY KEY (task_id, depends_on),
  FOREIGN KEY (task_id)    REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deps_task       ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON task_dependencies(depends_on);

-- ─── events：PRD 字段名对齐 ──────────────────────────────────
-- PRD: events.type；0002 用的是 events.kind（已有，功能等价）
-- D1 不能 RENAME COLUMN，改用 view 模拟（只读场景用 view，handler 继续写 kind）
CREATE VIEW IF NOT EXISTS v_events AS
SELECT id, kind AS type, agent_id AS actor_id, task_id, payload, discord_msg_id, created_at
FROM events;

-- ─── agents：PRD status 枚举补齐 ─────────────────────────────
-- PRD: online/busy/idle/offline；当前 CHECK idle/working/blocked/offline
-- D1 不能 ALTER CHECK，handler 层面接受 online/busy 并映射到存储值
-- 无需 SQL 变更，见 backend src/handlers/agents.ts 的 normalizeStatus()

-- ─── comments：确保 PRD 字段完整 ─────────────────────────────
-- 0002 已建，字段基本对齐。补 updated_at（PRD 没要求但实用）
ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at INTEGER;
