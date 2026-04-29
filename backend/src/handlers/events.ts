import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

app.get('/', async (c) => {
  const since = Number(c.req.query('since') ?? '0')
  const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM events WHERE created_at > ? ORDER BY created_at DESC LIMIT ?'
  ).bind(since, limit).all()
  return c.json(results)
})

export default app
