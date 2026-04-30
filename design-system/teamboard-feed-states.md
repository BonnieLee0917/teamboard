# Teamboard — feed 三态稿（loading / polling-stale / failed）

> 2026-04-30 · Vivian
> 配套：`design-system/teamboard-confidence-band.md`（agent-card 主视觉）
> 触发背景：Bonnie 2026-04-30 拍砍 WS 改 5s polling，原 reconnecting 态淘汰。
> 落地方式：DOM 写 `<main class="feed" data-feed-state="loading|polling-stale|failed|ok">`，CSS attr selector 全分支，零 if。

---

## 1. 状态定义与触发

| state | 触发条件 | 退出条件 |
|---|---|---|
| `ok` | 成功响应在 10s 内，有数据 | — |
| `loading` | 首次 fetch 未返回（无任何成功响应历史） | 第一次成功响应 → `ok` |
| `polling-stale` | 距 `lastSuccessAt` **>10s** 仍无新成功响应 | 任意成功响应 → `ok` |
| `failed` | **连续 3 次轮询失败 (>15s 无成功响应)** | 任意成功响应 → `ok` |

**态机优先级：** `failed` > `polling-stale` > `loading` > `ok`（同时命中取高优）。

**依赖（已与 Haaland 对齐）：** `src/lib/client.ts` 暴露
- `fetchNow(): Promise<void>` — 立即触发一次拉取，**不重置 5s 定时器**
- `lastSuccessAt: number | null` — 时间戳（ms）
- `failureStreak: number` — 连续失败计数

---

## 2. 视觉规范（token 化）

### 2.1 loading

```css
.feed[data-feed-state="loading"] {
  /* skeleton 三行 */
}
.feed[data-feed-state="loading"] .agent-card {
  display: none; /* 用 skeleton 替代 */
}
.feed[data-feed-state="loading"] .skeleton {
  display: block;
  height: 84px;             /* 对齐 agent-card 高度 */
  margin-bottom: 12px;      /* 对齐卡片间距 */
  border-radius: 12px;
  background: linear-gradient(90deg, #1A1A1A 0%, #1F1F1F 50%, #1A1A1A 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
```

| token | 值 |
|---|---|
| skeleton bg base | `#1A1A1A` |
| skeleton bg highlight | `#1F1F1F` |
| skeleton 行数 | 3 |
| skeleton 行高 | `84px` |
| shimmer 周期 | `1.4s ease-in-out` |

### 2.2 polling-stale（顶部细 banner，**不灰化卡片、不阻断交互**）

```css
.feed[data-feed-state="polling-stale"]::before {
  content: "数据已过期 · 上次更新 " attr(data-stale-text);
  display: flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 16px;
  background: rgba(212, 162, 76, 0.08);
  border-bottom: 1px solid rgba(212, 162, 76, 0.24);
  color: #D4A24C;
  font: 500 12px/32px ui-sans-serif;
}
```

| token | 值 |
|---|---|
| banner bg | `rgba(212,162,76,.08)` |
| banner border | `rgba(212,162,76,.24)` |
| banner text | `#D4A24C` |
| banner 高度 | `32px` |
| icon | `loader-circle`（旋转 1.2s linear）位于左侧 16px |
| 文案 | `数据已过期 · 上次更新 Xs 前` |

**Haaland 接口：** DOM 上写 `data-stale-text="12s 前"`，由 client.ts 每 1s tick 更新。

### 2.3 failed（顶部 banner + **常驻** 「重新连接」按钮）

```css
.feed[data-feed-state="failed"]::before {
  content: "连接失败 · 数据可能不是最新";
  display: flex; align-items: center;
  height: 44px; padding: 0 16px;
  background: rgba(212, 82, 76, 0.12);
  border-bottom: 1px solid rgba(212, 82, 76, 0.32);
  color: #FF8B85;
  font: 600 13px/44px ui-sans-serif;
}
.feed[data-feed-state="failed"] .reconnect-btn {
  display: inline-flex;     /* 常驻 */
}
.feed:not([data-feed-state="failed"]) .reconnect-btn {
  display: none;
}
.reconnect-btn {
  height: 28px; padding: 0 12px;
  border-radius: 6px;
  background: #D4524C; color: #FFFFFF;
  font: 600 12px/28px ui-sans-serif;
  border: none; cursor: pointer;
}
.reconnect-btn:hover { background: #E0635D; }
.reconnect-btn:active { background: #B84540; }
```

| token | 值 |
|---|---|
| banner bg | `rgba(212,82,76,.12)` |
| banner border | `rgba(212,82,76,.32)` |
| banner text | `#FF8B85` |
| banner 高度 | `44px` |
| 文案 | `连接失败 · 数据可能不是最新` |
| 按钮文案 | **「重新连接」**（不写「重试」）|
| 按钮 bg / hover / active | `#D4524C` / `#E0635D` / `#B84540` |
| 行为 | `onClick = client.fetchNow()`，**不重置定时器** |

