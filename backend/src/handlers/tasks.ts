import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

function uid(prefix = 'task'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function toIso(ms: number | null | undefined): string | null {
  return ms == null ? null : new Date(ms).toISOString()
}

function fromIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? null : ms
}

function apiStatusFromDb(status: string): 'todo' | 'in_progress' | 'review' | 'done' | 'blocked' {
  switch (status) {
    case 'doing':
    case 'in_progress':
    case 'pending':
      return status === 'pending' ? 'todo' : 'in_progress'
    case 'review':
    case 'done':
    case 'blocked':
    case 'todo':
      return status as 'todo' | 'review' | 'done' | 'blocked'
    default:
      return 'todo'
  }
}

function dbStatusFromApi(status: string): 'todo' | 'doing' | 'review' | 'done' | 'blocked' | 'cancelled' {
  switch (status) {
    case 'in_progress': return 'doing'
    case 'todo':
    case 'review':
    case 'done':
    case 'blocked':
    case 'cancelled':
      return status
    default:
      return 'todo'
  }
}

function apiPriorityFromDb(priority: string | null | undefined): 'p0' | 'p1' | 'p2' | 'p3' {
  switch ((priority ?? '').toUpperCase()) {
    case 'P0': return 'p0'
    case 'P1': return 'p1'
    case 'P3': return 'p3'
    default: return 'p2'
  }
}

function dbPriorityFromApi(priority: string | null | undefined): 'P0' | 'P1' | 'P2' | 'P3' {
  switch ((priority ?? '').toLowerCase()) {
    case 'p0': return 'P0'
    case 'p1': return 'P1'
    case 'p3': return 'P3'
    default: return 'P2'
  }
}

type TaskRow = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string | null
  assignee_id: string | null
  creator_id: string | null
  assigner_id: string | null
  due_at: number | null
  created_at: number
  updated_at: number
  completed_at: number | null
  done_at: number | null
  discord_msg_id: string | null
}

function toTaskDto(row: TaskRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: apiStatusFromDb(row.status),
    priority: apiPriorityFromDb(row.priority),
    assignee_id: row.assignee_id,
    creator_id: row.creator_id ?? row.assigner_id,
    due_at: toIso(row.due_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    done_at: toIso(row.completed_at ?? row.done_at),
    discord_message_id: row.discord_msg_id,
  }
}

async function insertEvent(env: Env, input: {
  type: string
  actor_id?: string | null
  task_id?: string | null
  payload?: Record<string, unknown>
  discord_msg_id?: string | null
}) {
  const now = Date.now()
  const kindMap: Record<string, string> = {
    task_created: 'task_assigned',
    task_updated: 'task_progress',
    comment_added: 'task_commented',
    discord_dispatch_failed: 'msg_out',
    system_error: 'report_generated',
  }
  const kind = kindMap[input.type] ?? 'task_progress'
  await env.DB.prepare(
    `INSERT INTO events (kind, agent_id, task_id, payload, discord_msg_id, created_at) VALUES (?,?,?,?,?,?)`
  ).bind(
    kind,
    input.actor_id ?? null,
    input.task_id ?? null,
    JSON.stringify({ type: input.type, ...(input.payload ?? {}) }),
    input.discord_msg_id ?? null,
    now,
  ).run()
}

async function dispatchToDiscord(env: Env, task: ReturnType<typeof toTaskDto>, creatorName: string): Promise<
  | { delivered: true; channel_id: string; message_id: string }
  | { delivered: false; reason: 'rate_limit' | 'timeout' | 'http_error' | 'invalid_token'; http_status?: number }
> {
  if (!task.assignee_id) return { delivered: false, reason: 'http_error' }

  const agent = await env.DB.prepare('SELECT discord_id, name FROM agents WHERE id = ?').bind(task.assignee_id).first<{ discord_id: string | null; name: string }>()
  if (!agent?.discord_id) return { delivered: false, reason: 'http_error' }

  const dueSuffix = task.due_at ? ` · 截止 ${new Date(task.due_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}` : ''
  const content = `<@${agent.discord_id}> 新任务 [task:${task.id}] **${task.title}** (${task.priority.toUpperCase()})${dueSuffix}\n派单：${creatorName}\n完成回执：\`[task:${task.id} done]\`  阻塞回执：\`[task:${task.id} blocked: 原因]\``

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    })
    if (!res.ok) {
      return {
        delivered: false,
        reason: res.status === 401 ? 'invalid_token' : res.status === 429 ? 'rate_limit' : 'http_error',
        http_status: res.status,
      }
    }
    const body = await res.json<{ id: string }>()
    return { delivered: true, channel_id: env.DISCORD_CHANNEL_ID, message_id: body.id }
  } catch {
    return { delivered: false, reason: 'timeout' }
  } finally {
    clearTimeout(timeout)
  }
}

