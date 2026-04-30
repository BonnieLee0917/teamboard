# Teamboard — agent-status 四态色板 v1

> 2026-04-30 · Vivian
> 用途：`/api/agents` 团队侧栏成员卡（A 路），与 task-card confidence_band（B 路）解耦。
> DOM：`<div class="agent-card" data-agent-status="idle|active|blocked|offline">`
> 后端 schema 真值（Bonnie 15:55 curl 实测）：`status: "idle" | "active" | "blocked" | "offline"`，**用 `active` 不用 `working`**（Haaland 2026-04-30 16:59 拍板：少一层 mapper 少一处漂移）。

## 1. 色板 token

| status | --rail 色 | opacity | 语义 |
|---|---|---|---|
| `idle` | `#4A4A4A` | 1.0 | 在线无任务 |
| `active` | `#2EBE7A` | 1.0 | 进行中 |
| `blocked` | `#D4524C` | 1.0 | 卡住 |
| `offline` | `#2A2A2A` | **0.55** | 离线 |
| 未匹配 | transparent | 1.0 | 兜底（中性，不降级） |

## 2. CSS 直出

```css
.agent-card {
  position: relative;
  display: flex; gap: 12px; align-items: center;
  padding: 12px 16px 12px 20px;
  border-radius: 10px;
  background: #141414;
  transition: opacity .2s ease;
}

.agent-card::before {
  content: ""; position: absolute;
  left: 0; top: 8px; bottom: 8px; width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--rail);
}

.agent-card[data-agent-status="idle"]    { --rail: #4A4A4A; }
.agent-card[data-agent-status="active"]  { --rail: #2EBE7A; }
.agent-card[data-agent-status="blocked"] { --rail: #D4524C; }
.agent-card[data-agent-status="offline"] { --rail: #2A2A2A; opacity: 0.55; }

/* 未匹配兜底（同 confidence_band 容错 baseline 风格）*/
.agent-card:not([data-agent-status="idle"]):not([data-agent-status="active"]):not([data-agent-status="blocked"]):not([data-agent-status="offline"]) {
  --rail: transparent;
}
```

## 3. 内部布局

| 元素 | 规格 |
|---|---|
| 头像 | 32×32 圆，`border-radius: 50%` |
| offline 头像 | 额外 `filter: grayscale(50%)` |
| 名字 | 14px / 500 / `#E8EAED` |
| role tag | 11px / `#9AA0A6`，无颜色（颜色锁给 status rail）|
| last_active 时间戳 | 走 `<time data-staleness>`（见 feed-states.md §7）|

## 4. 与 confidence_band 解耦

- `data-agent-status` **只挂** `.agent-card`（团队侧栏）
- `data-confidence` **只挂** `.task-card`（任务卡）
- 两者**不在同一节点共存**，避免选择器冲突
- 团队成员状态 = 在线/工作状态；任务置信 = LLM 解析质量。**两个语义维度独立**。

## 5. Rose 验收 checklist

- [ ] `data-agent-status` 四值切换 → 轨道色 / opacity 全联动
- [ ] 0 JS 分支判断 status（grep `if.*status` 应无业务命中）
- [ ] offline 态 0.55 透明 + 头像 grayscale 同时生效
- [ ] 未匹配 status 值 → 透明轨道（中性兜底）
- [ ] 375px 宽下名字不截断、role tag 不换行
