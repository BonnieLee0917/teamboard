-- D1 schema · teamboard 后端 (commit: TBD)
-- 设计原则：
--   * Discord ID (snowflake) 做天然主键关联，不另设 user 表
--   * 时间戳 INTEGER ms (Date.now())，前端再格式化
--   * status / kind 用 TEXT enum，D1 不支持 ENUM，靠 CHECK 约束

-- ─── agents：5 个 AI 角色 + 小萌自己 ─────
CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,           -- Discord ID
  name          TEXT NOT NULL,              -- "Haaland" / "Vivian" 等
  role          TEXT NOT NULL,              -- "Dev" / "PM" / "EM" / "Designer" / "QA" / "Boss"
  avatar_url    TEXT,
  status        TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','working','blocked','offline')),
  focus_task_id TEXT,                       -- 当前焦点任务 (FK tasks.id, soft)
  last_active   INTEGER NOT NULL,           -- ms
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

-- ─── tasks：派活的最小单元 ──────────────
CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,           -- ulid
  title         TEXT NOT NULL,
  description   TEXT,
  assignee_id   TEXT,                       -- agents.id
  assigner_id   TEXT NOT NULL,              -- agents.id (谁派的)
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','blocked','done','cancelled')),
  parent_id     TEXT,                       -- 依赖父任务 (依赖图用)
  source        TEXT NOT NULL DEFAULT 'web' -- 'web' | 'discord'
                CHECK (source IN ('web','discord')),
  discord_msg_id TEXT,                      -- 派活产生的 Discord message id (用于回执关联)
  scheduled_for INTEGER,                    -- 调度时间 (调度模块用)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  done_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_for);

-- ─── activities：实时 feed ──────────────
CREATE TABLE IF NOT EXISTS activities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL CHECK (kind IN (
                  'task_assigned','task_started','task_progress','task_done',
                  'task_blocked','agent_status','message_in','message_out','report_generated'
                )),
  agent_id      TEXT,
  task_id       TEXT,
  payload       TEXT,                       -- JSON 原文
  discord_msg_id TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_agent ON activities(agent_id, created_at DESC);

-- ─── reports：AI 日报 ────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL UNIQUE,       -- YYYY-MM-DD
  summary       TEXT NOT NULL,              -- LLM 生成的 markdown
  metrics_json  TEXT NOT NULL,              -- {tasksCreated, tasksDone, agentBreakdown}
  generated_at  INTEGER NOT NULL,
  llm_model     TEXT NOT NULL               -- e.g. @cf/meta/llama-3.1-8b-instruct
);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date DESC);

-- ─── seed: 团队 6 个角色 ────────────────
INSERT OR IGNORE INTO agents (id, name, role, last_active, created_at) VALUES
  ('1215514715468468224','BonnieLee','Boss',     unixepoch()*1000, unixepoch()*1000),
  ('1488551752675365155','Bonnie',   'PM',       unixepoch()*1000, unixepoch()*1000),
  ('1488908925636968508','Kane',     'EM',       unixepoch()*1000, unixepoch()*1000),
  ('1488911832340234421','Haaland',  'Dev',      unixepoch()*1000, unixepoch()*1000),
  ('1488912690863935539','Vivian',   'Designer', unixepoch()*1000, unixepoch()*1000),
  ('1488913309317992478','Rose',     'QA',       unixepoch()*1000, unixepoch()*1000);