app.get('/', async (c) => {
  const url = new URL(c.req.url)
  const statusParam = url.searchParams.get('status')
  const assignee = url.searchParams.get('assignee')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200)
  const since = fromIso(url.searchParams.get('since'))

  let sql = 'SELECT * FROM tasks WHERE 1=1'
  const vals: unknown[] = []

  if (statusParam) {
    const statuses = statusParam.split(',').map(s => dbStatusFromApi(s.trim()))
    sql += ` AND status IN (${statuses.map(() => '?').join(',')})`
    vals.push(...statuses)
  } else {
    sql += ` AND status != 'cancelled'`
  }
  if (assignee) {
    sql += ' AND assignee_id = ?'
    vals.push(assignee)
  }
  if (since != null) {
    sql += ' AND updated_at >= ?'
    vals.push(since)
  }
  sql += ' ORDER BY created_at DESC LIMIT ?'
  vals.push(limit)

  const { results } = await c.env.DB.prepare(sql).bind(...vals).all<TaskRow>()
  return c.json({ tasks: results.map(toTaskDto), total: results.length })
})

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(c.req.param('id')).first<TaskRow>()
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404)
  return c.json({ task: toTaskDto(row) })
})

app.post('/', async (c) => {
  const body = await c.req.json<{
    title?: string
    description?: string
    assignee_id?: string
    creator_id?: string
    priority?: string
    due_at?: string
  }>()

  if (!body.title?.trim()) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'title is required', field: 'title' } }, 400)
  }
  if (!body.assignee_id) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'assignee_id is required', field: 'assignee_id' } }, 400)
  }

  const assignee = await c.env.DB.prepare('SELECT id FROM agents WHERE id = ?').bind(body.assignee_id).first()
  if (!assignee) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'assignee_id not found', field: 'assignee_id' } }, 400)
  }

  const creatorId = body.creator_id ?? 'bonnie'
  const creator = await c.env.DB.prepare('SELECT id, name FROM agents WHERE id = ?').bind(creatorId).first<{ id: string; name: string }>()
  const creatorName = creator?.name ?? '小萌'

  const id = uid('task')
  const now = Date.now()
  const dueAt = fromIso(body.due_at)
  const priorityDb = dbPriorityFromApi(body.priority)

  await c.env.DB.prepare(`
    INSERT INTO tasks (id, title, description, assignee_id, assigner_id, creator_id, status, priority, due_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?)
  `).bind(
    id,
    body.title.trim(),
    body.description ?? null,
    body.assignee_id,
    creatorId,
    creatorId,
    priorityDb,
    dueAt,
    now,
    now,
  ).run()

  const row = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<TaskRow>()
  if (!row) return c.json({ error: { code: 'INTERNAL', message: 'failed to load created task' } }, 500)

  await insertEvent(c.env, {
    type: 'task_created',
    actor_id: creatorId,
    task_id: id,
    payload: { title: row.title, assignee_id: row.assignee_id, priority: priorityDb },
  })

  const task = toTaskDto(row)
  const discord = await dispatchToDiscord(c.env, task, creatorName)
  if (discord.delivered) {
    await c.env.DB.prepare('UPDATE tasks SET discord_msg_id = ?, updated_at = ? WHERE id = ?').bind(discord.message_id, Date.now(), id).run()
  } else {
    await insertEvent(c.env, {
      type: 'discord_dispatch_failed',
      actor_id: creatorId,
      task_id: id,
      payload: { reason: discord.reason, http_status: 'http_status' in discord ? discord.http_status : undefined },
    })
  }

  const latest = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<TaskRow>()
  return c.json({ task: toTaskDto(latest!), discord }, 201)
})

app.patch('/:id', async (c) => {
  const body = await c.req.json<{
    status?: string
    assignee_id?: string | null
    title?: string
    description?: string | null
    due_at?: string | null
  }>()

  const existing = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(c.req.param('id')).first<TaskRow>()
  if (!existing) return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404)

  const sets: string[] = []
  const vals: unknown[] = []
  let changed = false
  let nextStatus = existing.status

  if (body.status !== undefined) {
    nextStatus = dbStatusFromApi(body.status)
    if (nextStatus !== existing.status) {
      sets.push('status = ?')
      vals.push(nextStatus)
      changed = true
    }
  }
  if (body.assignee_id !== undefined && body.assignee_id !== existing.assignee_id) {
    sets.push('assignee_id = ?')
    vals.push(body.assignee_id)
    changed = true
  }
  if (body.title !== undefined && body.title !== existing.title) {
    sets.push('title = ?')
    vals.push(body.title)
    changed = true
  }
  if (body.description !== undefined && body.description !== existing.description) {
    sets.push('description = ?')
    vals.push(body.description)
    changed = true
  }
  if (body.due_at !== undefined) {
    const dueAt = fromIso(body.due_at)
    if (dueAt !== existing.due_at) {
      sets.push('due_at = ?')
      vals.push(dueAt)
      changed = true
    }
  }

  if (!changed) {
    return c.json({ task: toTaskDto(existing) })
  }

  const now = Date.now()
  sets.push('updated_at = ?')
  vals.push(now)
  if (nextStatus === 'done') {
    sets.push('done_at = ?', 'completed_at = ?')
    vals.push(now, now)
  }
  vals.push(c.req.param('id'))
  await c.env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()

  await insertEvent(c.env, {
    type: 'task_updated',
    task_id: c.req.param('id'),
    payload: body as Record<string, unknown>,
  })

  const updated = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(c.req.param('id')).first<TaskRow>()
  return c.json({ task: toTaskDto(updated!) })
})

app.delete('/:id', async (c) => {
  await c.env.DB.prepare("UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ?")
    .bind(Date.now(), c.req.param('id')).run()
  return c.body(null, 204)
})

export default app
