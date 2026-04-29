import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

// 会话式解析：<@id> action title [when]
app.post('/', async (c) => {
  const { input } = await c.req.json<{ input: string }>()
  // Layer 1: regex
  const mention = input.match(/<@(\d+)>/)
  const assignee_id = mention?.[1] ?? null
  const raw = input.replace(/<@\d+>\s*/, '').trim()

  const ACTIONS = ['review','fix','implement','write','check','test','design','update','deploy','analyse','plan']
  let action: string | null = null
  for (const a of ACTIONS) {
    if (raw.toLowerCase().startsWith(a)) { action = a; break }
  }
  const title = action ? raw.slice(action.length).trim() : raw

  const TIME_WORDS: Record<string, string> = {
    'tonight': 'tonight', '今晚': 'tonight',
    'tomorrow': 'tomorrow', '明天': 'tomorrow',
    'asap': 'asap', '立刻': 'asap', '马上': 'asap',
  }
  let when: string | null = null
  for (const [k, v] of Object.entries(TIME_WORDS)) {
    if (input.toLowerCase().includes(k)) { when = v; break }
  }

  // Resolve assignee name
  let assignee_name: string | null = null
  if (assignee_id) {
    const row = await c.env.DB.prepare('SELECT name FROM agents WHERE id = ?').bind(assignee_id).first<{ name: string }>()
    assignee_name = row?.name ?? null
  }

  const confidence = (assignee_id ? 0.4 : 0) + (action ? 0.3 : 0) + (title.length > 3 ? 0.3 : 0.1)
  const confidence_band: 'high' | 'medium' | 'low' =
    confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low'

  // Lightweight target extraction: #数字 / PR \w+ / 引号串
  let target: string | null = null
  const m = title.match(/("[^"]+"|PR\s*#?\d+|#\d+|[A-Z]{2,}-\d+)/i)
  if (m) target = m[0]

  return c.json({ assignee_id, assignee_name, action, target, title, when, raw: input, confidence, confidence_band })
})

export default app
