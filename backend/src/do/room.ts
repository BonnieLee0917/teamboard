import type { Env } from '../index'

interface Connection {
  ws: WebSocket
}

export class RoomDO {
  private state: DurableObjectState
  private connections = new Set<Connection>()

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // POST /broadcast (internal): { kind, payload }
    if (req.method === 'POST' && url.pathname === '/broadcast') {
      const data = await req.text()
      this.broadcast(data)
      return new Response('ok')
    }

    // WebSocket upgrade
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.accept()

    const conn: Connection = { ws: server }
    this.connections.add(conn)

    server.addEventListener('close', () => this.connections.delete(conn))
    server.addEventListener('error', () => this.connections.delete(conn))

    return new Response(null, { status: 101, webSocket: client })
  }

  private broadcast(payload: string) {
    for (const c of this.connections) {
      try { c.ws.send(payload) } catch { this.connections.delete(c) }
    }
  }
}

// Helper used from Worker handlers
export async function broadcastEvent(env: Env, event: { kind: string; [k: string]: unknown }) {
  const id = env.ROOM.idFromName('global')
  const obj = env.ROOM.get(id)
  await obj.fetch('https://do/broadcast', { method: 'POST', body: JSON.stringify(event) })
}
