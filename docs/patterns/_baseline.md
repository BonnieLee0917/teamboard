# Baseline (2026-Q2)

> teamboard / GemBlitz / Tower Storm 共享。新组件 review 默认假设以下能力 + token 可用。
>
> Review 双问：
> 1. **"你为什么需要 JS？"** — 套技术 baseline
> 2. **"你为什么不用 token？"** — 套设计 token baseline
>
> 两道题都答得上，才进 Design Gate。

---

## Part 1 · 技术 baseline（CSS 能力栈）

### ✅ 默认可用

| Feature | 浏览器要求 | 全球覆盖 | 团队首次引入 |
| --- | --- | --- | --- |
| `:has()` | Chrome 105+ / Safari 15.4+ / Firefox 121+ | ~93% | GemBlitz Roguelike 卡牌 |
| `:is()` / `:where()` | Chrome 88+ / Safari 14+ / Firefox 78+ | ~97% | Tower Storm HUD |
| container queries | Chrome 105+ / Safari 16+ / Firefox 110+ | ~92% | GemBlitz 棋盘自适应 |
| CSS nesting | Chrome 112+ / Safari 16.5+ / Firefox 117+ | ~90% | teamboard 初版 |
| `aspect-ratio` | Chrome 88+ / Safari 15+ | ~95% | Tower Storm 卡牌 |

### ⚠️ 单独评估

- subgrid — 仅在确实需要双轴对齐时使用
- `@scope` — 还没采纳，等 Firefox 稳定
- view transitions — 实验性，仅做 progressive enhancement

### ❌ 默认不假设

- IE / 老 Edge — 团队不再支持
- Safari < 15 — 用户占比 <2%

---

## Part 2 · 设计 token baseline（Vivian 维护）

### Spacing — `--space-*`

| Token | 像素 | 用途 |
| --- | --- | --- |
| `--space-xs` | 4px | 图标与文字间距、紧凑 chip |
| `--space-sm` | 8px | 内容内边距、按钮 padding-y |
| `--space-md` | 12px | 卡片内层间距、列表项间距 |
| `--space-lg` | 16px | 卡片外边距、块级分隔 |
| `--space-xl` | 24px | 区段分隔、空状态 padding |

### Color

走 token，**禁止写死 hex**：

- `--color-primary` / `--color-primary-hover`
- `--text-default` / `--text-muted` / `--text-disabled`
- `--bg-base` / `--bg-elevated` / `--bg-overlay`
- `--border-subtle` / `--border-default`

### Type scale

12 / 14 / 16 / 20 / 24（teamboard 已对齐 GemBlitz）

| Size | 用途 |
| --- | --- |
| 12px | 辅助说明、空状态文案 |
| 14px | 正文（默认） |
| 16px | 卡片标题 |
| 20px | 区段标题 |
| 24px | 页面标题 |

### Breakpoint

**单点 768px**，mobile-first：

```css
/* 默认 = mobile */
.col { ... }

/* desktop override */
@media (min-width: 769px) {
  .col { ... }
}

/* 或反向 mobile override（teamboard 当前用法） */
@media (width <= 768px) {
  .col { ... }
}
```

不引入第三个断点，列表/看板/卡片在 ≤768px 全部单列堆叠。

---

## 兜底原则

参见 `patterns/mobile/empty-column-collapse.md` 的 **决策框架：何时不写 fallback**。

三问：
1. 降级行为是否破坏功能或视觉？
2. 目标用户分布在哪？
3. 复杂度对称否？【**fallback 复杂度 ≤ 原方案 1.5x**，超过视为不对称，放弃】

任一为"否"才考虑 fallback；全为"是"则不写。

---

## Changelog

- 2026-04-29 — 初版双栏结构。技术 baseline by Haaland，设计 token baseline by Vivian。Kane 收口决策。
