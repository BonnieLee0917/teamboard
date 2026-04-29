import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

app.get('/today', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM daily_reports WHERE date = ?').bind(todayStr()).first()
  if (!row) return c.json({ date: todayStr(), summary: null, metrics_json: '{}' })
  return c.json(row)
})

app.get('/', async (c) => {
  const date = c.req.query('date') ?? todayStr()
  const row = await c.env.DB.prepare('SELECT * FROM daily_reports WHERE date = ?').bind(date).first()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

app.post('/generate', async (c) => {
  const { generateDailyReport } = await import('../cron/daily-report')
  await generateDailyReport(c.env)
  return c.json({ ok: true })
})

export default app
