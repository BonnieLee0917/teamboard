# Mobile Pattern: Empty Column Collapse

> teamboard / GemBlitz / Tower Storm 通用 — 响应式看板/列表在 mobile 单列堆叠时折叠"只含空状态"的列。

## 场景

桌面端多列看板（grid 横向），切到 mobile (≤768px) 单列堆叠时，**只含空状态卡的列会变成视觉空洞**——用户上下滚动时一格"无内容"区强制占位，节奏被打断。

## 解法

```css
.kanban-col:has(.kanban-col__body > .col-empty:only-child) {
  display: none;
}
```

一行 CSS。利用 `:has()` 关系选择器精确命中"body 子节点只有一个 `.col-empty`"的列，整列从渲染树移除。

## 为什么不用 JS

- ❌ JS 监听数据 → toggle class：每次数据变更触发一次 reflow，列表抖动
- ❌ 服务端渲染时拿不到客户端断点，需要 hydrate 后再补一次
- ✅ CSS engine 自己 evaluate，零 JS 介入，零 reflow 抖动

## 反例（不要这么写）

| 写法 | 问题 |
| --- | --- |
| `.col:empty { display: none }` | 任何文本节点 / 空白都会让 `:empty` 失效 |
| `.col { min-height: 0 }` | 列塌陷成 0 高度，但仍占 grid 行，看不见但留缝 |
| 用 JS 数据长度判断后加 `.is-empty` class | 引入数据→DOM 同步链路，hydrate 期闪烁 |

---

## 决策框架：何时不写 fallback

新 CSS feature（`:has()` / container queries / `:is()` 等）出现时，**默认不写 JS fallback**。要写 fallback，必须三项全过：

### 三问

1. **降级行为是否破坏功能或视觉？**
   - 仅"多占一格高度 / 颜色稍 off / 间距退到默认"等不影响交互的退化 → **graceful degrade，不写 fallback**
   - 关键交互失效 / 布局崩坏 / 内容遮挡 → 必须 fallback

2. **目标用户分布在哪？**
   - 工具类 / 内部协作 / 现代浏览器为主（覆盖 ≥90%）→ **不写**
   - C 端泛人群 / 老旧设备占比有数据证明 >10% → 评估 fallback

3. **复杂度对称否？**
   - **量化错点：fallback 复杂度 ≤ 原方案 1.5x** → 可写
   - 超过 1.5x 视为不对称，放弃 fallback
   - 衡量参考：代码行数 / 依赖层（CSS-only → JS+state 同步属于跨层，默认 >1.5x） / 运行时开销（reflow / hydrate）

### 案例：`:has()` 在 teamboard

| 三问 | 结论 |
| --- | --- |
| 降级行为破坏功能？ | ❌ 老浏览器 fallback = 空列照常显示，graceful degrade |
| 用户在老浏览器？ | ❌ 团队协作工具，PC + 移动端核心人群在 Chrome 105+ / Safari 15.4+，覆盖 ~93% |
| 复杂度对称否？ | ❌ JS state 同步链路跨层，远超 1.5x 阈值（一行 CSS → JS+数据监听+class toggle+hydrate） |

→ **不写 fallback**。

### Anti-pattern

为了 7% 长尾用户引入 JS state 同步，把"一行 CSS"反向膨胀成 reflow + hydrate + 数据监听链路。**违反 distill 原则**。

---

## Baseline 默认能力（2026-Q2）

参见 `patterns/_baseline.md`：

- ✅ `:has()`
- ✅ `:is()` / `:where()`
- ✅ container queries
- ⚠️ subgrid — 单独评估

新组件 review 时，**默认假设以上能力可用**，不再问 "fallback 呢"，问的是 "你为什么需要 JS"。

---

## Changelog

- 2026-04-29 — 初版，源自 teamboard mobile 空列折叠（commit `b2ae908`）。Vivian Design Gate 9/9 PASS / Kane 收口决策。
