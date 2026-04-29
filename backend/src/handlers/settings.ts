import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

// GET /api/settings - show current config (redacted)
app.get('/', (c) => {
  return c.json({
    discord_configured: !!c.env.DISCORD_BOT_TOKEN,
    llm: '@cf/meta/llama-3.1-8b-instruct',
    channel_id: c.env.DISCORD_CHANNEL_ID ?? null,
  })
})

// PATCH /api/settings - not persisting secrets here (use wrangler secret put)
// Placeholder for future admin UI
app.patch('/', async (c) => {
  return c.json({ error: 'Use `wrangler secret put` to update secrets. UI config coming v1.1.' }, 501)
})

export default app
