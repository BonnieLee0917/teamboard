# Teamboard Backend Architecture (draft)

> 状态：Pre-PRD draft · 4/29 17:10 · 待 Bonnie 17:30 PRD 校准
> ship deadline: **4/30 16:00**

## 1. Stack

| 层 | 选型 | 理由 |
|---|---|---|
| Runtime | Cloudflare Workers | 跟 GemBlitz API 同栈，0 冷启 |
| DB | Cloudflare D1 | SQLite 兼容，零运维 |
| Realtime | Durable Object + WebSocket（fallback SSE） | DO 单实例广播，避免多 region 状态不一致 |
| LLM | Workers AI (`@cf/meta/llama-3.1-8b-instruct`) | 免外部 key，无外网延迟雷区 |
| Cron | Workers Cron Trigger | 内置，配 wrangler.toml |
| Discord | webhook + bot token | 双向 |

## 2. REST API 契约

```
GET    /api/agents                       → Agent[]
GET    /api/agents/:id                   → Agent

GET    /api/tasks?status=&assignee=      → Task[]
POST   /api/tasks                        body: { title, description?, assignee_id, parent_id?, scheduled_for? }
PATCH  /api/tasks/:id                    body: { status?, assignee_id?, description? }
DELETE /api/tasks/:id

GET    /api/feed?since=<ts>&limit=50     → Activity[]

GET    /api/reports?date=YYYY-MM-DD      → Report
GET    /api/reports/today                → Report
POST   /api/reports/generate             → 强制生成（admin）

GET    /api/dependencies                 → { nodes: Task[], edges: [{from,to}] }（依赖图只读 v1）
GET    /api/schedule                     → Task[]（scheduled_for IS NOT NULL）

# Realtime
GET    /api/stream                       → WebSocket upgrade，server push 所有 activity 事件

# Discord webhook
POST   /api/discord/interactions         → 验签 + 路由（slash cmd / button）
POST   /api/discord/events               → message_create 等事件
```

鉴权：Web 端 `X-Teamboard-Token` (单 token, secret); Discord 端走签名校验 (Ed25519 nacl).

## 3. Discord 双向流程

### 出向（派活 → Discord）
```
1. POST /api/tasks { assignee_id, title } 进 D1
2. Worker → Discord REST: POST /channels/{cid}/messages
   body: "<@assignee_id> 新任务 #{taskId}: {title}\n回复『完成』或『阻塞』关闭"
3. response.id 写回 tasks.discord_msg_id
4. activity 入库 + 广播
```

### 入向（Discord 回执 → teamboard）
```
1. Discord → POST /api/discord/events （bot subscribed to message_create）
2. 验签 (nacl Ed25519 verify)
3. 解析消息：
   - 引用了 tasks.discord_msg_id 的回复 → 关联任务
   - 关键字匹配：完成/done → status=done；阻塞/blocked → status=blocked；进度 → activity message_in
4. UPDATE tasks SET ...; INSERT activities
5. DO broadcast → 前端 SSE
```

## 4. AI 日报

- Cron: `0 23 * * *` (Asia/Shanghai 23:00)
- 拉数据: 当日所有 activities + tasks 状态变更
- Prompt 模板（精简 ~300 token，避免 8B 模型偏题）：
  ```
  你是团队周报机器人。基于以下事件，生成 4 段 markdown：
  ① 今日完成任务（数量+亮点）
  ② 当前阻塞
  ③ 各 agent 输出摘要
  ④ 明日重点
  事件: {jsonl}
  ```
- 入 reports 表，前端拉 `/api/reports/today`
- 失败兜底：模板化降级（无 LLM 字段，直接用统计数字）

## 5. 时间分配（Dev 单人 23h）

| 时段 | 任务 |
|---|---|
| 17:00-18:00 | Wrangler 脚手架 + D1 schema 部署 + agents seed |
| 18:00-20:00 | REST API tasks/agents/feed |
| 20:00-22:00 | Discord 出向 + bot token 配 + 派活 e2e |
| 22:00-00:30 | Discord 入向 + 签名校验 + 回执解析 |
| 00:30-02:00 | DO + WebSocket 实时推送 |
| 02:00-03:30 | 前端联调（Vivian 02:00 给组件）|
| 03:30-04:30 | AI 日报 cron + LLM |
| 04:30-06:00 | 依赖图 / 调度只读端点 |
| 06:00-07:00 | **睡 1h 强制**（凌晨写代码错误率高 3x）|
| 07:00-09:00 | 联调 + 修 Rose 找的 P0 |
| 09:00-13:00 | Rose 全量验收 + 修 P1 + 部署 |
| 13:00-16:00 | 最终 polish + smoke test + ship |

总计 23h，含 1h 强制睡眠 + 3h polish buffer。

## 6. 风险

| 风险 | 概率 | 缓解 |
|---|---|---|
| Discord 签名校验调不通 | 中 | 提前用 ngrok 本地 dev，凌晨前必须打通，否则 #6 砍 |
| Workers AI 8B 模型偏题 | 中 | 模板化降级保底 |
| DO + WebSocket 客户端断连 | 中 | SSE fallback |
| D1 写入限流 | 低 | 当前规模 <1000 row/day，远低于限额 |

