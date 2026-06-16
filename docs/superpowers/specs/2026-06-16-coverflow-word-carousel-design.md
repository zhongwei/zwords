# WordDetail 3D Cover Flow 单词轮播 — 设计文档

**日期**: 2026-06-16
**范围**: `web/src/pages/WordsList.tsx`（URL 同步重构）、`web/src/pages/WordDetail.tsx`（接入轮播）、新增 `web/src/components/word-detail/WordCoverFlow.tsx` 及配套样式
**状态**: 已确认，待实现计划

## 1. 背景与目标

当前 `WordDetail.tsx`（247 行）只显示一个单词的视差卡片，**没有任何词间导航**：没有上一个/下一个，用户必须返回列表才能看下一个词。同时详情页**完全不知道**自己是从哪个列表上下文（第几页 / 什么筛选）点进来的——`WordsList` 的 `page/q/source/status` 存在本地 `useState`，未写入 URL，点击单词跳转时也没携带。

**目标**：在详情页以 **iTunes Cover Flow 风格的 3D 立体卡片流**展示当前列表页的全部 100 个单词——中间一张正面朝向的完整详情卡（沿用现有视差卡设计），两侧卡片像立起的"书本"侧向旋转、向后退去；用户可通过多种方式翻阅这 100 张卡。

## 2. 设计决策（已通过可视化对比 + 逐项确认）

| 维度 | 选择 | 理由 |
|---|---|---|
| 轮播形态 | **3D Cover Flow**（iTunes 风格） | 中间完整详情 + 两侧立体书皮，视觉炫酷且贴合用户预期 |
| 倒影 | **中间卡底部加镜面反射** | 更接近 iTunes 原版观感 |
| 上下文通道 | **URL query 参数** | 可分享/收藏、刷新不丢、浏览器后退正常 |
| 无上下文降级 | **优雅降级为单卡** | 直接打开 `/words/:id`（无参数）时不出现轮播，最不打扰 |
| 翻到边界 | **到边界停止**（不跨页） | 符合"当前页 100 词"语义，最简单 |
| 翻页交互 | **‹ › 按钮 + 键盘 ← → + 触摸滑动 + 鼠标滚轮 + 点侧面卡** | 多种输入都可达，体验顺滑 |

## 3. 数据流与上下文通道

**问题**：详情页需知道"当前页是哪 100 个词"才能渲染轮播。

**方案**：把列表筛选状态搬进 URL，跳转时携带，详情页用相同参数重新拉取本页 100 词。

```
WordsList                          URL                              WordDetail
─────────                          ───                              ──────────
page/q/source/status  ──sync──►  /words?page=1&source=gre&q=...
                                   │
点击 word#42  ──carry params──►  /words/42?page=1&source=gre&q=...
                                                                   │
                                          useSearchParams 读参数 ──┘
                                                   │
                                          useWords(同参数) ──► 100 词数组
                                                   │
                                          定位 id=42 的索引 ──► Cover Flow 模式
```

**关键点**：
- 详情页构造的 `useWords` 参数对象形状必须和列表页**完全一致**（`{page, per_page:100, q, source, status}`），以命中 react-query 已缓存的 `["words", params]`（`staleTime: 30s`），实现秒开。
- 当前词始终由 URL 的 `:id` 决定；翻页 = `navigate(`/words/${相邻id}?${params}`)`，浏览器历史与后退自然工作，`useWord(id)` 按 id 缓存。

## 4. WordsList 重构（URL 同步）

把 `page/q/source/status` 从 `useState` 改为从 `useSearchParams` 派生：

- 读取：`page = Number(sp.get("page") ?? 1)`、`q = sp.get("q") ?? ""`、`source = sp.get("source") ?? ""`、`status = sp.get("status") ?? ""`。
- 写入：所有改参数的动作（搜索 Enter、切 source/status、翻页）改为 `setSearchParams({...})`，并保证改筛选条件时重置 `page=1`。
- `searchInput`（输入框即时值）保留为本地 `useState`，仅在 Enter 时写进 URL，避免每键触发请求。
- 点击单词按钮改为携带当前参数：`navigate(`/words/${word.id}?${sp.toString()}`)`。
- 其余 UI（网格、分页按钮）不变。

## 5. WordDetail 改造

新增两种模式，由"是否有有效的列表参数"决定：

- **Cover Flow 模式**（有参数 且 当前 id ∈ 本页 100 词）：渲染 `<WordCoverFlow>`。
- **单卡模式**（无参数，或 id 不在 100 词中）：渲染现有的单张视差卡（等价于当前详情页），无轮播、无箭头。

详情页顶部 `← 返回列表` 按钮的跳转目标也改为携带参数：`navigate(`/words?${params}`)`，保证返回时保留页码/筛选。

**保留现有页头**：Cover Flow 模式下，详情页现有的页头（`← 返回列表` 按钮 + 状态/source Badge 行）继续渲染在舞台**上方**，描述当前词；只是把页头下面原本的单卡区域替换为 `<WordCoverFlow>`。

## 6. WordCoverFlow 组件设计

**位置**：`web/src/components/word-detail/WordCoverFlow.tsx`

