import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM tasks WHERE scheduled_for IS NOT NULL AND status NOT IN ('done','cancelled') ORDER BY scheduled_for ASC"
  ).all()
  return c.json(results)
})

export default app
