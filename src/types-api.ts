// src/types-api.ts — Backend API types (来自 Kane 15:42 grep migrations/0001_init.sql)
// 与前端 src/types.ts 的看板域 (Task/SprintState) 解耦，等 mapper 桥接

export type AgentRole = 'Dev' | 'PM' | 'EM' | 'Designer' | 'QA' | 'Boss'
export type AgentStatus = 'idle' | 'active' | 'blocked' | 'offline'
export type ConfidenceBand = 'high' | 'medium' | 'low'
export type Staleness = 'fresh' | 'stale' | 'cold'

// Feed event — 后端 D1 events 表原始行 (Kane curl /api/feed?limit=20)
export interface FeedEvent {
  id: number
  kind: string                  // 'task_progress' | 'task_review' | 'task_blocked' | 'msg_out' | 'report_generated' | ...
  agent_id: string | null
  task_id: string | null
  payload: string               // JSON string
  discord_msg_id: string | null
  created_at: number            // ms epoch
}

// Vivian 4/30 定义：fresh<60s / stale<5m / cold>=5m
export function staleness(lastEventAt: number, now = Date.now()): Staleness {
  const diff = now - lastEventAt
  if (diff < 60_000) return 'fresh'
  if (diff < 5 * 60_000) return 'stale'
  return 'cold'
}

export interface Agent {
  id: string                    // Discord snowflake
  name: string                  // "Haaland" / "Vivian" ...
  role: AgentRole
  avatar_url: string | null
  status: AgentStatus
  focus_task_id: string | null
  last_active: number           // ms epoch
  confidence_band?: ConfidenceBand  // Kane 后续字段，未定先 optional
}

// ─── Validators ────────────────────────────────────────────────────────────
// 严格穷举 confidence_band（Kane 15:17 拍的护栏），第四值返回 undefined
// → DOM 不写 data-confidence → CSS attr selector 不命中 → 中性态
// 与 Vivian color doc 顶部 "未匹配 = 不上色，不是默认 low" 对齐

const CONFIDENCE_VALUES: ReadonlyArray<ConfidenceBand> = ['high', 'medium', 'low']

export function normalizeConfidence(raw: unknown): ConfidenceBand | undefined {
  return CONFIDENCE_VALUES.includes(raw as ConfidenceBand)
    ? (raw as ConfidenceBand)
    : undefined
}

const STATUS_VALUES: ReadonlyArray<AgentStatus> = ['idle', 'active', 'blocked', 'offline']
export function isAgentStatus(s: unknown): s is AgentStatus {
  return typeof s === 'string' && STATUS_VALUES.includes(s as AgentStatus)
}
