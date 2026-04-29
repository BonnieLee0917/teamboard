import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

// 依赖图（只读 v1）
app.get('/', async (c) => {
  const { results: tasks } = await c.env.DB.prepare(
    "SELECT id, title, status, assignee_id, parent_id FROM tasks WHERE status NOT IN ('cancelled')"
  ).all<{ id: string; parent_id: string | null }>()
  const edges = tasks
    .filter(t => t.parent_id)
    .map(t => ({ from: t.parent_id, to: t.id }))
  return c.json({ nodes: tasks, edges })
})

export default app
