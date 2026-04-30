// src/lib/api.ts — Teamboard API client
// Owner: Haaland · Created 2026-04-30
//
// 设计原则：
// 1. fetch 薄壳 + 单一错误兜底，调用方拿到的永远是 typed 数据或 ApiError。
// 2. base URL 走 VITE_API_BASE，本地未配置时降级到 mockData（裸 UI 仍可跑）。
// 3. token 走 VITE_API_TOKEN（可选），无 token 也能调（先按无鉴权写，401 立刻喊）。
// 4. WS 走 5s polling 降级方案（PM 4/30 拍板，WS 进 P1 backlog）。

import type { SprintState, Task, ActivityItem, MemberId } from '../types'
import type { Agent, FeedEvent } from '../types-api'
import { mockData } from '../mockData'

const API_BASE_RAW = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
const USE_MOCK = (import.meta.env.VITE_USE_MOCK as string | undefined) === '1'
const API_BASE = API_BASE_RAW.replace(/\/$/, '')
const API_TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined

export class ApiError extends Error {
  status: number
  endpoint: string
  body?: string
  constructor(endpoint: string, status: number, message: string, body?: string) {
    super(`[${status}] ${endpoint}: ${message}`)
    this.name = 'ApiError'
    this.endpoint = endpoint
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCK) {
    throw new ApiError(path, 0, 'mock mode')
  }
  const url = `${API_BASE}${path}`
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (API_TOKEN) headers['X-Teamboard-Token'] = API_TOKEN
  if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(url, { ...init, headers })
  } catch (e) {
    throw new ApiError(path, 0, `network error: ${(e as Error).message}`)
  }
  const text = await res.text()
  if (!res.ok) {
    throw new ApiError(path, res.status, res.statusText, text.slice(0, 500))
  }
  if (!text) return undefined as unknown as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError(path, res.status, 'invalid JSON response', text.slice(0, 500))
  }
}

// ─── Endpoints ─────────────────────────────────────────────────────────────
// schema 暂按 mockData 类型推；Bonnie 15:20 截图来后字段对不齐再 patch。

export async function getAgents(): Promise<Agent[]> {
  return request<Agent[]>('/api/agents')
}

// 看板任务流（后端如果后续提供 /api/tasks 再接，Kane 表格下半段待确认）
export async function getTasks(): Promise<Task[]> {
  return request<Task[]>('/api/tasks')
}

export async function getFeed(limit = 20): Promise<FeedEvent[]> {
  return request<FeedEvent[]>(`/api/feed?limit=${limit}`)
}

// 后端 agent_id 是 Discord snowflake，前端 ActivityItem.actor 是中文名 → 反向查表
function agentNameById(agents: Agent[], id: string | null): MemberId | 'System' {
  if (!id) return 'System'
  const found = agents.find(a => a.id === id)
  if (!found) return 'System'
  const name = found.name as MemberId
  return ['Bonnie', 'Kane', 'Haaland', 'Vivian', 'Rose'].includes(name) ? name : 'System'
}

function kindToTone(kind: string): ActivityItem['tone'] {
  if (kind === 'task_blocked') return 'critical'
  if (kind === 'task_review' || kind === 'report_generated') return 'success'
  if (kind === 'gate_fail') return 'warning'
  return 'default'
}

function kindToMessage(kind: string, payload: string): string {
  let p: Record<string, unknown> = {}
  try { p = JSON.parse(payload) } catch { /* ignore */ }
  switch (kind) {
    case 'task_progress': return `推进任务${p.pct != null ? ` (${p.pct}%)` : ''}${p.note ? ` · ${p.note}` : ''}`
    case 'task_review':   return `进入 review${p.note ? ` · ${p.note}` : ''}`
    case 'task_blocked':  return `任务受阻${p.reason ? ` · ${p.reason}` : ''}`
    case 'msg_out':       return `${p.channel ?? '频道'}: ${p.text ?? ''}`
    case 'report_generated': return `生成报告 ${p.date ?? ''}${p.tasksDone != null ? ` (完成 ${p.tasksDone})` : ''}`
    default: return `${kind}${payload && payload !== '{}' ? ` · ${payload.slice(0, 80)}` : ''}`
  }
}

