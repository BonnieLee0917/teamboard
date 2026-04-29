import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

// GET /api/stream → WebSocket upgrade → Durable Object
app.get('/', async (c) => {
  const upgradeHeader = c.req.header('upgrade')
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426)
  }
  const id = c.env.ROOM.idFromName('global')
  const obj = c.env.ROOM.get(id)
  return obj.fetch(c.req.raw)
})

export default app
