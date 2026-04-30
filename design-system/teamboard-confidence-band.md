# Teamboard — confidence_band 状态机色板映射表 v1

> 2026-04-30 出稿 · Vivian
> 用途：Haaland mock 接 `/api/feed` 时 agents 卡片直出，**零 if**，CSS attr selector 全包。
> 落地方式：DOM 写 `<div class="agent-card" data-confidence="high|medium|low">`，CSS 选择器 `.agent-card[data-confidence="high"]` 全分支。

## 🚨 命名修订（Kane schema 对账后，2026-04-30 15:48）

- 类名 `.agent-card` → **`.task-card`**（confidence_band 来自 `/api/parse`，是任务级字段；`/api/agents` 走 status 不走 confidence）
- DOM：`<div class="task-card" data-confidence="high|medium|low">`
- 本 doc 下文所有 `.agent-card` 一律读作 `.task-card`

## ⚠️ 容错 baseline（Kane 拍板，2026-04-30）

- `data-confidence` 取值**严格穷举** `high | medium | low`，**无 fallback 态**
- 未匹配（null / unknown / 拼写错） = **不上色板**，agent-card 走 `:not([data-confidence="high"]):not([data-confidence="medium"]):not([data-confidence="low"])` 渲染中性 `#1F1F1F` 边框
- **不默认降级到 low**（low 是"低置信"语义，错把 unknown 渲染成 low 是误导用户）
- 后端给出第四个值时 Haaland type 层拒绝，不进 DOM

```css
.agent-card:not([data-confidence="high"]):not([data-confidence="medium"]):not([data-confidence="low"]) {
  --card-bg: #141414; --card-border: #2A2A2A; --card-border-w: 1px;
  --shadow: none;
}
```

---

## 1. 三档基础色板

| token | high (band=high) | medium (band=medium) | low (band=low) |
|---|---|---|---|
| `--card-bg`        | `#0F1A14` | `#1A1614` | `#1A1014` |
| `--card-border`    | `#2EBE7A` | `#D4A24C` | `#D4524C` |
| `--card-border-w`  | `1.5px`   | `1.5px`   | `2px`     |
| `--badge-bg`       | `#2EBE7A` | `#D4A24C` | `#D4524C` |
| `--badge-fg`       | `#0A0F0C` | `#1A130A` | `#FFFFFF` |
| `--badge-text`     | `HIGH`    | `MEDIUM`     | `LOW`     |
| `--icon`           | `check-circle` | `alert-circle` | `x-circle` |
| `--icon-color`     | `#2EBE7A` | `#D4A24C` | `#D4524C` |
| `--shadow`         | `0 0 0 1px rgba(46,190,122,.2)` | `0 0 0 1px rgba(212,162,76,.2)` | `0 0 0 1px rgba(212,82,76,.25)` |

**对比度（vs `#0F0F0F` body bg）：**
- high `#2EBE7A` AA 4.7 ✅
- medium `#D4A24C` AA 6.1 ✅
- low `#D4524C` AA 4.6 ✅（low 加粗 border 2px 强化辨识，避免色弱误读）

---

## 1.5 raw_input 显示策略（Kane 2026-04-30 拍板）

> 数据来源：`/api/parse` 响应里的 `raw: input` 字段，所有 confidence 档位都返回。
> 目的：medium/low 档位下让用户能 verify 解析结果，而不是盲信 LLM 输出。

| confidence | raw_input 默认行为 | 提示文案 | DOM |
|---|---|---|---|
| high | **隐藏**（不显示，避免噪音） | — | `<details data-raw>` 不渲染 |
| medium | **折叠**（点击「显示原文」展开）| 「显示原文」 | `<details data-raw class="collapsed">` |
| low | **默认展开** + 顶部黄条提示 | 「⚠️ 需要你确认这条解析」 | `<details data-raw open>` |

**CSS 直出（task-card 内部）：**

```css
.task-card[data-confidence="high"] [data-raw] { display: none; }
.task-card[data-confidence="medium"] [data-raw] { display: block; }
.task-card[data-confidence="medium"] [data-raw] > summary { cursor: pointer; color: #9AA0A6; font-size: 12px; }
.task-card[data-confidence="low"] [data-raw] { display: block; }
.task-card[data-confidence="low"] [data-raw][open] > .raw-text { display: block; }
.task-card[data-confidence="low"]::before {
  content: "⚠️ 需要你确认这条解析";
  display: block;
  padding: 6px 12px;
  margin-bottom: 8px;
  background: rgba(212, 82, 76, 0.10);
  border-left: 2px solid #D4524C;
  color: #FF8B85;
  font: 500 12px/1.4 ui-sans-serif;
  border-radius: 4px;
}
.raw-text {
  padding: 8px 12px; margin-top: 8px;
  background: rgba(255,255,255,.03); border-radius: 6px;
  color: #C9CDD4; font: 400 12px/1.5 ui-monospace;
  white-space: pre-wrap; word-break: break-word;
}
```

**DOM（Haaland 抄走）：**

```html
<div class="task-card" data-confidence="low">
  <!-- 业务字段 -->
  <details data-raw open="">
    <summary>显示原文</summary>
    <div class="raw-text">{rawInput}</div>
  </details>
</div>
```

**JS 零分支：** `<details>` 原生 toggle 行为 + `data-confidence` attr selector 控开合，不写 if。

---

## 1.6 多 @ 提示标记（Kane 2026-04-30 拍板：单 assignee ship + array Sprint 2）