export function mapFeedToActivity(events: FeedEvent[], agents: Agent[]): ActivityItem[] {
  return events.map(e => ({
    id: String(e.id),
    actor: agentNameById(agents, e.agent_id),
    taskId: e.task_id ?? undefined,
    message: kindToMessage(e.kind, e.payload),
    at: new Date(e.created_at).toISOString(),
    tone: kindToTone(e.kind),
  }))
}

// 聚合：dashboard 主画面要的整包
// /api/agents 返的是团队成员，不是看板 task；SprintState.tasks 需要 /api/tasks，未提供前退回 mock
export async function getSprintState(): Promise<SprintState> {
  if (USE_MOCK) {
    return { ...mockData, updatedAt: new Date().toISOString() }
  }
  const [tasks, agents, events] = await Promise.all([
    getTasks().catch(e => { console.warn('[api] getTasks fallback to mock', e); return mockData.tasks }).then(t => t.length > 0 ? t : mockData.tasks),
    getAgents().catch(e => { console.warn('[api] getAgents failed', e); return [] as Agent[] }),
    getFeed(20).catch(e => { console.warn('[api] getFeed fallback to mock', e); return [] as FeedEvent[] }),
  ])
  const activity = events.length > 0 ? mapFeedToActivity(events, agents) : mockData.activity
  return {
    sprintName: mockData.sprintName,
    updatedAt: new Date().toISOString(),
    tasks,
    activity,
  }
}

// ─── Polling helper ────────────────────────────────────────────────────────
// 5s 轮询 + 取消信号，App.tsx 直接用。

export type FeedState = 'loading' | 'ok' | 'polling-stale' | 'failed'

export interface PollHandle {
  stop(): void
  /** 手动立即拉一次（「重新连接」按钮用），**不重置 5s 定时器**。 */
  fetchNow(): Promise<void>
  /** 上次成功拉到数据的 ms 时间戳，未成功过为 null。 */
  readonly lastSuccessAt: number | null
  /** 连续失败次数（成功重置为 0），≥ 3 进 failed 态 */
  readonly failureStreak: number
  /** 仅计算 feed-state（PM/Vivian 拍定阈值，JS 零 if、走查表的堅客 → React 这边还是三三原则六十中） */
  computeState(now?: number): FeedState
}

export function pollSprintState(
  onData: (state: SprintState) => void,
  onError: (err: ApiError) => void,
  intervalMs = 5000,
): PollHandle {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastSuccessAt: number | null = null
  let failureStreak = 0
  let inflight: Promise<void> | null = null

  const runOnce = async () => {
    try {
      const data = await getSprintState()
      if (!stopped) {
        lastSuccessAt = Date.now()
        failureStreak = 0
        onData(data)
      }
    } catch (e) {
      if (!stopped) {
        failureStreak += 1
        onError(e as ApiError)
      }
    }
  }

  const tick = async () => {
    if (stopped) return
    inflight = runOnce()
    await inflight
    inflight = null
    if (!stopped) timer = setTimeout(tick, intervalMs)
  }
  void tick()

  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
    },
    /** 「重新连接」：立即拉一次，不动 5s 轮询节奏；如果已有在飞请求，复用不双发 */
    fetchNow() {
      if (stopped) return Promise.resolve()
      if (inflight) return inflight
      return runOnce()
    },
    get lastSuccessAt() { return lastSuccessAt },
    get failureStreak() { return failureStreak },
    /** Vivian · feed-states.md §4：failed > polling-stale > loading > ok，JS 零 if (列表优先级作为单处状态机) */
    computeState(now = Date.now()): FeedState {
      if (failureStreak >= 3) return 'failed'
      if (lastSuccessAt == null) return 'loading'
      if (now - lastSuccessAt > 10_000) return 'polling-stale'
      return 'ok'
    },
  }
}

export const apiConfig = {
  base: API_BASE || '(same-origin proxy)',
  hasToken: Boolean(API_TOKEN),
  mode: USE_MOCK ? 'mock' : 'live',
} as const
