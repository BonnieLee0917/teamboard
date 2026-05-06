import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

// agents.status PRD enum: online | busy | idle | offline
// DB CHECK enum:          idle  | working | blocked | offline
// 我们在边界 normalize：API 出去给 PRD 值，进来接受 PRD 值并映射回 DB 值。

function dbStatusToApi(status: string | null | undefined): 'online' | 'busy' | 'idle' | 'offline' {
  switch (status) {
    case 'working': return 'busy'
    case 'blocked': return 'busy'
    case 'idle': return 'idle'
    case 'offline': return 'offline'
    case 'online': return 'online'
    case 'busy': return 'busy'
    default: return 'idle'
  }
}

function apiStatusToDb(status: string): 'idle' | 'working' | 'blocked' | 'offline' {
  switch (status) {
    case 'online': return 'idle'      // online == 在线但空闲
    case 'busy':   return 'working'
    case 'idle':   return 'idle'
    case 'offline': return 'offline'
    case 'working': return 'working'
    case 'blocked': return 'blocked'
    default: return 'idle'
  }
}

type AgentRow = {
  id: string
  name: string
  role: string
  avatar_url: string | null
  status: string
  focus_task_id: string | null
  last_active: number
  created_at: number
}

function toAgentDto(row: AgentRow) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    discord_id: row.id, // 沿用 Discord snowflake 作主键的约定
    avatar_url: row.avatar_url,
    status: dbStatusToApi(row.status),
    current_task_id: row.focus_task_id,
    last_heartbeat: new Date(row.last_active).toISOString(),
  }
}

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM agents ORDER BY name').all<AgentRow>()
  return c.json({ agents: results.map(toAgentDto) })
})

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(c.req.param('id')).first<AgentRow>()
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404)
  return c.json({ agent: toAgentDto(row) })
})

app.patch('/:id', async (c) => {
  const body = await c.req.json<{ status?: string; focus_task_id?: string | null; current_task_id?: string | null }>()
  const sets: string[] = []
  const vals: unknown[] = []
  if (body.status !== undefined) {
    sets.push('status = ?')
    vals.push(apiStatusToDb(body.status))
  }
  const focus = body.focus_task_id ?? body.current_task_id
  if (focus !== undefined) {
    sets.push('focus_task_id = ?')
    vals.push(focus)
  }
  if (sets.length === 0) return c.json({ error: { code: 'INVALID_INPUT', message: 'Nothing to update' } }, 400)
  sets.push('last_active = ?'); vals.push(Date.now())
  vals.push(c.req.param('id'))
  await c.env.DB.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  const row = await c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(c.req.param('id')).first<AgentRow>()
  return c.json({ agent: row ? toAgentDto(row) : null })
})

export default app
