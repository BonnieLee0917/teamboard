-- backend/seed/events_mock.sql
-- 灌 mock events 给 feed 渲染用，约 12 条覆盖所有 kind
-- 用法：
--   wrangler d1 execute teamboard-prod --remote --file=./seed/events_mock.sql
--   （本地：去掉 --remote）
-- 安全：纯 INSERT，没有 DELETE / TRUNCATE，重复跑会重复插入，可以接受

-- 一些 task 占位（feed 会引用 task_id）
INSERT OR IGNORE INTO tasks (id, title, assignee_id, assigner_id, status, source, created_at, updated_at)
VALUES
  ('task_seed_001', '拆 mockData 接真 API',          '1488911832340234421', '1488908925636968508', 'in_progress', 'web', unixepoch()*1000, unixepoch()*1000),
  ('task_seed_002', '出 confidence_band 状态机色板', '1488912690863935539', '1488908925636968508', 'in_progress', 'web', unixepoch()*1000, unixepoch()*1000),
  ('task_seed_003', '写 WS 重连 smoke 脚本',          '1488913309317992478', '1488551752675365155', 'pending',     'web', unixepoch()*1000, unixepoch()*1000);

-- events: 12 条覆盖 task_assigned / started / progress / done / blocked / review / commented / agent_status / msg_in / msg_out / report
INSERT INTO events (kind, agent_id, task_id, payload, created_at) VALUES
  ('task_assigned',  '1488908925636968508', 'task_seed_001', '{"to":"Haaland","title":"拆 mockData 接真 API"}',                            unixepoch()*1000 - 600000),
  ('task_started',   '1488911832340234421', 'task_seed_001', '{"by":"Haaland"}',                                                            unixepoch()*1000 - 540000),
  ('agent_status',   '1488911832340234421', NULL,            '{"from":"idle","to":"working"}',                                              unixepoch()*1000 - 530000),
  ('task_progress',  '1488911832340234421', 'task_seed_001', '{"note":"client.ts 骨架完成","pct":30}',                                       unixepoch()*1000 - 480000),
  ('task_assigned',  '1488908925636968508', 'task_seed_002', '{"to":"Vivian","title":"confidence_band 色板"}',                              unixepoch()*1000 - 420000),
  ('task_commented', '1488912690863935539', 'task_seed_002', '{"by":"Vivian","text":"用 [data-confidence] attr selector，不写 JS 分支"}',  unixepoch()*1000 - 360000),
  ('msg_in',         '1215514715468468224', NULL,            '{"channel":"#agent-team","text":"你们 21 点就停工了？"}',                      unixepoch()*1000 - 300000),
  ('task_blocked',   '1488911832340234421', 'task_seed_001', '{"reason":"等 schema 文档"}',                                                 unixepoch()*1000 - 240000),
  ('msg_out',        '1488908925636968508', NULL,            '{"channel":"#agent-team","text":"schema 我贴在群里了"}',                      unixepoch()*1000 - 180000),
  ('task_progress',  '1488911832340234421', 'task_seed_001', '{"note":"/api/agents 接通","pct":60}',                                        unixepoch()*1000 - 120000),
  ('task_review',    '1488913309317992478', 'task_seed_003', '{"by":"Rose","note":"WS smoke 脚本就位"}',                                    unixepoch()*1000 - 60000),
  ('report_generated', NULL,                NULL,            '{"date":"2026-04-30","tasksCreated":3,"tasksDone":0}',                        unixepoch()*1000 - 30000);