---

## 3. DOM 结构（Haaland 抄走）

```html
<main class="feed"
      data-feed-state="loading|polling-stale|failed|ok"
      data-stale-text="12s 前">
  <header class="feed-banner">
    <button class="reconnect-btn" onclick="client.fetchNow()">重新连接</button>
  </header>

  <div class="skeleton"></div>
  <div class="skeleton"></div>
  <div class="skeleton"></div>

  <div class="agent-card" data-confidence="high">…</div>
  <div class="agent-card" data-confidence="medium">…</div>
  <div class="agent-card" data-confidence="low">…</div>
</main>
```

JS 只做一件事：根据 `failureStreak` / `lastSuccessAt` 写 `data-feed-state` + `data-stale-text`，零分支。

---

## 4. 行为契约（重申，与 Kane / Bonnie 对齐）

- 文案 **「重新连接」**，禁用「重试」「刷新」
- 「重新连接」点击 = `client.fetchNow()`，**不重置 5s 定时器**
- 按钮在 failed 态**常驻显示**，不动态显隐
- `polling-stale` 态卡片**不灰化、不阻断交互**，仅顶部 banner 提示
- `failed` 态卡片继续展示**最后一次成功响应数据**（陈旧但可读 > 空白）
- 三态互斥，由 `data-feed-state` 一个属性驱动，禁止 JS if/else

---

## 5. Rose 验收 checklist

- [ ] `data-feed-state="loading"` 显示 3 行 skeleton + shimmer，agent-card 隐藏
- [ ] 距 `lastSuccessAt` 超 10s 自动切 `polling-stale`，banner 出现，卡片仍可点
- [ ] 连续 3 次失败切 `failed`，「重新连接」按钮常驻
- [ ] 点击「重新连接」立即触发 `fetchNow()`（截 network tab 验）
- [ ] 任意成功响应回 `ok`，banner 消失，卡片刷新
- [ ] 375px 宽 banner 文案不溢出、按钮不挤压
- [ ] 对比度 AA：banner 文字 vs 半透明底 ≥ 4.5
- [ ] 整个流程 **0 个 JS 分支判断 state**（grep `if.*state` 应无业务命中）

---

## 7. 卡片级 stale 指示（Haaland 2026-04-30 15:28 请求补充）

> 背景：feed 整体 polling-stale 只在顶部 banner 提示，但单张卡片的 `last_event_at` 陈旧度需要独立语义（某些 agent 很久没事件 ≠ 轮询失败）。

### 7.1 原则
- **不灰化卡片主体**（会和 failed 态语义冲突）
- **只动时间戳，不动 confidence 色板**（confidence 是业务评价，与陈旧度正交）
- **色不用红**（红色预留给 failed/error）

### 7.2 三档 stale 阈值

| 档 | 阈值（now - last_event_at）| 时间戳色 | 文案 |
|---|---|---|---|
| fresh | < 60s | `#9AA0A6` 中性灰 | “just now” / `Xs ago` |
| stale | 60s – 5min | `#7A6A4A` 暗黄 | `Xm ago` |
| cold | > 5min | `#5A4A40` 暗棕 + italic | `Xh ago` / `Xd ago` |

### 7.3 CSS（Haaland 拄走）

DOM：`<time class="event-time" data-staleness="fresh|stale|cold" datetime="...">2m ago</time>`。staleness 由前端由 `last_event_at` 计算出（唯一允许的 JS 分支）。

```css
.event-time { font: 500 12px/1 ui-sans-serif; }
.event-time[data-staleness="fresh"] { color: #9AA0A6; }
.event-time[data-staleness="stale"] { color: #7A6A4A; }
.event-time[data-staleness="cold"]  { color: #5A4A40; font-style: italic; }
```

### 7.4 不做的东西（避免歧义）
- 不加闪烁 / 脉冲动画（越陈旧越不应该抢眼球）
- 不加「过期」徽章（仅靠颜色+文本）
- 卡片 border / bg 一律按 confidence_band 走，不变

### 7.5 陈旧度计算（唯一允许的 JS）

```ts
function staleness(lastEventAt: number, now = Date.now()): 'fresh'|'stale'|'cold' {
  const diff = now - lastEventAt;
  if (diff < 60_000)     return 'fresh';
  if (diff < 5 * 60_000) return 'stale';
  return 'cold';
}
```

在 polling tick（5s）同步一次所有卡片的 `data-staleness` + 重算文案（“Xs ago”）。

---

## 8. 边界与降级

- **空数据态**（`ok` 且数组为 0）不在本 doc，走 baseline empty state，独立处理
- **`data-feed-state` 未匹配** → `:not([data-feed-state="loading"]):not(...)` 兜底走 `ok` 视觉，不报错
- 移动端 375px 复检并入 P1 Sprint，本 doc tokens 已对齐 baseline，预计无需调整
