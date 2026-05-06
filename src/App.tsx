import { useState, useEffect, useRef } from 'react'
import type { SprintState, Task, ActivityItem, TaskStatus, MemberId } from './types'
import type { Agent } from './types-api'
import { mockData } from './mockData'
import { pollSprintState, getAgents, apiConfig, ApiError } from './lib/api'
import './App.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}m 前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h 前`
  return `${Math.floor(h / 24)}d 前`
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '待开始',
  'in-progress': '进行中',
  review: '审核中',
  done: '已完成',
  blocked: '已阻塞',
}

// Bonnie 5/6 v1.1 · 5 列空状态 hero 文案
const EMPTY_HERO: Record<TaskStatus, { icon: string; text: string }> = {
  pending:       { icon: '📋', text: '还没有任务<br/>试试派一个新任务' },
  'in-progress': { icon: '🚀', text: '目前没人在跑活' },
  review:        { icon: '👀', text: '没有待审核的产出' },
  done:          { icon: '✅', text: '7 天内的成果会显示在这里<br/>之后自动归档' },
  blocked:       { icon: '🟢', text: '团队畅通无阻' },
}

const ONBOARD_STEPS = [
  {
    title: '👋 欢迎来到指挥台',
    body: '这是小萌指挥 5 个 AI agent 的工作台（Kane/Haaland/Vivian/Rose/Bonnie）。<br/>你可以在这里看到团队当下在干什么、派活给谁、收到回执。',
  },
  {
    title: '📋 看板：团队的实时状态',
    body: '5 列分别是任务的不同阶段：待开始 / 进行中 / 审核中 / 已完成 / 已阻塞。<br/>已完成的任务 7 天后自动归档。',
  },
  {
    title: '🚧 更多功能即将上线',
    body: '派活输入框、Agent 状态卡、AI 日报正在路上。<br/>现在你可以先浏览看板熟悉一下。点击右上角 ? 可以随时重看本教程。',
  },
] as const

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'var(--priority-p0)',
  P1: 'var(--priority-p1)',
  P2: 'var(--priority-p2)',
}

const MEMBER_COLORS: Record<MemberId, string> = {
  Bonnie: '#7c6af7',
  Kane: '#0ea5e9',
  Haaland: '#10b981',
  Vivian: '#f59e0b',
  Rose: '#ec4899',
}

