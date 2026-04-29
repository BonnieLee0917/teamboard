-- D1 schema v2 · teamboard A+丙+ii
-- 6 张表：agents / tasks / dependencies / comments / events / daily_reports
-- 同步自 PRD (Bonnie 17:12)

-- ─── agents ────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,      -- Discord snowflake
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,         -- Dev / PM / EM / Designer / QA / Boss
  avatar_url    TEXT,
  status        TEXT NOT NULL DEFAULT 'idle'
                CHECK (status IN ('idle','working','blocked','offline')),
  focus_task_id TEXT,
  last_active   INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

-- ─── tasks ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,     -- ulid
  title          TEXT NOT NULL,
  description    TEXT,
  assignee_id    TEXT,
  assigner_id    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','blocked','done','cancelled')),
  priority       TEXT NOT NULL DEFAULT 'P2'
                 CHECK (priority IN ('P0','P1','P2')),
  source         TEXT NOT NULL DEFAULT 'web'
                 CHECK (source IN ('web','discord')),
  discord_msg_id TEXT,
  scheduled_for  INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  done_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee  ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_for);

-- ─── dependencies ──────────────────────────────
-- 依赖图：task A blocked_by task B
CREATE TABLE IF NOT EXISTS dependencies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL,            -- 被阻塞的任务
  depends_on TEXT NOT NULL,            -- 前置任务
  created_at INTEGER NOT NULL,
  UNIQUE(task_id, depends_on)
);
CREATE INDEX IF NOT EXISTS idx_deps_task ON dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_deps_on   ON dependencies(depends_on);

-- ─── comments ──────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id        TEXT NOT NULL,
  author_id      TEXT NOT NULL,        -- agents.id
  body           TEXT NOT NULL,
  discord_msg_id TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id, created_at DESC);

-- ─── events（实时 feed）────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kind           TEXT NOT NULL CHECK (kind IN (
                   'task_assigned','task_started','task_progress','task_done',
                   'task_blocked','task_commented','agent_status',
                   'msg_in','msg_out','report_generated'
                 )),
  agent_id       TEXT,
  task_id        TEXT,
  payload        TEXT,                 -- JSON
  discord_msg_id TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_agent   ON events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_task    ON events(task_id);

-- ─── daily_reports ────────────────────────────
CREATE TABLE IF NOT EXISTS daily_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL UNIQUE,   -- YYYY-MM-DD
  summary      TEXT NOT NULL,          -- LLM markdown
  metrics_json TEXT NOT NULL,          -- {tasksCreated, tasksDone, agentBreakdown}
  generated_at INTEGER NOT NULL,
  llm_model    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_date ON daily_reports(date DESC);

-- ─── seed: 6 角色 ──────────────────────────────
INSERT OR IGNORE INTO agents (id, name, role, last_active, created_at) VALUES
  ('1215514715468468224','BonnieLee','Boss',     unixepoch()*1000, unixepoch()*1000),
  ('1488551752675365155','Bonnie',   'PM',       unixepoch()*1000, unixepoch()*1000),
  ('1488908925636968508','Kane',     'EM',       unixepoch()*1000, unixepoch()*1000),
  ('1488911832340234421','Haaland',  'Dev',      unixepoch()*1000, unixepoch()*1000),
  ('1488912690863935539','Vivian',   'Designer', unixepoch()*1000, unixepoch()*1000),
  ('1488913309317992478','Rose',     'QA',       unixepoch()*1000, unixepoch()*1000);
