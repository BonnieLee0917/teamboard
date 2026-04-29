import { Hono } from 'hono'
import type { Env } from '../index'

// Simple ULID-like ID
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

const app = new Hono<{ Bindings: Env }>()

app.get('/', async (c) => {
  const url = new URL(c.req.url)
  const status   = url.searchParams.get('status')
  const assignee = url.searchParams.get('assignee')
  let sql = 'SELECT * FROM tasks WHERE 1=1'
  const vals: unknown[] = []
  if (status)   { sql += ' AND status = ?';      vals.push(status) }
  if (assignee) { sql += ' AND assignee_id = ?'; vals.push(assignee) }
  sql += ' ORDER BY created_at DESC'
  const { results } = await c.env.DB.prepare(sql).bind(...vals).all()
  return c.json(results)
})

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(c.req.param('id')).first()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

app.post('/', async (c) => {
  const body = await c.req.json<{
    title: string; description?: string; assignee_id?: string
    assigner_id: string; priority?: string; parent_id?: string; scheduled_for?: number
  }>()
  const id = uid()
  const now = Date.now()
  await c.env.DB.prepare(`
    INSERT INTO tasks (id, title, description, assignee_id, assigner_id, priority, parent_id, scheduled_for, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.title, body.description ?? null, body.assignee_id ?? null, body.assigner_id,
           body.priority ?? 'P2', body.parent_id ?? null, body.scheduled_for ?? null, now, now).run()

  // Insert event
  await c.env.DB.prepare(`
    INSERT INTO events (kind, agent_id, task_id, payload, created_at)
    VALUES ('task_assigned', ?, ?, ?, ?)
  `).bind(body.assigner_id, id, JSON.stringify({ title: body.title }), now).run()

  // Discord out (fire-and-forget)
  if (body.assignee_id) {
    const env = c.env
    c.executionCtx.waitUntil(sendDiscordTask(env, id, body.title, body.assignee_id))
  }

  return c.json({ id }, 201)
})

app.patch('/:id', async (c) => {
  const body = await c.req.json<{ status?: string; assignee_id?: string; description?: string }>()
  const now = Date.now()
  const sets: string[] = ['updated_at = ?']
  const vals: unknown[] = [now]
  if (body.status !== undefined)      { sets.push('status = ?');      vals.push(body.status) }
  if (body.assignee_id !== undefined) { sets.push('assignee_id = ?'); vals.push(body.assignee_id) }
  if (body.description !== undefined) { sets.push('description = ?'); vals.push(body.description) }
  if (body.status === 'done') { sets.push('done_at = ?'); vals.push(now) }
  vals.push(c.req.param('id'))
  await c.env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  const eventKind =
    body.status === 'done'    ? 'task_done' :
    body.status === 'blocked' ? 'task_blocked' :
    body.status === 'review'  ? 'task_review' :
    body.status === 'doing'   ? 'task_started' : 'task_progress'
  await c.env.DB.prepare(`
    INSERT INTO events (kind, task_id, payload, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(eventKind, c.req.param('id'), JSON.stringify(body), now).run()
  return c.json({ ok: true })
})

app.delete('/:id', async (c) => {
  // hard delete (cancelled 状态在新 enum 中被移除)
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

async function sendDiscordTask(env: Env, taskId: string, title: string, assigneeDiscordId: string) {
  const body = {
    content: `<@${assigneeDiscordId}> 📋 新任务 \`${taskId}\`：**${title}**\n> 完成后回复本消息：**完成** / **阻塞**`
  }
  const res = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) {
    const msg = await res.json<{ id: string }>()
    await env.DB.prepare("UPDATE tasks SET discord_msg_id = ? WHERE id = ?").bind(msg.id, taskId).run()
  }
}

export default app
