import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

type EventRow = {
  id: number
  kind: string
  agent_id: string | null
  task_id: string | null
  payload: string | null
  discord_msg_id: string | null
  created_at: number
}

const KIND_TO_TYPE: Record<string, string> = {
  task_assigned: 'task_created',
  task_started: 'task_updated',
  task_progress: 'task_updated',
  task_done: 'task_updated',
  task_blocked: 'task_updated',
  task_review: 'task_updated',
  task_commented: 'comment_added',
  agent_status: 'agent_status',
  msg_in: 'discord_inbound',
  msg_out: 'discord_outbound',
  report_generated: 'report_generated',
}

function toEventDto(row: EventRow) {
  let payload: Record<string, unknown> = {}
  try { payload = row.payload ? JSON.parse(row.payload) : {} } catch { /* keep default */ }
  // Prefer payload.type if set (we wrote it explicitly in tasks handler)
  const type = (payload.type as string | undefined) ?? KIND_TO_TYPE[row.kind] ?? row.kind
  return {
    id: `evt_${row.id}`,
    type,
    actor_id: row.agent_id,
    task_id: row.task_id,
    payload,
    created_at: new Date(row.created_at).toISOString(),
  }
}

app.get('/', async (c) => {
  const url = new URL(c.req.url)
  const sinceIso = url.searchParams.get('since')
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : Number(url.searchParams.get('since_ms') ?? '0')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 200)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM events WHERE created_at > ? ORDER BY created_at DESC LIMIT ?'
  ).bind(Number.isFinite(sinceMs) ? sinceMs : 0, limit).all<EventRow>()

  const events = results.map(toEventDto)
  const nextSince = results.length > 0 ? new Date(results[0].created_at).toISOString() : sinceIso
  return c.json({ events, next_since: nextSince })
})

export default app
