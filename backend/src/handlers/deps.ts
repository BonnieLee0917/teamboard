import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

// 依赖图（只读 v1）
app.get('/', async (c) => {
  const { results: tasks } = await c.env.DB.prepare(
    "SELECT id, title, status, assignee_id FROM tasks WHERE status NOT IN ('cancelled')"
  ).all()
  const { results: edges } = await c.env.DB.prepare(
    'SELECT task_id, depends_on FROM dependencies'
  ).all()
  return c.json({ nodes: tasks, edges })
})

export default app
