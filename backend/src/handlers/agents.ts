import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM agents ORDER BY name').all()
  return c.json(results)
})

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(c.req.param('id')).first()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

app.patch('/:id', async (c) => {
  const body = await c.req.json<{ status?: string; focus_task_id?: string | null }>()
  const sets: string[] = []
  const vals: unknown[] = []
  if (body.status !== undefined)        { sets.push('status = ?');        vals.push(body.status) }
  if (body.focus_task_id !== undefined) { sets.push('focus_task_id = ?'); vals.push(body.focus_task_id) }
  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400)
  sets.push('last_active = ?'); vals.push(Date.now())
  vals.push(c.req.param('id'))
  await c.env.DB.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ ok: true })
})

export default app
