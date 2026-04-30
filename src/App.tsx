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
          <div className="col-empty">空</div>
        )}
      </div>
    </div>
  )
}

// ─── SprintBar ────────────────────────────────────────────────────────────────

function SprintBar({ tasks, sprintName }: { tasks: Task[]; sprintName: string }) {
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  const inProgress = tasks.filter(t => t.status === 'in-progress').length
  const blocked = tasks.filter(t => t.status === 'blocked').length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="sprint-bar">
      <div className="sprint-bar__left">
        <span className="sprint-name">{sprintName}</span>
        <div className="sprint-progress-track">
          <div className="sprint-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="sprint-pct">{pct}%</span>
      </div>
      <div className="sprint-bar__stats">
        <span className="stat stat--done">✓ {done} 完成</span>
        <span className="stat stat--progress">◉ {inProgress} 进行中</span>
        <span className="stat stat--blocked">⚠ {blocked} 阻塞</span>
        <span className="stat stat--total">{total} 总计</span>
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'kanban' | 'members' | 'activity'>('kanban')
  const [apiErr, setApiErr] = useState<ApiError | null>(null)
  const handleRef = useRef<import('./lib/api').PollHandle | null>(null)

  // 5s polling。feedState 每秒 tick 重评价，Vivian polling-stale banner attr(data-stale-text) 靠它
  useEffect(() => {
    handleRef.current = pollSprintState(
      next => { setData(next); setApiErr(null) },
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

  const toggleExpanded = (id: string) =>
    setExpandedId(prev => prev === id ? null : id)

  const tasksByStatus = (s: TaskStatus) => data.tasks.filter(t => t.status === s)

  return (
    <div className="app" data-feed-state={feedState}>
      {/* Top nav */}
      <header className="topnav">
        <div className="topnav__brand">
          <span className="topnav__logo">⚡</span>
          <span className="topnav__title">Team Dashboard</span>
        </div>
        <div className="topnav__center">
          <span className="sprint-badge">{data.sprintName}</span>
        </div>
        <div className="topnav__right">
          <span className="last-update">刷新于 {timeAgo(data.updatedAt)}</span>
          <span className="live-dot" title={apiErr ? `API: ${apiErr.message}` : `${apiConfig.mode} · 5s polling`} style={apiErr ? { background: '#ef4444' } : undefined} />
        </div>
      </header>
      {/* Polling state banners (Vivian feed-states.md §4；Rose data-testid for smoke) */}
      {feedState === 'polling-stale' && (
        <div
          data-testid="polling-stale-banner"
          style={{ background: '#fef9c3', color: '#854d0e', padding: '6px 16px', fontSize: 13, borderBottom: '1px solid #fde68a' }}
        >
          ⚠️ 数据偏陈 · 最后一次同步 {handleRef.current?.lastSuccessAt ? timeAgo(new Date(handleRef.current.lastSuccessAt).toISOString()) : '未知'}
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

      {/* Sprint overview bar */}
      <div className="sprint-bar-wrapper">
        <SprintBar tasks={data.tasks} sprintName={data.sprintName} />
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