> 后端 v1 `/api/parse` 仅识别第一个 `<@id>`，多人 @ 静默丢失会让用户以为系统漏处理。
> UX 兜底：检测到 raw_input 含 ≥2 个 `<@id>` 时，task-card 右上角加 `+N` 标记 + tooltip。

```css
.task-card[data-extra-mentions]::after {
  content: "+" attr(data-extra-mentions);
  position: absolute; top: 12px; right: 12px;
  padding: 2px 6px; border-radius: 10px;
  background: rgba(255,255,255,.06); color: #9AA0A6;
  font: 500 10px/14px ui-sans-serif;
}
.task-card[data-extra-mentions]::after:hover {
  background: rgba(255,255,255,.10);
}
.task-card { position: relative; }
```

**Haaland 渲染：**
```ts
const extra = (rawInput.match(/<@\d+>/g) || []).length - 1;
// extra > 0 时挂 data-extra-mentions="N"，否则不挂
```

**Tooltip 文案：** 「另有 N 人被 @，v1 仅处理第一位」（用 `title` 属性即可，原生 tooltip，零成本）。

---

## 2. 尺寸 / 间距

| 元素 | 值 |
|---|---|
| 卡片 padding | `16px 20px` |
| 卡片 radius  | `12px` |
| Badge 高度   | `22px` |
| Badge padding| `0 8px` |
| Badge radius | `6px` |
| Badge font   | `11px / 600 / 0.04em letter-spacing` |
| Icon size    | `16px` |
| Icon → text gap | `8px` |
| 卡片间距     | `12px` |

---

## 3. CSS 直出（Haaland 抄走）

```css
.agent-card {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 16px 20px;
  border-radius: 12px;
  background: var(--card-bg);
  border: var(--card-border-w) solid var(--card-border);
  box-shadow: var(--shadow);
}
.agent-card[data-confidence="high"] {
  --card-bg: #0F1A14; --card-border: #2EBE7A; --card-border-w: 1.5px;
  --shadow: 0 0 0 1px rgba(46,190,122,.2);
}
.agent-card[data-confidence="medium"] {
  --card-bg: #1A1614; --card-border: #D4A24C; --card-border-w: 1.5px;
  --shadow: 0 0 0 1px rgba(212,162,76,.2);
}
.agent-card[data-confidence="low"] {
  --card-bg: #1A1014; --card-border: #D4524C; --card-border-w: 2px;
  --shadow: 0 0 0 1px rgba(212,82,76,.25);
}

.agent-card .badge {
  height: 22px; padding: 0 8px; border-radius: 6px;
  font: 600 11px/22px ui-sans-serif; letter-spacing: .04em;
  background: var(--badge-bg); color: var(--badge-fg);
}
.agent-card[data-confidence="high"] .badge { --badge-bg:#2EBE7A; --badge-fg:#0A0F0C; }
.agent-card[data-confidence="medium"]  .badge { --badge-bg:#D4A24C; --badge-fg:#1A130A; }
.agent-card[data-confidence="low"]  .badge { --badge-bg:#D4524C; --badge-fg:#FFFFFF; }
```

**badge 文案直接由 CSS `::before` 注入，DOM 不写 HIGH/MEDIUM/LOW：**

```css
.agent-card[data-confidence="high"] .badge::before { content: "HIGH"; }
.agent-card[data-confidence="medium"]  .badge::before { content: "MEDIUM"; }
.agent-card[data-confidence="low"]  .badge::before { content: "LOW"; }
```

---

## 4. 三态（feed 加载/陈旧/错误） — Bonnie 2026-04-30 调整

> 背景：Haaland 砍 WS 改 **5s polling**，「reconnecting」态不存在（轮询无连接概念）。
> 三态改为：**loading / polling-stale / failed**。

| 态 | 视觉 | 触发 |
|---|---|---|
| loading | skeleton 灰条 `#1F1F1F` 三行 + shimmer 1.4s | 首次 fetch 未返回 |
| polling-stale | 顶部细 banner `#D4A24C` 8% 底 + "数据已过期 · 上次更新 Xs 前" + 旋转 icon | 距上次成功响应 **>10s** 仍无新数据 |
| failed | 顶部 banner `#D4524C` 12% 底 + "连接失败 · [重新连接]" 按钮（**常驻不动态显隐**）| 连续 3 次轮询失败（>15s 无成功响应）|

**行为契约（Kane 已拍 attr/retry/常驻三条；Bonnie 已拍砍 WS 改 polling）：**
- 文案 **「重新连接」**，不写「重试」
- 行为：点击 = **立即触发一次 `client.fetchAgents()`**（轮询场景下相当于跳过当前 5s 间隔），不重置定时器
- 按钮在 failed 态**常驻**，不动态显隐
- polling-stale 态卡片不灰化、不阻断交互，只在顶部 banner 提示陈旧度
- 依赖：Haaland 在 `src/lib/client.ts` 暴露 `fetchNow()` 同步方法 + `lastSuccessAt` 时间戳

---

## 5. 验收 checklist（Rose 用）

- [ ] 三档 data-confidence DOM 切换，色板/边框/badge/icon 全联动
- [ ] 无任何 JS 分支判断 confidence
- [ ] 对比度 AA ≥ 4.5（low 文本在 `#1A1014` 上）
- [ ] 375px 宽 badge 不换行、icon 不挤压
- [ ] reconnecting/failed banner 不遮挡第一张卡片
