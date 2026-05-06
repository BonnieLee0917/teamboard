import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

// ── Ed25519 signature verify (Discord interactions) ─────────────────────
async function verifyDiscord(req: Request, publicKey: string): Promise<{ ok: boolean; body: string }> {
  const sig  = req.headers.get('x-signature-ed25519')
  const ts   = req.headers.get('x-signature-timestamp')
  const body = await req.text()
  if (!sig || !ts) return { ok: false, body }
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', hexToBytes(publicKey),
    { name: 'Ed25519' }, false, ['verify']
  )
  const ok = await crypto.subtle.verify('Ed25519', key, hexToBytes(sig), enc.encode(ts + body))
  return { ok, body }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

// ── Slash / interaction endpoint ────────────────────────────────────────
app.post('/interactions', async (c) => {
  const { ok, body } = await verifyDiscord(c.req.raw, c.env.DISCORD_PUBLIC_KEY)
  if (!ok) return c.text('invalid signature', 401)
  const data = JSON.parse(body) as { type: number }
  if (data.type === 1) return c.json({ type: 1 })  // PING → PONG
  return c.json({ type: 4, data: { content: 'received' } })
})

// ── Inbound: Discord → TeamBoard ─────────────────────────────────────────
// Auth: HMAC-SHA256(body) hex in header X-Tb-Sig (HMAC_SHARED_SECRET)
//
// Expected payload:
//   { message_id, author_id, content, channel_id, referenced_message_id? }
//
// Token regex (from discord-protocol.md, must be whole-line match):
//   ^\[task:(?<id>[a-zA-Z0-9_]+)\s+(?<verb>done|review|blocked|in_progress|todo)(?::\s*(?<note>.+?))?\]\s*$
//
// Layer A幂等: discord_message_id UNIQUE — 重复投递直接 ignore
// Layer B幂等: 相同状态转换 → 静默 200 不写 events

const TOKEN_RE = /^\[task:(?<id>[a-zA-Z0-9_]+)\s+(?<verb>done|review|blocked|in_progress|todo)(?::\s*(?<note>.+?))?\]\s*$/

const VERB_TO_STATUS: Record<string, 'done' | 'review' | 'blocked' | 'doing' | 'todo'> = {
  done: 'done',
  review: 'review',
  blocked: 'blocked',
  in_progress: 'doing',
  todo: 'todo',
}

app.post('/events', async (c) => {
  const sig  = c.req.header('x-tb-sig') ?? ''
  const body = await c.req.text()
  if (!(await verifyHmac(body, sig, c.env.HMAC_SHARED_SECRET ?? ''))) {
    return c.text('invalid hmac', 401)
  }

  const evt = JSON.parse(body) as {
    message_id: string
    author_id: string
    content: string
    channel_id?: string
    referenced_message_id?: string
  }

  // Layer A: deduplicate by discord_message_id
  const existing = await c.env.DB.prepare(
    'SELECT id FROM events WHERE discord_msg_id = ? LIMIT 1'
  ).bind(evt.message_id).first()
  if (existing) {
    return c.json({ ok: true, skipped: 'duplicate' })
  }

  const text = evt.content.trim()
  const match = TOKEN_RE.exec(text)

  if (!match?.groups) {
    // Not a task token — just a regular message reply, ignore silently
    return c.json({ ok: true, skipped: 'no_token' })
  }

  const { id: taskId, verb, note } = match.groups
  const newStatus = VERB_TO_STATUS[verb]
  if (!newStatus) return c.json({ ok: true, skipped: 'unknown_verb' })

  const task = await c.env.DB.prepare('SELECT id, status FROM tasks WHERE id = ?').bind(taskId).first<{ id: string; status: string }>()
  if (!task) {
    // system_error level=warn, silent to caller
    await c.env.DB.prepare(
      `INSERT INTO events (kind, agent_id, task_id, payload, discord_msg_id, created_at) VALUES ('report_generated',?,?,?,?,?)`
    ).bind(evt.author_id, null, JSON.stringify({ type: 'system_error', level: 'warn', component: 'discord_inbound', error_msg: `task_id not found: ${taskId}` }), evt.message_id, Date.now()).run()
    return c.json({ ok: true, skipped: 'task_not_found' })
  }

  const now = Date.now()

  // Layer B: same status transition → silent 200
  if (task.status === newStatus) {
    // Still write dedup event so Layer A fires on retry
    await c.env.DB.prepare(
      `INSERT INTO events (kind, agent_id, task_id, payload, discord_msg_id, created_at) VALUES ('msg_in',?,?,?,?,?)`
    ).bind(evt.author_id, task.id, JSON.stringify({ type: 'discord_inbound', content: text, skipped: 'same_status' }), evt.message_id, now).run()
    return c.json({ ok: true, skipped: 'same_status' })
  }

  // Apply status update
  let updateSql = 'UPDATE tasks SET status = ?, updated_at = ?'
  const vals: unknown[] = [newStatus, now]
  if (newStatus === 'done') {
    updateSql += ', done_at = ?, completed_at = ?'
    vals.push(now, now)
  }
  updateSql += ' WHERE id = ?'
  vals.push(task.id)
  await c.env.DB.prepare(updateSql).bind(...vals).run()

  // Write comment
  await c.env.DB.prepare(
    `INSERT INTO comments (task_id, author_id, body, discord_msg_id, created_at) VALUES (?,?,?,?,?)`
  ).bind(task.id, evt.author_id, text, evt.message_id, now).run()

  // Write event (also acts as Layer A dedup anchor)
  await c.env.DB.prepare(
    `INSERT INTO events (kind, agent_id, task_id, payload, discord_msg_id, created_at) VALUES ('msg_in',?,?,?,?,?)`
  ).bind(
    evt.author_id,
    task.id,
    JSON.stringify({ type: 'task_updated', new_status: newStatus, note: note ?? null, source: 'discord' }),
    evt.message_id,
    now,
  ).run()

  return c.json({ ok: true, task_id: task.id, new_status: newStatus })
})

async function verifyHmac(body: string, sig: string, secret: string): Promise<boolean> {
  if (!secret) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const mac  = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(expected, sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export default app
