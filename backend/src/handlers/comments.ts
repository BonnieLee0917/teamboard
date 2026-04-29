import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

// Comments under a task: GET /api/tasks/:id/comments  (mounted at /api/tasks)
// We'll mount this as a sub-router from index for clarity later; for now keep dedicated path
app.get('/:id/comments', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC'
  ).bind(c.req.param('id')).all()
  return c.json(results)
})

app.post('/:id/comments', async (c) => {
  const { author_id, body } = await c.req.json<{ author_id: string; body: string }>()
  const now = Date.now()
  const r = await c.env.DB.prepare(
    'INSERT INTO comments (task_id, author_id, body, created_at) VALUES (?,?,?,?)'
  ).bind(c.req.param('id'), author_id, body, now).run()
  await c.env.DB.prepare(
    `INSERT INTO events (kind, agent_id, task_id, payload, created_at) VALUES ('task_commented',?,?,?,?)`
  ).bind(author_id, c.req.param('id'), JSON.stringify({ body }), now).run()
  return c.json({ id: r.meta.last_row_id }, 201)
})

export default app
