import { Hono } from 'hono'
import { cors } from 'hono/cors'

// ── Types ──────────────────────────────────────────────────────────────────
export interface Env {
  DB: D1Database
  ROOM: DurableObjectNamespace
  TEAMBOARD_TOKEN: string
  DISCORD_BOT_TOKEN: string
  DISCORD_PUBLIC_KEY: string
  DISCORD_CHANNEL_ID: string
  AI: Ai
}

// ── Durable Object (realtime room) ────────────────────────────────────────
export { RoomDO } from './do/room'

// ── App ───────────────────────────────────────────────────────────────────
const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({
  origin: ['https://teamboard.xiaomengli.online', 'http://localhost:5173'],
  allowHeaders: ['Content-Type', 'X-Teamboard-Token'],
}))

// Auth middleware (skip Discord webhook routes)
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/discord/')) return next()
  const token = c.req.header('X-Teamboard-Token')
  if (token !== c.env.TEAMBOARD_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return next()
})

// ── Route imports ─────────────────────────────────────────────────────────
import agents from './handlers/agents'
import tasks from './handlers/tasks'
import events from './handlers/events'
import reports from './handlers/reports'
import deps from './handlers/deps'
import schedule from './handlers/schedule'
import discord from './handlers/discord'
import parse from './handlers/parse'
import stream from './handlers/stream'
import settings from './handlers/settings'

app.route('/api/agents', agents)
app.route('/api/tasks', tasks)
app.route('/api/feed', events)
app.route('/api/reports', reports)
app.route('/api/dependencies', deps)
app.route('/api/schedule', schedule)
app.route('/api/discord', discord)
app.route('/api/parse', parse)
app.route('/api/stream', stream)
app.route('/api/settings', settings)

// ── Cron (AI 日报) ────────────────────────────────────────────────────────
async function handleCron(env: Env): Promise<void> {
  const { generateDailyReport } = await import('./cron/daily-report')
  await generateDailyReport(env)
}

// ── Entry ─────────────────────────────────────────────────────────────────
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleCron(env))
  },
}
