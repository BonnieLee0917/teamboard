import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

// ── Ed25519 signature verify (Discord interactions) ─────────────────────
async function verifyDiscord(req: Request, publicKey: string): Promise<{ ok: boolean; body: string }> {
  const sig = req.headers.get('x-signature-ed25519')
  const ts  = req.headers.get('x-signature-timestamp')
  const body = await req.text()
  if (!sig || !ts) return { ok: false, body }

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', hexToBytes(publicKey),
    { name: 'Ed25519' }, false, ['verify']
  )
  const ok = await crypto.subtle.verify(
    'Ed25519', key, hexToBytes(sig), enc.encode(ts + body)
  )
  return { ok, body }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i*2, i*2+2), 16)
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

// ── Inbound message events (回执解析) ───────────────────────────────────
// Auth: HMAC-SHA256(body) hex, header X-Tb-Sig
app.post('/events', async (c) => {
  const sig  = c.req.header('x-tb-sig') ?? ''
  const body = await c.req.text()
  const ok = await verifyHmac(body, sig, c.env.HMAC_SHARED_SECRET)
  if (!ok) return c.text('invalid hmac', 401)

  const evt = JSON.parse(body) as {
    message_id: string
    referenced_message_id?: string
    author_id: string
    content: string
  }

  // Find task by referenced discord msg id
  if (evt.referenced_message_id) {
    const task = await c.env.DB.prepare('SELECT id, status FROM tasks WHERE discord_msg_id = ?')
      .bind(evt.referenced_message_id).first<{ id: string; status: string }>()
    if (task) {
      // Kane 17:51 拍的入向语义规则
      const text = evt.content
      const lower = text.toLowerCase()
      let newStatus: 'done' | 'blocked' | 'review' | 'doing' | null = null
      if (/完成|done|finished|搞定|✅/i.test(text))                            newStatus = 'done'
      else if (/阻塞|blocked|卡住|卡死|被挡住|⛔/i.test(text))                  newStatus = 'blocked'
      else if (/评审|review|待看|请过目/i.test(text))                            newStatus = 'review'
      else if (/进行中|在做|处理中|working on|started|wip/.test(lower))    newStatus = 'doing'

      const now = Date.now()
      if (newStatus) {
        await c.env.DB.prepare(
          `UPDATE tasks SET status = ?, updated_at = ?, done_at = CASE WHEN ? = 'done' THEN ? ELSE done_at END WHERE id = ?`
        ).bind(newStatus, now, newStatus, now, task.id).run()
      }

      // Always log as comment + event
      await c.env.DB.prepare(
        `INSERT INTO comments (task_id, author_id, body, discord_msg_id, created_at) VALUES (?,?,?,?,?)`
      ).bind(task.id, evt.author_id, evt.content, evt.message_id, now).run()

      await c.env.DB.prepare(
        `INSERT INTO events (kind, agent_id, task_id, payload, discord_msg_id, created_at) VALUES (?,?,?,?,?,?)`
      ).bind('msg_in', evt.author_id, task.id, JSON.stringify({ content: evt.content }), evt.message_id, now).run()
    }
  }

  return c.json({ ok: true })
})

async function verifyHmac(body: string, sig: string, secret: string): Promise<boolean> {
  if (!secret) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body))
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