**职责**：作为详情页的舞台容器，渲染 3D 卡片流并把当前 id 的完整详情卡放在中央。

**Props**：
```ts
interface WordCoverFlowProps {
  words: Word[];          // 本页 100 词（轻量列表项，来自 useWords）
  currentId: number;      // 当前词 id（来自 URL :id）
  page: number;           // 当前页码（用于位置指示）
  onNavigate: (id: number) => void;  // 翻页回调 → navigate
}
```

### 6.1 舞台与卡片定位

- 舞台容器：`position: relative; perspective: 1100px; perspective-origin: 50% 45%`。
- 每张卡 `position: absolute`、居中，按其与当前词的偏移量 `d = index - currentIndex` 定位：

| \|d\| | translateX | translateZ | rotateY | opacity |
|---|---|---|---|---|
| 0（当前） | 0 | 0 | 0 | 1（全尺寸，z-index 高） |
| 1 | ±130px | -140px | ±50° | ~0.6 |
| 2 | ±230px | -280px | ±58° | ~0.35 |
| 3 | ±320px | -420px | ±62° | ~0.18 |
| >3 | 不渲染 | — | — | — |

- 卡片切换由偏移量驱动：`currentIndex` 变化时各卡的 `d` 重新计算，用 framer-motion `motion.div` 的 `animate` 到目标 transform 完成流转；\|d\|>3 的卡卸载（淡出），新进入 \|d\|=3 的卡淡入。

### 6.2 三种卡槽

- **中间卡（d=0）**：复用现有详情卡全部内容（`ParallaxCard` + 流光渐变标题 + 音标/音频按钮 + 释义 + `WordField` 各字段 + `ExampleQuote`），数据来自 `useWord(currentId)`。保留现有 3D 鼠标倾斜视差。
- **侧面卡（\|d\|≥1）**：轻量"书皮"，仅显示单词拼写 + 音标（数据直接来自 `words` 数组，无需额外请求）。点击触发 `onNavigate(该词 id)`。
- **倒影**：仅中间卡底部加镜面反射——一个翻转副本（`transform: scaleY(-1)`）+ 渐变遮罩（`mask-image: linear-gradient(to bottom, rgba(0,0,0,.35), transparent 55%)`）。

### 6.3 翻页交互

| 输入 | 行为 |
|---|---|
| ‹ › 圆形按钮 | 跳到相邻 id；首词 ‹ 禁用、末词 › 禁用 |
| 键盘 ← → | 同上（window 级监听，组件卸载时移除） |
| 触摸滑动 | `touchstart`/`touchend`，水平位移超阈值 → 翻页 |
| 鼠标滚轮 | `wheel` 事件：`deltaY>0` → 下一张，`<0` → 上一张；**节流**：累计 delta 超阈值才触发 + ~450ms 冷却，避免一次滚动跳过多张 |
| 点侧面卡 | 该卡滑到中央（= `onNavigate(其 id)`） |

### 6.4 位置指示

舞台上方右侧徽标：`第 {page} 页 · {currentIndex+1} / 100`。
舞台下方：圆形 ‹ › 按钮 + 一条滑动进度条（宽度 = `(currentIndex+1)/100`，渐变填充），表示在 100 词中的位置。100 词不逐个画圆点。

## 7. 性能

- 列表 100 词：一次请求（且命中列表页缓存）。
- 详情：按 id 经 `useWord` 缓存，翻回已访问的词秒开。
- DOM：只渲染 \|d\| ≤ 3 的窗口（最多 7 张卡），更远的卡不挂载。
- 动画用 transform/opacity（GPU 友好），不触发 layout。

## 8. 边界与异常

- **无列表参数**（直接打开 `/words/42`、刷新后参数丢失、从复习/测验页跳来）→ 单卡模式，无轮播。
- **参数里的 id 不在本页 100 词中**（链接过期、词被筛掉等）→ 单卡模式。
- **首词/末词** → 对应方向按钮禁用，不跨页。
- **本页正在加载**（`useWords` pending）→ 详情区显示 skeleton，不阻塞顶部返回按钮。
- **本页为空**（筛选无结果却带着参数进来）→ 单卡模式。

## 9. 文件清单

| 文件 | 改动 |
|---|---|
| `web/src/pages/WordsList.tsx` | `useState` → URL 同步；点击单词携带参数 |
| `web/src/pages/WordDetail.tsx` | 读 `useSearchParams` → 决定 Cover Flow / 单卡模式；返回按钮携带参数 |
| `web/src/components/word-detail/WordCoverFlow.tsx` | **新增**：3D 舞台 + 卡片定位 + 翻页交互 + 倒影 |
| `web/src/index.css` | 新增轮播相关 `wd-cf-*` 样式类（舞台、侧面卡、倒影遮罩） |
| `web/src/lib/i18n.tsx` | 补充位置指示/禁用态等少量文案 key |

## 10. 不在范围内（YAGNI）

- 跨页连续翻阅（自动拉下一页 100 词）。
- 轮播内搜索/跳页（由列表页承担）。
- 循环轮播（末词跳回首词）。
- 侧面卡显示更多字段（只显示拼写 + 音标）。
- 修改后端 API（完全复用现有 `/api/words` 与 `/api/words/:id`）。