const MEMBER_EMOJI: Record<MemberId, string> = {
  Bonnie: '📋',
  Kane: '⚙️',
  Haaland: '💻',
  Vivian: '🎨',
  Rose: '🧪',
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({ task, isExpanded, onToggle }: {
  task: Task
  isExpanded: boolean
  onToggle: () => void
}) {
  const latestGate = task.gateResults[task.gateResults.length - 1]

  return (
    <div
      className={`task-card task-card--${task.status}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onToggle()}
      data-testid="task-card"
      data-confidence={task.confidence_band}
    >
      <div className="task-card__header">
        <span className="task-id">{task.id}</span>
        <span
          className="priority-badge"
          style={{ color: PRIORITY_COLORS[task.priority] }}
          data-testid="card-priority"
        >{task.priority}</span>
      </div>

      <p className="task-title" data-testid="card-title">{task.title}</p>

      <div className="task-meta">
        <span
          className="assignee-chip"
          style={{ '--member-color': MEMBER_COLORS[task.assignee] } as React.CSSProperties}
          data-testid="card-assignee"
        >
          {MEMBER_EMOJI[task.assignee]} {task.assignee}
        </span>

        {task.requiresDesign && (
          <span className="design-tag" data-testid="tag-requires-design">🎨 design</span>
        )}

        {task.attempts > 0 && task.status !== 'done' && (
          <span className="attempts-chip">
            {task.attempts}/{task.maxAttempts}
          </span>
        )}
      </div>

      {latestGate && (
        <div className="gate-summary">
          <span className={`gate-dot gate-dot--${latestGate.result}`} />
          <span className="gate-label">
            {latestGate.result === 'pass' ? '门禁通过' : latestGate.result === 'fail' ? '门禁失败' : '基础设施故障'}
          </span>
          <span className="gate-duration">{(latestGate.durationMs / 1000).toFixed(1)}s</span>
        </div>
      )}

      {isExpanded && (
        <div className="task-expanded" onClick={e => e.stopPropagation()}>
          {latestGate && (
            <div className="gate-detail">
              <div className="gate-detail__title">门禁详情</div>
              {latestGate.checks.map((c, i) => (
                <div key={i} className="gate-check">
                  <span className={`check-icon ${c.pass ? 'check-icon--pass' : 'check-icon--fail'}`}>
                    {c.pass ? '✓' : '✗'}
                  </span>
                  <span className="check-name">{c.name}</span>
                  {c.output && <span className="check-output">{c.output}</span>}
                </div>
              ))}
              {latestGate.failReason && (
                <div className="fail-reason">⚠️ {latestGate.failReason}</div>
              )}
            </div>
          )}

          {task.history.length > 0 && (
            <div className="task-history">
              <div className="task-history__title">历史记录</div>
              {task.history.slice().reverse().map((h, i) => (
                <div key={i} className="history-item">
                  <span className="history-time">{timeAgo(h.at)}</span>
                  <span className="history-actor"
                    style={{ color: MEMBER_COLORS[h.actor as MemberId] || 'var(--text-secondary)' }}>
                    {h.actor}
                  </span>
                  <span className="history-msg">{h.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

function KanbanColumn({ status, tasks, expandedId, onToggle }: {
  status: TaskStatus
  tasks: Task[]
  expandedId: string | null
  onToggle: (id: string) => void
}) {
  return (
    <div className={`kanban-col kanban-col--${status}`} data-testid={`column-${status}`}>
      <div className="kanban-col__header">
        <span className="col-label">{STATUS_LABELS[status]}</span>
        <span className="col-count">{tasks.length}</span>
      </div>
      <div className="kanban-col__body">
        {tasks.map(t => (
          <TaskCard
            key={t.id}
            task={t}
            isExpanded={expandedId === t.id}
            onToggle={() => onToggle(t.id)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="col-empty kanban-col__empty" data-testid={`empty-${status}`}>
            <div className="col-empty__icon">{EMPTY_HERO[status].icon}</div>
            <div
              className="col-empty__text"
              dangerouslySetInnerHTML={{ __html: EMPTY_HERO[status].text }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CommandBar (formerly SprintBar) ──────────────────────────────────────────
// Bonnie 5/6 v1.1: 去 Sprint 概念，改成「指挥台」语义
//   active = todo+in_progress+review+blocked
//   todayDone = done && updatedAt >= 今日 00:00 本地时区
//   (前端 Task 类型无 doneAt，降级用 updatedAt — Bonnie 5/6 confirmed)

function CommandBar({ tasks }: { tasks: Task[] }) {
  const active = tasks.filter(t =>
    t.status === 'pending' || t.status === 'in-progress' || t.status === 'review' || t.status === 'blocked'
  ).length
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayDone = tasks.filter(t => t.status === 'done' && new Date(t.updatedAt).getTime() >= todayStart.getTime()).length

  return (
    <div className="sprint-bar">
      <div className="sprint-bar__stats">
        <span className="stat stat--progress">◉ 活跃 {active}</span>
        <span className="stat stat--done">✓ 今日完成 {todayDone}</span>
      </div>
    </div>
  )
}

function OnboardingOverlay({
  open,
  step,
  onStepChange,
  onClose,
}: {
  open: boolean
  step: number
  onStepChange: (next: number) => void
  onClose: () => void
}) {
  const current = ONBOARD_STEPS[step]

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="onboard-overlay" role="dialog" aria-modal="true" aria-label="TeamBoard 新手引导">
      <div className="onboard-card">
        <div className="onboard-step" aria-label={`步骤 ${step + 1} / ${ONBOARD_STEPS.length}`}>
          {ONBOARD_STEPS.map((_, index) => (
            <span
              key={index}
              className={`onboard-dot ${index === step ? 'onboard-dot--active' : ''}`}
              aria-hidden="true"
            >
              ●
            </span>
          ))}
        </div>
        <h2 className="onboard-title">{current.title}</h2>
        <p className="onboard-body" dangerouslySetInnerHTML={{ __html: current.body }} />
        <div className="onboard-actions">
          {step === 0 ? (
            <button type="button" className="onboard-btn onboard-btn--ghost" onClick={onClose}>跳过</button>
          ) : (
            <button type="button" className="onboard-btn onboard-btn--ghost" onClick={() => onStepChange(step - 1)}>← 上一步</button>
          )}
          {step < ONBOARD_STEPS.length - 1 ? (
            <button type="button" className="onboard-btn onboard-btn--primary" onClick={() => onStepChange(step + 1)}>
              下一步 →
            </button>
          ) : (
            <button type="button" className="onboard-btn onboard-btn--primary" onClick={onClose}>
              开始使用 ✓
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="activity-feed" data-testid="feed">
      <div className="activity-feed__title">动态</div>
      <div className="activity-feed__list">
        {items.map(item => (
          <div key={item.id} className={`activity-item activity-item--${item.tone || 'default'}`}>
            <div className="activity-item__row">
              <span
                className="activity-actor"
                style={{ color: MEMBER_COLORS[item.actor as MemberId] || 'var(--text-secondary)' }}
              >
                {MEMBER_EMOJI[item.actor as MemberId] || '🤖'} {item.actor}
              </span>
              {item.taskId && <span className="activity-task-id">{item.taskId}</span>}
              <span className="activity-time">{timeAgo(item.at)}</span>
            </div>
            <p className="activity-msg">{item.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── MemberBar ────────────────────────────────────────────────────────────────

function MemberBar({ tasks }: { tasks: Task[] }) {
  const members: MemberId[] = ['Bonnie', 'Kane', 'Haaland', 'Vivian', 'Rose']
  const activeByMember = (m: MemberId) =>
    tasks.filter(t => t.assignee === m && (t.status === 'in-progress' || t.status === 'review')).length
  const maxLoad = Math.max(...members.map(activeByMember), 1)

  return (
    <div className="member-bar">
      {members.map(m => {
        const load = activeByMember(m)
        return (
          <div key={m} className="member-load">
            <span className="member-emoji">{MEMBER_EMOJI[m]}</span>
            <span className="member-name">{m}</span>
            <div className="load-track">
              <div
                className="load-fill"
                style={{
                  width: `${(load / maxLoad) * 100}%`,
                  background: MEMBER_COLORS[m]
                }}
              />
            </div>
            <span className="load-count" style={{ color: MEMBER_COLORS[m] }}>{load}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── MembersView ──────────────────────────────────────────────────────────────

function MembersView({ tasks, agents }: { tasks: Task[]; agents: Agent[] }) {
  const members: MemberId[] = ['Bonnie', 'Kane', 'Haaland', 'Vivian', 'Rose']
  const agentByName = new Map(agents.map(a => [a.name, a]))

  return (
    <div className="members-view">
      {members.map(m => {
        const myTasks = tasks.filter(t => t.assignee === m)
        const active = myTasks.filter(t => t.status === 'in-progress' || t.status === 'review')
        const done = myTasks.filter(t => t.status === 'done')
        const blocked = myTasks.filter(t => t.status === 'blocked')
        const agent = agentByName.get(m)
        return (
          <div
            key={m}
            className="member-card agent-card"
            data-agent-status={agent?.status}
          >
            <div className="member-card__header" style={{ borderColor: MEMBER_COLORS[m] }}>
              <span className="member-card__emoji">{MEMBER_EMOJI[m]}</span>
              <span className="member-card__name">{m}</span>
              {agent && (
                <span className="member-card__role" style={{ fontSize: 11, opacity: 0.7, marginLeft: 6 }}>
                  {agent.role} · {agent.status}
                </span>
              )}
              <span className="member-card__counts">
                {active.length > 0 && <span className="mc-stat mc-active">{active.length} 活跃</span>}
                {done.length > 0 && <span className="mc-stat mc-done">{done.length} 完成</span>}
                {blocked.length > 0 && <span className="mc-stat mc-blocked">{blocked.length} 阻塞</span>}
              </span>
            </div>
            <div className="member-card__tasks">
              {myTasks.map(t => (
                <div key={t.id} className={`member-task-row member-task-row--${t.status}`}>
                  <span className="mt-id">{t.id}</span>
                  <span className="mt-title">{t.title}</span>
                  <span className={`mt-status mt-status--${t.status}`}>{STATUS_LABELS[t.status]}</span>
                </div>
              ))}
              {myTasks.length === 0 && <div className="mt-empty">暂无任务</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

const STATUSES: TaskStatus[] = ['pending', 'in-progress', 'review', 'done', 'blocked']

export default function App() {
  const [data, setData] = useState<SprintState>(mockData)
  const [agents, setAgents] = useState<Agent[]>([])
  const [feedState, setFeedState] = useState<'loading' | 'ok' | 'polling-stale' | 'failed'>('loading')
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'kanban' | 'members' | 'activity'>('kanban')
  const [apiErr, setApiErr] = useState<ApiError | null>(null)
  const [onboardOpen, setOnboardOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('tb_onboarded_v1') !== '1' } catch { return true }
  })
  const [onboardStep, setOnboardStep] = useState(0)
  const handleRef = useRef<import('./lib/api').PollHandle | null>(null)

  // 5s polling。feedState 每秒 tick 重评价，Vivian polling-stale banner attr(data-stale-text) 靠它
  useEffect(() => {
    handleRef.current = pollSprintState(
      next => { setData(next); setApiErr(null); setLastSuccessAt(Date.now()) },
      err => { console.warn('[poll]', err); setApiErr(err) },
      5000,
    )
    const tick = setInterval(() => {
      if (handleRef.current) setFeedState(handleRef.current.computeState())
    }, 1000)
    return () => { handleRef.current?.stop(); clearInterval(tick) }
  }, [])

  // /api/agents 独立轮询（团队成员状态，Vivian confidence_band CSS 驱动源）
  useEffect(() => {
    if (!apiConfig.base) return
    let stopped = false
    const tick = async () => {
      try {
        const list = await getAgents()
        if (!stopped) setAgents(list)
      } catch (e) {
        console.warn('[agents]', e)
      } finally {
        if (!stopped) setTimeout(tick, 5000)
      }
    }
    void tick()
    return () => { stopped = true }
  }, [])

  const closeOnboarding = () => {
    try {
      localStorage.setItem('tb_onboarded_v1', '1')
    } catch { /* localStorage 不可用（无痕模式等），静默失败 */ }
    setOnboardOpen(false)
    setOnboardStep(0)
  }

  const toggleExpanded = (id: string) =>
    setExpandedId(prev => prev === id ? null : id)

  const tasksByStatus = (s: TaskStatus) => data.tasks.filter(t => t.status === s)

  return (
    <div className="app" data-feed-state={feedState}>
      {/* Top nav */}
      <header className="topnav" data-onboard-target="topnav">
        <div className="topnav__brand">
          <span className="topnav__logo">⚡</span>
          <div className="topnav__titles">
            <span className="topnav__title">指挥台 · TeamBoard</span>
            <span className="topnav__subtitle">小萌的 5 人 AI 团队 · 实时同步</span>
          </div>
        </div>
        <div className="topnav__right">
          <span className="last-update">刷新于 {timeAgo(data.updatedAt)}</span>
          <span className="live-dot" title={apiErr ? `API: ${apiErr.message}` : `${apiConfig.mode} · 5s polling`} style={apiErr ? { background: '#ef4444' } : undefined} />
          <button
            type="button"
            className="topnav__help"
            data-testid="onboard-help"
            aria-label="重看新手引导"
            title="重看新手引导"
            onClick={() => { try { localStorage.removeItem('tb_onboarded_v1') } catch { /* ignore */ } ; setOnboardOpen(true); setOnboardStep(0) }}
          >?</button>
        </div>
      </header>
      <OnboardingOverlay
        open={onboardOpen}
        step={onboardStep}
        onStepChange={setOnboardStep}
        onClose={closeOnboarding}
      />

      {/* Polling state banners (Vivian feed-states.md §4；Rose data-testid for smoke) */}
      {feedState === 'polling-stale' && (
        <div
          data-testid="polling-stale-banner"
          style={{ background: '#fef9c3', color: '#854d0e', padding: '6px 16px', fontSize: 13, borderBottom: '1px solid #fde68a' }}
        >
          ⚠️ 数据偏陈 · 最后一次同步 {lastSuccessAt ? timeAgo(new Date(lastSuccessAt).toISOString()) : '未知'}
        </div>
      )}
      {feedState === 'failed' && (
        <div
          data-testid="polling-failed-banner"
          style={{ background: '#fef2f2', color: '#991b1b', padding: '6px 16px', fontSize: 13, borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <span>⚠️ 连接中断 · 显示上一帧数据</span>
          <button
            data-testid="polling-failed-retry"
            onClick={() => handleRef.current?.fetchNow()}
            style={{ background: '#991b1b', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            重新连接
          </button>
        </div>
      )}
      {apiErr && feedState !== 'failed' && feedState !== 'polling-stale' && (
        <div
          data-testid="api-error-banner"
          style={{ background: '#fef2f2', color: '#991b1b', padding: '6px 16px', fontSize: 13, borderBottom: '1px solid #fecaca' }}
        >
          ⚠️ API 异常 · {apiErr.endpoint} · {apiErr.status} · 显示上一帧数据，5s 后重试
        </div>
      )}

      {/* Command bar — 指挥台统计 */}
      <div className="sprint-bar-wrapper">
        <CommandBar tasks={data.tasks} />
      </div>

      {/* Mobile tabs */}
      <div className="mobile-tabs">
        {(['kanban', 'members', 'activity'] as const).map(tab => (
          <button
            key={tab}
            className={`mobile-tab ${mobileTab === tab ? 'mobile-tab--active' : ''}`}
            onClick={() => setMobileTab(tab)}
          >
            {tab === 'kanban' ? '看板' : tab === 'members' ? '成员' : '动态'}
          </button>
        ))}
      </div>

      {/* Main content */}
      <main className="main-content">
        {/* Kanban board */}
        <div
          className={`kanban-board ${mobileTab === 'kanban' ? 'mobile-visible' : 'mobile-hidden'}`}
          data-testid="kanban-board"
          data-onboard-target="kanban"
        >
          {STATUSES.map(s => (
            <KanbanColumn
              key={s}
              status={s}
              tasks={tasksByStatus(s)}
              expandedId={expandedId}
              onToggle={toggleExpanded}
            />
          ))}
        </div>

        {/* Activity sidebar */}
        <div className={`sidebar ${mobileTab === 'activity' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <ActivityFeed items={data.activity} />
        </div>

        {/* Members mobile view */}
        <div className={`members-panel ${mobileTab === 'members' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <MembersView tasks={data.tasks} agents={agents} />
        </div>
      </main>

      {/* Member load bar — desktop only */}
      <footer className="footer">
        <MemberBar tasks={data.tasks} />
      </footer>
    </div>
  )
}
