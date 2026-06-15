# WordDetail 沉浸式 3D 视差卡片 — 设计文档

**日期**: 2026-06-15
**范围**: `web/src/pages/WordDetail.tsx` 重写 + 新增子组件
**状态**: 已确认，待实现计划

## 1. 背景与目标

当前 `WordDetail.tsx`（151 行）使用 3D 翻转卡片作为顶部焦点，下方内容用 Tabs 切换（释义 / 例句 / 同义词 / 词根）。问题：

- **内容被隐藏在 Tab 后**，用户需多次点击才能看完一个单词的全部信息。
- **所有 Tab 内容视觉同质化**（统一的 `border-white/10 bg-white/5` 卡片），没有颜色区分，扫读效率低。

**目标**：改为一次性展现所有内容的扁平长文档式卡片，通过彩色标签编码不同字段，叠加沉浸式动效与 3D 视差倾斜，达到"信息密度高 + 视觉炫酷"的双重效果。

## 2. 设计决策（已通过可视化对比确认）

| 维度 | 选择 | 理由 |
|---|---|---|
| 整体布局 | **扁平长文档**（移除 3D 翻转卡 + Tabs） | 信息密度最高，一眼扫完 |
| 视觉档次 | **沉浸式 B3** | 流光渐变 + 彩虹边框 + 辉光标签 + 光斑漂移 |
| 例句渲染 | **引用块 E3** | 蓝色左边框，英文斜体带引号 + 中文弱化 |
| 3D 效果 | **3D-C 倾斜 + 深度分层** | 鼠标倾斜 + 字段 Z 深度视差，最炫且性能轻 |

## 3. 页面结构

```
[← 返回列表]                              ← Button ghost（保留现状）
[已掌握] [gre]                            ← Badge 行（保留现状）

┌─ ParallaxCard（perspective 容器）──────────────────────┐
│  • 漂移光斑层 (z=25)                                   │
│  • 彩虹流动边框 (mask 镂空)                             │
│                                                        │
│  Z=55  abandon                          ← 流光渐变标题  │
│  Z=35  /əˈbændən/ · v.                  ← 音标 + 词性   │
│  ════ 彩虹渐变分隔线 ════                               │
│                                                        │
│  Z=30  [释义] 放弃；抛弃                                │
│                to give up completely (弱化英文)         │
│  Z=25  [词根] ab-（离开）+ -andon → 完全交给、放弃       │
│  Z=25  [搭配] abandon hope · abandon ship               │
│  Z=20  [派生] abandonment (n.) · abandoned (adj.)       │
│  Z=20  [同义] [forsake] [desert] [quit] [relinquish]   │
│  Z=15  [例句]                                           │
│        │ "He abandoned the ship in the storm."          │
│        │ 他在暴风雨中放弃了那艘船。                      │
│        │ "They abandoned hope of rescue."                │
│        │ 他们放弃了获救的希望。                          │
│                                                        │
│  （字段为空则该行自动隐藏）                              │
└────────────────────────────────────────────────────────┘
```

**顶部元素保留**：返回按钮、状态 Badge（已掌握/复习中/学习中/未学习）、来源 Badge（gre/toefl）。逻辑沿用现有 `statusLabel()` 函数。

## 4. 颜色编码系统

每个字段对应固定颜色，标签（pill）和引用块边框都遵循此映射：

| 字段 | 色系 | 文字色 | 边框/背景色 | Tailwind token |
|---|---|---|---|---|
| 释义 meaning | 琥珀 amber | `#fbbf24` | `rgba(245,158,11,0.2)` bg / `0.4` border | `amber-400` / `amber-500` |
| 词根 root | 翠绿 emerald | `#34d399` | `rgba(16,185,129,0.2)` / `0.4` | `emerald-400` / `emerald-500` |
| 搭配 collocations | 紫 violet | `#c4b5fd` | `rgba(139,92,246,0.2)` / `0.4` | `violet-400` / `violet-500` |
| 派生 derivatives | 青 cyan | `#67e8f9` | `rgba(6,182,212,0.2)` / `0.4` | `cyan-300` / `cyan-500` |
| 同义 synonyms | 粉红 pink | `#f9a8d4` | `rgba(236,72,153,0.2)` / `0.4` | `pink-300` / `pink-500` |
| 例句 examples | 天蓝 blue | `#60a5fa` | `rgba(59,130,246,0.2)` / `0.4` | `blue-400` / `blue-500` |

**词性 pos**：附加在音标行，不单独成段（`/əˈbændən/ · v.`）。

**参考 references**：复用紫色（violet）标签，单行渲染。该字段在数据中较少见，为空则隐藏。

## 5. 沉浸式视觉（B3 档）

### 5.1 单词标题流光
- 渐变文字（`background-clip: text`）：白 `#ffffff` → 紫 `#c4b5fd` → 蓝 `#60a5fa` → 白
- `background-size: 200% auto`，`shimmer` keyframe 4s 线性循环平移 `background-position`
- 叠加 `text-shadow` 伪立体增强厚度（`0 0 30px rgba(139,92,246,0.4)`）

