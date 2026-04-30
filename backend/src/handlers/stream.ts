import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

// GET /api/stream → WebSocket upgrade → Durable Object
// Auth: header `X-Teamboard-Token` OR query `?token=` (browser WS API
// cannot set custom headers, so we accept query fallback at /api/* middleware level).
app.get('/', async (c) => {
  const upgradeHeader = c.req.header('upgrade')
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426)
  }
  const id = c.env.ROOM.idFromName('global')
  const obj = c.env.ROOM.get(id)
  return obj.fetch(c.req.raw)
})

// POST /api/stream/_kick (dev only) — force-close all WS connections in the global room.
// Used by Rose's Playwright reconnect tests to simulate server-initiated disconnect,
// since browsers cannot trigger a CF DO close from the client side.
app.post('/_kick', async (c) => {
  const id = c.env.ROOM.idFromName('global')
  const obj = c.env.ROOM.get(id)
  const res = await obj.fetch('https://do/kick', { method: 'POST' })
  const body = await res.text()
  return c.json({ ok: true, kicked: body })
})

export default app
