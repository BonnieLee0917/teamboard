export type TaskStatus = 'pending' | 'in-progress' | 'review' | 'done' | 'blocked'
export type Priority = 'P0' | 'P1' | 'P2'
export type MemberId = 'Bonnie' | 'Kane' | 'Haaland' | 'Vivian' | 'Rose'

export interface GateCheck {
  name: string
  pass: boolean
  output?: string
}

export interface GateResult {
  layer: 1 | 2
  result: 'pass' | 'fail' | 'infra_error'
  summary: string
  durationMs: number
  timestamp: string
  checks: GateCheck[]
  failReason?: string
}

export interface Task {
  id: string
  title: string
  assignee: MemberId
  status: TaskStatus
  priority: Priority
  requiresDesign: boolean
  attempts: number
  maxAttempts: number
  /** Vivian/Kane 4/30 · 任务级 confidence（后续从 /api/parse 填入，未提供前为 undefined → 中性色板） */
  confidence_band?: 'high' | 'medium' | 'low'
  createdAt: string
  updatedAt: string
  startedAt?: string
  doneAt?: string
  gateResults: GateResult[]
  history: Array<{
    at: string
    actor: MemberId | 'System'
    message: string
  }>
}

export interface ActivityItem {
  id: string
  actor: MemberId | 'System'
  taskId?: string
  message: string
  at: string
  tone?: 'default' | 'success' | 'warning' | 'critical'
}

export interface SprintState {
  sprintName: string
  updatedAt: string
  tasks: Task[]
  activity: ActivityItem[]
}