### 5.2 卡片彩虹流动边框
- mask 镂空法：`::before` 伪元素，`padding: 1px`，渐变背景，`mask-composite: exclude` 只显示边框
- 渐变：紫 → 蓝 → 粉 → 紫，`background-size: 200% 200%`，`border-flow` 6s 循环

### 5.3 背景漂移光斑
- 卡片内两个绝对定位 div，`border-radius: 50%`，`filter: blur(40px)`
- 光斑 1：紫 `rgba(139,92,246,0.25)`，右上，`drift1` 8s 漂移
- 光斑 2：绿 `rgba(16,185,129,0.18)`，左下，`drift2` 10s 漂移
- `pointer-events: none`，`z-index` 低于内容

### 5.4 彩色标签辉光
- 标签（pill）：半透明背景 + 1px 同色边框
- `:hover` 触发 `pulse-glow` keyframe（`box-shadow` 6px → 14px 脉冲，1.2s）
- CSS 变量 `--gc` 传递各色辉光值

### 5.5 彩虹分隔线
- 单词与正文之间：`height: 1px`，`linear-gradient(90deg, amber, emerald, blue, pink, transparent)`

### 5.6 入场动画
- 各字段行 `fade-up` keyframe：`translateY(8px) + opacity:0` → 归位
- stagger：每行 `animation-delay` 递增 50ms，总时长 < 0.4s
- `prefers-reduced-motion: reduce` 时禁用所有动画

## 6. 3D 视差倾斜（3D-C）

### 6.1 容器与变换
- 卡片父容器：`perspective: 1000px`
- 卡片本体：`transform-style: preserve-3d`，`transition: transform 0.15s ease-out`
- mousemove 事件计算鼠标相对容器中心的偏移（-0.5 ~ 0.5），映射到 `rotateY(±12°)` / `rotateX(∓12°)`
- mouseleave：transform 归零（平滑回正）

### 6.2 深度分层（translateZ）
| 元素 | translateZ |
|---|---|
| 单词标题 | 55px |
| 音标行 | 35px |
| 漂移光斑 | 25px |
| 释义行 | 30px |
| 词根 / 搭配行 | 25px |
| 派生 / 同义行 | 20px |
| 例句区 | 15px |

越靠上的元素越突出，倾斜时产生强烈视差纵深感。

### 6.3 移动端降级
- `@media (pointer: coarse)`：禁用 mousemove tilt
- 选项 A（推荐）：改为 `touchmove` 拖动驱动 tilt，`touchend` 回正
- 选项 B：直接静态（光斑/流光动画保留，仅去掉倾斜）
- 最终选择在实现时验证 A 的手感，若不自然则退回 B

## 7. 例句渲染（E3 引用块）

- 例句标签（蓝色 pill）独占一行作为小节标题
- 每条例句用 `<blockquote>` 渲染：
  - 左侧 2px 蓝色边框（`border-left: 2px solid #3b82f6`），左缩进 12px
  - 英文：斜体，带引号包裹，正文色 `#e5e7eb`
  - **目标词高亮**：例句中出现的 `word.word`（大小写不敏感子串匹配）包裹 `<span class="hit">`，样式为蓝色 `#60a5fa` 加粗非斜体
  - 中文翻译：弱化 `#94a3b8`，小一号字号，`margin-top: 3px`
- 例句为空（`examples.length === 0`）整节隐藏

**目标词高亮实现**：按词边界正则 `new RegExp('\\b' + escapeRegExp(word.word) + '\\w*', 'gi')` 匹配（含派生形式如 `abandoned`）。`escapeRegExp` 工具函数放在 `fieldTheme.ts` 或 `lib/utils.ts`。

## 8. 同义词渲染
- 同义标签（粉色 pill）作为行首
- 同义词列表渲染为内联小药丸（`<span class="syn-tag">`）：`rgba(236,72,153,0.15)` 背景 + `0.35` 边框 + `#f9a8d4` 文字，`flex-wrap`
- 列表为空整行隐藏

## 9. 文件改动清单

### 新建
- `web/src/components/word-detail/ParallaxCard.tsx` — 3D 倾斜容器，封装 perspective + mousemove/touch hook，接受 children 与 maxTilt prop
- `web/src/components/word-detail/WordField.tsx` — 彩色标签行组件，props: `label`、`theme`（色系 key）、`children`、`z`（深度）
- `web/src/components/word-detail/ExampleQuote.tsx` — 引用块例句组件，props: `sentence`、`translation`、`highlight`（目标词）
- `web/src/components/word-detail/fieldTheme.ts` — 颜色系统常量：`FIELD_THEMES` 映射（label → {text, bg, border, glow}），`escapeRegExp()` 工具

### 重写
- `web/src/pages/WordDetail.tsx` — 用新组件装配，保留顶部 Badge / 返回按钮 / `statusLabel()` 逻辑，移除 Card3D 与 Tabs 导入

