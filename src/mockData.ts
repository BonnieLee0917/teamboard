import type { SprintState } from './types'

export const mockData: SprintState = {
  sprintName: 'Sprint 1 — 自治循环 MVP',
  updatedAt: new Date().toISOString(),
  tasks: [
    {
      id: 'T1',
      title: 'STATE.json 工具库 (read/update/validate-nonce)',
      assignee: 'Haaland',
      status: 'in-progress',
      priority: 'P0',
      confidence_band: 'high',
      requiresDesign: false,
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      updatedAt: new Date(Date.now() - 1800000).toISOString(),
      startedAt: new Date(Date.now() - 1800000).toISOString(),
      gateResults: [],
      history: [
        { at: new Date(Date.now() - 1800000).toISOString(), actor: 'Haaland', message: '开始实现 STATE 工具库骨架' }
      ]
    },
    {
      id: 'T2',
      title: 'Gate 接口规范 + gate.js Layer 1 实现',
      assignee: 'Rose',
      status: 'in-progress',
      priority: 'P0',
      confidence_band: 'medium',
      requiresDesign: false,
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 900000).toISOString(),
      startedAt: new Date(Date.now() - 900000).toISOString(),
      gateResults: [],
      history: [
        { at: new Date(Date.now() - 900000).toISOString(), actor: 'Rose', message: '接口对齐完成，开始写 gate.js' }
      ]
    },
    {
      id: 'T3',
      title: 'DESIGN-GATE.md + design-check 执行框架',
      assignee: 'Vivian',
      status: 'review',
      priority: 'P1',
      confidence_band: 'low',
      requiresDesign: true,
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 600000).toISOString(),
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      gateResults: [
        {
          layer: 1,
          result: 'pass',
          summary: '2/2 checks passed',
          durationMs: 1200,
          timestamp: new Date(Date.now() - 600000).toISOString(),
          checks: [
            { name: 'valid structure', pass: true },
            { name: 'consistent formatting', pass: true }
          ]
        }
      ],
      history: [
        { at: new Date(Date.now() - 3600000).toISOString(), actor: 'Vivian', message: '开始写 DESIGN-GATE.md' },
        { at: new Date(Date.now() - 600000).toISOString(), actor: 'Vivian', message: '初稿完成，进入 review' }
      ]
    },
    {
      id: 'T4',
      title: 'SPEC 模板 + coordinator 流程文档',
      assignee: 'Bonnie',
      status: 'done',
      priority: 'P0',
      requiresDesign: false,
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      updatedAt: new Date(Date.now() - 1200000).toISOString(),
      startedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      doneAt: new Date(Date.now() - 1200000).toISOString(),
      gateResults: [
        {
          layer: 1,
          result: 'pass',
          summary: '3/3 checks passed',
          durationMs: 800,
          timestamp: new Date(Date.now() - 1200000).toISOString(),
          checks: [
            { name: 'valid structure', pass: true },
            { name: 'no broken refs', pass: true },
            { name: 'consistent formatting', pass: true }
          ]
        }
      ],
      history: [
        { at: new Date(Date.now() - 3600000 * 3).toISOString(), actor: 'Bonnie', message: '开始起草 SPEC 模板' },
        { at: new Date(Date.now() - 1200000).toISOString(), actor: 'Bonnie', message: '模板定稿，door禁通过 ✅' }
      ]
    },
    {
      id: 'T5',
      title: 'GitHub Actions CI 硬门禁 workflow',
      assignee: 'Kane',
      status: 'done',
      priority: 'P0',
      requiresDesign: false,
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      updatedAt: new Date(Date.now() - 2400000).toISOString(),
      startedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      doneAt: new Date(Date.now() - 2400000).toISOString(),
      gateResults: [
        {
          layer: 1,
          result: 'pass',
          summary: '2/2 checks passed',
          durationMs: 600,
          timestamp: new Date(Date.now() - 2400000).toISOString(),
          checks: [
            { name: 'valid yaml', pass: true },
            { name: 'steps complete', pass: true }
          ]
        }
      ],
      history: [
        { at: new Date(Date.now() - 3600000 * 2).toISOString(), actor: 'Kane', message: '搭建 gate.yml workflow' },
        { at: new Date(Date.now() - 2400000).toISOString(), actor: 'Kane', message: 'CI workflow 完成 ✅' }
      ]
    },
    {
      id: 'T6',
      title: 'Team Dashboard — Vite + React 项目骨架',
      assignee: 'Haaland',
      status: 'in-progress',
      priority: 'P0',
      requiresDesign: true,
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      updatedAt: new Date(Date.now() - 300000).toISOString(),
      startedAt: new Date(Date.now() - 1800000).toISOString(),
      gateResults: [],
      history: [
        { at: new Date(Date.now() - 1800000).toISOString(), actor: 'Haaland', message: '项目骨架搭建中，已完成 Vite + TypeScript 初始化' }
      ]
    },
    {
      id: 'T7',
      title: 'Layer 2 Playwright 核心路径用例框架',
      assignee: 'Rose',
      status: 'pending',
      priority: 'P1',
      requiresDesign: false,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      gateResults: [],
      history: []
    },
    {
      id: 'T8',
      title: 'Discord 通知分级模块',
      assignee: 'Haaland',
      status: 'pending',
      priority: 'P1',
      requiresDesign: false,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      gateResults: [],
      history: []
    },
    {
      id: 'T9',
      title: 'check_next() 调度逻辑 + STATE 状态机',
      assignee: 'Haaland',
      status: 'blocked',
      priority: 'P0',
      requiresDesign: false,
      attempts: 3,
      maxAttempts: 3,
      createdAt: new Date(Date.now() - 5400000).toISOString(),
      updatedAt: new Date(Date.now() - 1500000).toISOString(),
      startedAt: new Date(Date.now() - 5400000).toISOString(),
      gateResults: [
        {
          layer: 1,
          result: 'fail',
          summary: '1/3 checks passed',
          durationMs: 4200,
          timestamp: new Date(Date.now() - 1500000).toISOString(),
          checks: [
            { name: 'npm test', pass: false, output: '3 tests failed: oscillation detection edge case' },
            { name: 'tsc --noEmit', pass: true },
            { name: 'npm run build', pass: false, output: 'type error in transition.ts:42' }
          ],
          failReason: 'npm test failed after 3 attempts — oscillation detection logic 有 bug，等 Kane 确认规则后重新实现'
        }
      ],
      history: [
        { at: new Date(Date.now() - 5400000).toISOString(), actor: 'Haaland', message: '开始实现状态机' },
        { at: new Date(Date.now() - 3600000).toISOString(), actor: 'System', message: 'Attempt 1 gate failed' },
        { at: new Date(Date.now() - 2700000).toISOString(), actor: 'System', message: 'Attempt 2 gate failed' },
        { at: new Date(Date.now() - 1500000).toISOString(), actor: 'System', message: 'Attempt 3 gate failed → BLOCKED' }
      ]
    }
  ],
  activity: [
    { id: 'a1', actor: 'Haaland', taskId: 'T6', message: '项目骨架搭建中', at: new Date(Date.now() - 300000).toISOString(), tone: 'default' },
    { id: 'a2', actor: 'System', taskId: 'T9', message: 'T9 blocked (3/3) — 调度逻辑等待 Kane 确认规则', at: new Date(Date.now() - 1500000).toISOString(), tone: 'critical' },
    { id: 'a3', actor: 'Vivian', taskId: 'T3', message: 'DESIGN-GATE.md 初稿完成，进入 review', at: new Date(Date.now() - 600000).toISOString(), tone: 'default' },
    { id: 'a4', actor: 'Kane', taskId: 'T5', message: 'CI workflow 完成并通过门禁 ✅', at: new Date(Date.now() - 2400000).toISOString(), tone: 'success' },
    { id: 'a5', actor: 'Bonnie', taskId: 'T4', message: 'SPEC 模板定稿，门禁通过 ✅', at: new Date(Date.now() - 1200000).toISOString(), tone: 'success' },
    { id: 'a6', actor: 'Rose', taskId: 'T2', message: '接口对齐完成，开始写 gate.js', at: new Date(Date.now() - 900000).toISOString(), tone: 'default' },
  ]
}
