# CSS Baseline (2026-Q2)

> teamboard / GemBlitz / Tower Storm 共享。新组件 review 默认假设以下能力可用。

## ✅ 默认可用

| Feature | 浏览器要求 | 全球覆盖 | 团队首次引入 |
| --- | --- | --- | --- |
| `:has()` | Chrome 105+ / Safari 15.4+ / Firefox 121+ | ~93% | GemBlitz Roguelike 卡牌 |
| `:is()` / `:where()` | Chrome 88+ / Safari 14+ / Firefox 78+ | ~97% | Tower Storm HUD |
| container queries | Chrome 105+ / Safari 16+ / Firefox 110+ | ~92% | GemBlitz 棋盘自适应 |
| CSS nesting | Chrome 112+ / Safari 16.5+ / Firefox 117+ | ~90% | teamboard 初版 |
| `aspect-ratio` | Chrome 88+ / Safari 15+ | ~95% | Tower Storm 卡牌 |

## ⚠️ 单独评估

- subgrid — 仅在确实需要双轴对齐时使用
- `@scope` — 还没采纳，等 Firefox 稳定
- view transitions — 实验性，仅做 progressive enhancement

## ❌ 默认不假设

- IE / 老 Edge — 团队不再支持
- Safari < 15 — 用户占比 <2%

---

## 兜底原则

参见 `patterns/mobile/empty-column-collapse.md` 的 **决策框架：何时不写 fallback**。

三问：
1. 降级行为是否破坏功能或视觉？
2. 目标用户分布在哪？
3. 团队栈是否已默认采用？

任一为"否"才考虑 fallback；全为"是"则不写。

---

## Changelog

- 2026-04-29 — 初版，Kane 收口 / Vivian Design Gate 推动