### 追加
- `web/src/index.css` — 追加 keyframes：`shimmer`、`border-flow`、`drift1`、`drift2`、`pulse-glow`、`fade-up`；追加 `.word-tilt-scene` / `.word-card-3d` 等工具类

### 不改动
- `web/src/components/shared/Card3D.tsx`（Review 页仍用，保留）
- `web/src/components/ui/tabs.tsx`（库组件，保留）
- 后端、API、`types.ts`、其它页面

## 10. 组件接口

### `ParallaxCard`
```tsx
interface ParallaxCardProps {
  children: React.ReactNode;
  maxTilt?: number;        // 默认 12
  className?: string;
}
```
内部维护 `rotateX/rotateY` state，mousemove 更新，mouseleave 归零。移动端检测 `window.matchMedia('(pointer: coarse)')` 决定是否启用触摸模式。

### `WordField`
```tsx
interface WordFieldProps {
  label: string;           // "释义" / "词根" 等
  theme: FieldThemeKey;    // "amber" | "emerald" | "violet" | "cyan" | "pink" | "blue"
  z?: number;              // translateZ px，默认 20
  children: React.ReactNode;
}
```
渲染：`<div class="word-field" style="transform: translateZ({z}px)">` + pill + 值容器。

### `ExampleQuote`
```tsx
interface ExampleQuoteProps {
  sentence: string;
  translation: string | null;
  highlight?: string;      // 目标词，用于子串高亮
}
```
渲染 `<blockquote>`，sentence 中 `highlight` 命中部分包 `<span class="hit">`。

### `fieldTheme.ts`
```ts
export type FieldThemeKey = "amber" | "emerald" | "violet" | "cyan" | "pink" | "blue";
export interface FieldTheme { text: string; bg: string; border: string; glow: string; }
export const FIELD_THEMES: Record<FieldThemeKey, FieldTheme>;
export function escapeRegExp(s: string): string;
```

## 11. 数据字段映射

| Word 字段 | 是否显示 | 渲染位置 |
|---|---|---|
| `word` | 总是 | 标题（流光） |
| `phonetic` | 非空 | 音标行 |
| `pos` | 非空 | 音标行尾（`· v.`） |
| `source` | 总是 | 顶部 Badge |
| `meaning_cn` | 非空 | 释义行（主） |
| `meaning_en` | 非空 | 释义行（弱化副） |
| `root` | 非空 | 词根行 |
| `association` | 非空 | 词根行尾追加（联想记忆） |
| `collocations` | 非空 | 搭配行 |
| `derivatives` | 非空 | 派生行 |
| `references` | 非空 | 参考行（复用紫色） |
| `examples[]` | 非空数组 | 引用块区 |
| `synonyms[]` | 非空数组 | 同义行（内联药丸） |
| `learning_status` | 总是 | 顶部 Badge |
| `stage` | — | 不显示（无 UI 需求） |

**词根与联想合并**：`root` 和 `association` 同属"词根/联想"语义，渲染在同一行（翠绿色）。`root` 在前，`association` 用分隔符 ` → ` 追加。

## 12. 性能与无障碍

- **性能**：3D 变换走 GPU 合成层（transform/opacity），不触发 layout/paint。mousemove 用 `requestAnimationFrame` 节流。光斑 blur(40px) 在低端设备可能耗 GPU，可通过 `prefers-reduced-data` 或运行时检测降级。
- **无障碍**：所有动画响应 `prefers-reduced-motion: reduce`（禁用 shimmer/drift/tilt，保留静态彩色标签）。倾斜纯装饰，不影响键盘导航。
- **响应式**：卡片 `max-width: 560px`，移动端全宽。移动端 tilt 降级见 §6.3。

## 13. YAGNI 边界（明确不做）

- 不改 Review / Quiz 页（它们保留 3D 翻转卡）
- 不动后端、API、`types.ts`
- 不做字段编辑、分享、TTS 发音、收藏
- 不做真 3D `Text3D`（react-three-fiber 几何体）—— CSS text-shadow 伪立体足够
- 不做陀螺仪（deviceorientation）——触摸拖动或静态降级即可

## 14. 验收标准

1. 进入任意单词详情页，所有非空字段一次性可见，无 Tab 切换
2. 每个字段行有对应颜色的标签（pill），颜色符合 §4 映射
3. 单词标题流光渐变持续动画；卡片边框彩虹流动；背景两光斑漂移
4. 鼠标在卡片上移动时，卡片 3D 倾斜，各字段产生视差纵深
5. 例句以蓝色边框引用块呈现，英文斜体，目标词蓝色加粗高亮
6. 字段为空时对应行不渲染
7. `prefers-reduced-motion` 下所有动画禁用，内容仍完整可读
8. 移动端（pointer: coarse）tilt 降级，光斑/流光动画保留
9. `bun run lint` 与 `bun run build` 通过
