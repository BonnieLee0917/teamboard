import type { Env } from '../index'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function generateDailyReport(env: Env): Promise<void> {
  const date = todayStr()
  const dayStart = new Date(date + 'T00:00:00Z').getTime()

  // Pull metrics
  const tasksCreated = (await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM tasks WHERE created_at >= ?'
  ).bind(dayStart).first<{ n: number }>())?.n ?? 0

  const tasksDone = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM tasks WHERE done_at >= ?"
  ).bind(dayStart).first<{ n: number }>())?.n ?? 0

  const blocked = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM tasks WHERE status = 'blocked'"
  ).first<{ n: number }>())?.n ?? 0

  const { results: agentBreakdown } = await env.DB.prepare(`
    SELECT a.name, COUNT(t.id) AS done
      FROM agents a LEFT JOIN tasks t
        ON t.assignee_id = a.id AND t.done_at >= ?
     GROUP BY a.id ORDER BY done DESC
  `).bind(dayStart).all<{ name: string; done: number }>()

  const { results: events } = await env.DB.prepare(
    'SELECT kind, payload, created_at FROM events WHERE created_at >= ? ORDER BY created_at DESC LIMIT 80'
  ).bind(dayStart).all()

  const metrics = { tasksCreated, tasksDone, blocked, agentBreakdown }

  // LLM ─ Workers AI
  let summary = ''
  let model = '@cf/meta/llama-3.1-8b-instruct'
  try {
    const prompt = [
      '你是团队日报机器人。基于以下事件生成 4 段 markdown：',
      '① 今日完成（数字+亮点） ② 当前阻塞 ③ 各成员输出 ④ 明日重点',
      `统计：${JSON.stringify(metrics)}`,
      `事件(最多80条):\n${events.slice(0, 80).map(e => `- ${e.kind}: ${e.payload}`).join('\n')}`,
    ].join('\n\n')
    const res = await env.AI.run(model as never, {
      messages: [
        { role: 'system', content: '你是简洁的日报生成器，只输出 markdown，不闲聊。' },
        { role: 'user',   content: prompt },
      ],
    } as never) as { response?: string }
    summary = res.response ?? ''
    if (!summary || summary.length < 30) throw new Error('llm output too short')
  } catch (e) {
    // 模板兜底
    summary = renderFallback(date, metrics)
    model = 'fallback-template'
  }

  await env.DB.prepare(`
    INSERT INTO daily_reports (date, summary, metrics_json, generated_at, llm_model)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      summary = excluded.summary,
      metrics_json = excluded.metrics_json,
      generated_at = excluded.generated_at,
      llm_model = excluded.llm_model
  `).bind(date, summary, JSON.stringify(metrics), Date.now(), model).run()

  await env.DB.prepare(
    `INSERT INTO events (kind, payload, created_at) VALUES ('report_generated', ?, ?)`
  ).bind(JSON.stringify({ date, model }), Date.now()).run()
}

function renderFallback(date: string, m: { tasksCreated: number; tasksDone: number; blocked: number; agentBreakdown: Array<{ name: string; done: number }> }): string {
  const lines = [
    `# ${date} 日报（模板兜底）`,
    '',
    '## 今日完成',
    `- 任务完成: **${m.tasksDone}**`,
    `- 任务新增: **${m.tasksCreated}**`,
    '',
    '## 当前阻塞',
    `- 阻塞中任务: **${m.blocked}**`,
    '',
    '## 各成员输出',
    ...m.agentBreakdown.map(a => `- ${a.name}: ${a.done}`),
    '',
    '## 明日重点',
    '- 待 PM 同步',
  ]
  return lines.join('\n')
}
