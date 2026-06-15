# WordDetail 沉浸式 3D 视差卡片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `WordDetail` 页面从 3D 翻转卡 + Tabs 改造为一次性展现所有内容的沉浸式扁平卡片，带彩色字段标签、流光/辉光/漂移动效，以及鼠标驱动的 3D 视差倾斜 + 深度分层。

**Architecture:** 新建 `word-detail/` 组件目录，包含 4 个聚焦组件：`ParallaxCard`（3D 倾斜容器）、`WordField`（彩色标签行）、`ExampleQuote`（引用块例句）、`fieldTheme.ts`（颜色常量 + 高亮纯函数）。`WordDetail.tsx` 重写为装配层。所有动效用 CSS keyframes（`web/src/index.css`），不引入新依赖。验证方式遵循项目惯例：`bun run lint` + `bun run build` + 浏览器人工检查（项目无 JS 测试框架）。

**Tech Stack:** React 19, TypeScript 6, Tailwind v4, Vite 8, bun。无新依赖。

**Spec:** `docs/superpowers/specs/2026-06-15-word-detail-immersive-3d-card-design.md`

**Verification convention:** 本仓库前端无测试框架（`web/package.json` 仅 `lint`/`build`）。每个任务的验证 = eslint + tsc 编译。最终任务做完整 build + 浏览器人工验收（对照 spec §14）。所有 bash 命令在 `web/` 目录运行（用 `workdir`）。

**Key implementation note (3D flattening):** CSS `transform-style: preserve-3d` 会被 `overflow: hidden` 等属性破坏（子元素被拍平，`translateZ` 失效）。因此卡片本体 **不能** 用 `overflow: hidden` 裁剪光斑。解法：卡片 `.wd-card-3d` 保持 `preserve-3d` 且不设 overflow；另建 `.wd-card-bg` 子层（`overflow: hidden`，仅放光斑，光斑不需要 Z 深度）；`.wd-content` 子层设 `preserve-3d` 承载所有 `translateZ` 字段。任务 1 的 CSS 已按此结构编写。

---

## File Structure

| 文件 | 职责 | 创建/修改 |
|---|---|---|
| `web/src/index.css` | 追加 keyframes + `.wd-*` 工具类 + reduced-motion | 修改 |
| `web/src/components/word-detail/fieldTheme.ts` | 颜色常量 `FIELD_THEMES` + `escapeRegExp` + `highlightSegments` 纯函数 | 创建 |
| `web/src/components/word-detail/WordField.tsx` | 彩色标签行组件 | 创建 |
| `web/src/components/word-detail/ExampleQuote.tsx` | 引用块例句 + 目标词高亮 | 创建 |
| `web/src/components/word-detail/ParallaxCard.tsx` | 3D 倾斜容器（perspective + pointer 驱动） | 创建 |
| `web/src/pages/WordDetail.tsx` | 重写为装配层 | 修改 |

依赖顺序：`fieldTheme.ts` → `WordField` / `ExampleQuote`（依赖 fieldTheme）→ `ParallaxCard`（独立）→ `WordDetail`（装配）。

---

## Task 1: 追加 CSS keyframes 与工具类

**Files:**
- Modify: `web/src/index.css`（在文件末尾追加）

- [ ] **Step 1: 追加 keyframes 与工具类到 `web/src/index.css`**

在 `web/src/index.css` 末尾（现有 `@layer base { ... }` 块之后）追加以下内容。注意 `.wd-card-3d` **不设** `overflow: hidden`（避免破坏 preserve-3d），光斑由独立的 `.wd-card-bg` 层裁剪：

```css
/* ===== Word Detail immersive 3D card ===== */
@keyframes wd-shimmer {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes wd-border-flow {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes wd-drift1 {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(20px, -15px); }
}
@keyframes wd-drift2 {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-25px, 20px); }
}
@keyframes wd-pulse-glow {
  0%, 100% { box-shadow: 0 0 6px var(--gc, rgba(139,92,246,0.5)); }
  50% { box-shadow: 0 0 16px var(--gc, rgba(139,92,246,0.7)); }
}
@keyframes wd-fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.wd-scene {
  perspective: 1000px;
}
.wd-card-3d {
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.15s ease-out;
  background: linear-gradient(135deg, #0f0f23 0%, #15153a 100%);
  border-radius: 16px;
  padding: 28px 26px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  isolation: isolate;
}
.wd-card-3d::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 16px;
  padding: 1px;
  background: linear-gradient(135deg, rgba(139,92,246,0.6), rgba(59,130,246,0.3), rgba(236,72,153,0.4), rgba(139,92,246,0.6));
  background-size: 200% 200%;
  animation: wd-border-flow 6s linear infinite;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  z-index: 2;
}
.wd-card-bg {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.wd-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
}
.wd-glow-1 {
  width: 180px;
  height: 180px;
  background: rgba(139, 92, 246, 0.25);
  top: -30px;
  right: -20px;
  animation: wd-drift1 8s ease-in-out infinite;
}
.wd-glow-2 {
  width: 200px;
  height: 200px;
  background: rgba(16, 185, 129, 0.18);
  bottom: -40px;
  left: -30px;
  animation: wd-drift2 10s ease-in-out infinite;
}
.wd-content {
  position: relative;
  z-index: 1;
  transform-style: preserve-3d;
}
.wd-word {
  font-size: 42px;
  font-weight: 800;
  line-height: 1.05;
  margin: 0;
  background: linear-gradient(90deg, #ffffff, #c4b5fd, #60a5fa, #ffffff);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: wd-shimmer 4s linear infinite;
  text-shadow: 0 0 30px rgba(139, 92, 246, 0.4);
}
.wd-phonetic {
  color: #a78bfa;
  font-size: 13px;
  margin-top: 6px;
}
.wd-rainbow {
  height: 1px;
  margin: 18px 0;
  border: 0;
  background: linear-gradient(90deg, rgba(245,158,11,0.6), rgba(16,185,129,0.6), rgba(59,130,246,0.6), rgba(236,72,153,0.6), transparent);
}
.wd-field {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 10px 0;
  font-size: 14px;
  animation: wd-fade-up 0.5s ease both;
}
.wd-pill {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: 5px;
  min-width: 42px;
  text-align: center;
  margin-top: 1px;
  border: 1px solid;
  transition: box-shadow 0.2s ease;
}
.wd-pill:hover {
  animation: wd-pulse-glow 1.2s ease-in-out infinite;
}
.wd-val {
  color: #e5e7eb;
  line-height: 1.6;
  padding-top: 1px;
}
.wd-val-muted {
  color: #9ca3af;
  font-size: 13px;
  margin-top: 2px;
}
.wd-synwrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.wd-syntag {
  background: rgba(236, 72, 153, 0.15);
  border: 1px solid rgba(236, 72, 153, 0.35);
  color: #f9a8d4;
  font-size: 12px;
  padding: 2px 9px;
  border-radius: 4px;
}
.wd-ex-label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 8px;
}
.wd-quote {
  margin: 0 0 10px 12px;
  padding: 2px 0 2px 12px;
  border-left: 2px solid #3b82f6;
  animation: wd-fade-up 0.5s ease both;
}
.wd-quote-en {
  color: #e5e7eb;
  font-style: italic;
  font-size: 14px;
  margin: 0;
}
.wd-hit {
  color: #60a5fa;
  font-weight: 700;
  font-style: normal;
}
.wd-quote-cn {
  color: #94a3b8;
  font-size: 12px;
  margin: 3px 0 0;
}

@media (prefers-reduced-motion: reduce) {
  .wd-card-3d,
  .wd-card-3d::before,
  .wd-word,
  .wd-glow-1,
  .wd-glow-2,
  .wd-field,
  .wd-quote,
  .wd-pill {
    animation: none !important;
  }
  .wd-card-3d {
    transition: none !important;
  }
}
```

- [ ] **Step 2: 验证 CSS 不破坏构建**

Run (workdir `web`): `bun run build`
Expected: 构建成功（CSS 追加不影响编译）。若失败，检查语法（缺少分号/括号）。

- [ ] **Step 3: 提交**

```bash
git add web/src/index.css
git commit -m "feat(word-detail): add immersive 3D card keyframes and utilities"
```

---

## Task 2: 创建 fieldTheme.ts（颜色常量 + 高亮纯函数）

**Files:**
- Create: `web/src/components/word-detail/fieldTheme.ts`

- [ ] **Step 1: 创建目录与文件**

确认目录不存在，创建文件 `web/src/components/word-detail/fieldTheme.ts`，内容：

```ts
export type FieldThemeKey = "amber" | "emerald" | "violet" | "cyan" | "pink" | "blue";

export interface FieldTheme {
  text: string;
  bg: string;
  border: string;
  glow: string;
}

export const FIELD_THEMES: Record<FieldThemeKey, FieldTheme> = {
  amber: { text: "#fbbf24", bg: "rgba(245,158,11,0.20)", border: "rgba(245,158,11,0.45)", glow: "rgba(245,158,11,0.55)" },
  emerald: { text: "#34d399", bg: "rgba(16,185,129,0.20)", border: "rgba(16,185,129,0.45)", glow: "rgba(16,185,129,0.55)" },
  violet: { text: "#c4b5fd", bg: "rgba(139,92,246,0.20)", border: "rgba(139,92,246,0.45)", glow: "rgba(139,92,246,0.55)" },
  cyan: { text: "#67e8f9", bg: "rgba(6,182,212,0.20)", border: "rgba(6,182,212,0.45)", glow: "rgba(6,182,212,0.55)" },
  pink: { text: "#f9a8d4", bg: "rgba(236,72,153,0.20)", border: "rgba(236,72,153,0.45)", glow: "rgba(236,72,153,0.55)" },
  blue: { text: "#60a5fa", bg: "rgba(59,130,246,0.20)", border: "rgba(59,130,246,0.45)", glow: "rgba(59,130,246,0.55)" },
};

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface Segment {
  text: string;
  hit: boolean;
}

export function highlightSegments(text: string, word: string | null): Segment[] {
  if (!word || !word.trim()) return [{ text, hit: false }];
  const re = new RegExp(`\\b${escapeRegExp(word)}\\w*`, "gi");
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}
```

**说明：**
- `highlightSegments` 按 `\bword\w*` 匹配（含派生形式如 `abandoned`），返回 `{text, hit}[]` 片段数组。
- 零长度匹配保护（`m.index === re.lastIndex` 时自增）防止死循环。
- `word` 为空或 null 时返回单个未命中片段。

- [ ] **Step 2: 验证编译**

Run (workdir `web`): `bun run build`
Expected: 成功（文件未被引用，但 tsc 会类型检查所有文件）。

- [ ] **Step 3: 提交**

```bash
git add web/src/components/word-detail/fieldTheme.ts
git commit -m "feat(word-detail): add field color themes and text highlight helpers"
```

---

## Task 3: 创建 WordField 组件

**Files:**
- Create: `web/src/components/word-detail/WordField.tsx`

- [ ] **Step 1: 创建文件**

`web/src/components/word-detail/WordField.tsx`：

```tsx
import type { CSSProperties, ReactNode } from "react";
import { FIELD_THEMES, type FieldThemeKey } from "./fieldTheme";

interface WordFieldProps {
  label: string;
  theme: FieldThemeKey;
  z?: number;
  index?: number;
  children: ReactNode;
}

export default function WordField({
  label,
  theme,
  z = 20,
  index = 0,
  children,
}: WordFieldProps) {
  const c = FIELD_THEMES[theme];
  const fieldStyle: CSSProperties = {
    transform: `translateZ(${z}px)`,
    animationDelay: `${index * 0.05}s`,
    ["--gc" as keyof CSSProperties]: c.glow,
  };
  const pillStyle: CSSProperties = {
    color: c.text,
    background: c.bg,
    borderColor: c.border,
  };
  return (
    <div className="wd-field" style={fieldStyle}>
      <span className="wd-pill" style={pillStyle}>
        {label}
      </span>
      <div className="wd-val">{children}</div>
    </div>
  );
}
```

**说明：**
- `z` 控制 `translateZ` 深度（视差分层）。
- `index` 控制 stagger 入场延迟（每行 +50ms）。
- `--gc` CSS 变量传给 `.wd-pill:hover` 的 `pulse-glow` 动画，实现各色辉光。

- [ ] **Step 2: 验证编译**

Run (workdir `web`): `bun run build`
Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add web/src/components/word-detail/WordField.tsx
git commit -m "feat(word-detail): add WordField colored-pill row component"
```

---

## Task 4: 创建 ExampleQuote 组件

**Files:**
- Create: `web/src/components/word-detail/ExampleQuote.tsx`

- [ ] **Step 1: 创建文件**

`web/src/components/word-detail/ExampleQuote.tsx`：

```tsx
import { highlightSegments } from "./fieldTheme";

interface ExampleQuoteProps {
  sentence: string;
  translation: string | null;
  highlight?: string | null;
}

export default function ExampleQuote({
  sentence,
  translation,
  highlight,
}: ExampleQuoteProps) {
  const segments = highlightSegments(sentence, highlight ?? null);
  return (
    <blockquote className="wd-quote">
      <p className="wd-quote-en">
        &ldquo;
        {segments.map((seg, i) =>
          seg.hit ? (
            <span key={i} className="wd-hit">
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
        &rdquo;
      </p>
      {translation && <p className="wd-quote-cn">{translation}</p>}
    </blockquote>
  );
}
```

**说明：**
- 英文用 `&ldquo;` / `&rdquo;` 包裹（中文引号在英文句里不美观）。
- 命中片段 `<span class="wd-hit">`：CSS 覆盖为非斜体、蓝色加粗（`.wd-quote-en` 是斜体）。
- `translation` 为 null 时不渲染中文行。

- [ ] **Step 2: 验证编译**

Run (workdir `web`): `bun run build`
Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add web/src/components/word-detail/ExampleQuote.tsx
git commit -m "feat(word-detail): add ExampleQuote blockquote with word highlight"
```

---

## Task 5: 创建 ParallaxCard 组件

**Files:**
- Create: `web/src/components/word-detail/ParallaxCard.tsx`

- [ ] **Step 1: 创建文件**

`web/src/components/word-detail/ParallaxCard.tsx`：

```tsx
import { useRef, useState, type CSSProperties, type ReactNode } from "react";

interface ParallaxCardProps {
  children: ReactNode;
  maxTilt?: number;
  className?: string;
}

export default function ParallaxCard({
  children,
  maxTilt = 12,
  className = "",
}: ParallaxCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [transform, setTransform] = useState<string>(
    "rotateY(0deg) rotateX(0deg)"
  );

  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (coarse) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setTransform(
        `rotateY(${px * maxTilt * 2}deg) rotateX(${-py * maxTilt * 2}deg)`
      );
    });
  };

  const handleLeave = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setTransform("rotateY(0deg) rotateX(0deg)");
  };

  const cardStyle: CSSProperties = { transform };

  return (
    <div
      className={`wd-scene ${className}`.trim()}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <div className="wd-card-3d" ref={cardRef} style={cardStyle}>
        {children}
      </div>
    </div>
  );
}
```

**说明：**
- 父 `.wd-scene`（perspective）监听 `pointermove/pointerleave`，驱动内层 `.wd-card-3d` 的 `rotateY/rotateX`。
- `requestAnimationFrame` 节流，避免 pointermove 高频触发 setState。
- `pointer: coarse`（触摸设备）直接 return，禁用 tilt（spec §6.3 移动端降级；光斑/流光 CSS 动画仍保留）。
- `maxTilt * 2` 因为 px 范围是 -0.5~0.5，乘 2 后达到 ±maxTilt。

- [ ] **Step 2: 验证编译**

Run (workdir `web`): `bun run build`
Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add web/src/components/word-detail/ParallaxCard.tsx
git commit -m "feat(word-detail): add ParallaxCard 3D tilt container"
```

---

## Task 6: 重写 WordDetail.tsx 装配层

**Files:**
- Modify: `web/src/pages/WordDetail.tsx`（整体重写）

- [ ] **Step 1: 重写文件**

将 `web/src/pages/WordDetail.tsx` 整体替换为：

```tsx
import type { CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useWord } from "@/hooks/useWords";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import ParallaxCard from "@/components/word-detail/ParallaxCard";
import WordField from "@/components/word-detail/WordField";
import ExampleQuote from "@/components/word-detail/ExampleQuote";
import { FIELD_THEMES } from "@/components/word-detail/fieldTheme";

const z = (px: number): CSSProperties => ({ transform: `translateZ(${px}px)` });

export default function WordDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data, isLoading } = useWord(Number(id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading...
      </div>
    );
  }

  if (!data) {
    return <div className="py-20 text-center text-gray-400">Word not found</div>;
  }

  const { word, examples, synonyms, learning_status } = data;

  const statusLabel = () => {
    if (!learning_status)
      return { text: t.wordDetail.statusNew, cls: "bg-gray-500/20 text-gray-400" };
    switch (learning_status.status) {
      case "mastered":
        return { text: t.wordDetail.statusMastered, cls: "bg-emerald-500/20 text-emerald-300" };
      case "review":
        return { text: t.wordDetail.statusReview, cls: "bg-blue-500/20 text-blue-300" };
      default:
        return { text: t.wordDetail.statusLearning, cls: "bg-amber-500/20 text-amber-300" };
    }
  };
  const sl = statusLabel();

  let fieldIndex = 0;
  const nextIndex = () => fieldIndex++;

  const rootText = [word.root, word.association].filter(Boolean).join(" → ");
  const phoneticLine = [word.phonetic, word.pos].filter(Boolean).join(" · ");
  const blue = FIELD_THEMES.blue;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        onClick={() => navigate("/words")}
        className="gap-2 text-gray-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.wordDetail.back}
      </Button>

      <div className="flex items-center gap-3">
        <Badge className={sl.cls}>{sl.text}</Badge>
        {word.source && (
          <Badge variant="outline" className="border-white/20 text-gray-400">
            {word.source}
          </Badge>
        )}
      </div>

      <div className="max-w-lg">
        <ParallaxCard>
          <div className="wd-card-bg">
            <div className="wd-glow wd-glow-1" />
            <div className="wd-glow wd-glow-2" />
          </div>
          <div className="wd-content">
            <h1 className="wd-word" style={z(55)}>
              {word.word}
            </h1>

            {phoneticLine && (
              <div className="wd-phonetic" style={z(35)}>
                {phoneticLine}
              </div>
            )}

            <hr className="wd-rainbow" style={z(20)} />

            {(word.meaning_cn || word.meaning_en) && (
              <WordField label={t.wordDetail.meaning} theme="amber" z={30} index={nextIndex()}>
                {word.meaning_cn && <div>{word.meaning_cn}</div>}
                {word.meaning_en && <div className="wd-val-muted">{word.meaning_en}</div>}
              </WordField>
            )}

            {rootText && (
              <WordField label={t.wordDetail.root} theme="emerald" z={25} index={nextIndex()}>
                {rootText}
              </WordField>
            )}

            {word.collocations && (
              <WordField label={t.wordDetail.collocations} theme="violet" z={25} index={nextIndex()}>
                {word.collocations}
              </WordField>
            )}

            {word.derivatives && (
              <WordField label={t.wordDetail.derivatives} theme="cyan" z={20} index={nextIndex()}>
                {word.derivatives}
              </WordField>
            )}

            {word.references && (
              <WordField label={t.wordDetail.references} theme="violet" z={20} index={nextIndex()}>
                {word.references}
              </WordField>
            )}

            {synonyms.length > 0 && (
              <WordField label={t.wordDetail.synonyms} theme="pink" z={20} index={nextIndex()}>
                <div className="wd-synwrap">
                  {synonyms.map((s) => (
                    <span key={s.id} className="wd-syntag">
                      {s.synonym}
                    </span>
                  ))}
                </div>
              </WordField>
            )}

            {examples.length > 0 && (
              <div className="wd-ex-label" style={z(15)}>
                <span
                  className="wd-pill"
                  style={{ color: blue.text, background: blue.bg, borderColor: blue.border }}
                >
                  {t.wordDetail.examples}
                </span>
              </div>
            )}
            {examples.map((ex) => (
              <div key={ex.id} style={z(15)}>
                <ExampleQuote
                  sentence={ex.sentence}
                  translation={ex.translation}
                  highlight={word.word}
                />
              </div>
            ))}
          </div>
        </ParallaxCard>
      </div>
    </div>
  );
}
```

**说明：**
- 顶部返回按钮 / Badge / `statusLabel()` 逻辑保留自原文件。
- 移除对 `Card3D`、`Tabs`、`TabsContent`、`TabsList`、`TabsTrigger`、`ScrollArea` 的导入（这些组件文件本身保留，Review 页仍在用）。
- 字段渲染顺序按 spec §11：word → phonetic → rainbow → 释义 → 词根(+联想) → 搭配 → 派生 → 参考 → 同义 → 例句。
- 所有字段 `{condition && <WordField .../>}` 守卫，空字段不渲染。
- `nextIndex()` 闭包计数器，每次渲染从 0 重置，给每行递增 stagger 延迟。
- 例句小节标题用内联蓝色 pill（与 WordField 结构不同，故不复用）。
- 每条例句包在 `style={z(15)}` 的 div 里，保持例句区 Z 深度统一。

- [ ] **Step 2: 验证 lint**

Run (workdir `web`): `bun run lint`
Expected: 无 error。若有 `unused import` 报错，删除对应未用导入。

- [ ] **Step 3: 验证完整构建**

Run (workdir `web`): `bun run build`
Expected: `tsc -b && vite build` 成功，产物输出到 `web/dist/`。

- [ ] **Step 4: 提交**

```bash
git add web/src/pages/WordDetail.tsx
git commit -m "feat(word-detail): rewrite page as immersive 3D parallax card"
```

---

## Task 7: 浏览器人工验收（对照 spec §14）

**Files:** 无修改

- [ ] **Step 1: 启动 dev 环境**

两个终端：
- 终端 1 (workdir 仓库根): `cargo run`
- 终端 2 (workdir `web`): `bun run dev`

打开 http://localhost:5173 → 单词本 → 点进任意单词（如 `abandon`）。

- [ ] **Step 2: 逐项核对 spec §14 验收标准**

人工检查清单（全部应为是）：
1. [ ] 所有非空字段一次性可见，无 Tab 切换
2. [ ] 各字段行有对应颜色标签：释义=琥珀、词根=绿、搭配=紫、派生=青、同义=粉、例句=蓝
3. [ ] 单词标题流光渐变持续动画；卡片边框彩虹流动；背景紫/绿两光斑漂移
4. [ ] 鼠标在卡片上移动时，卡片 3D 倾斜；单词（最突出）与下方字段产生视差纵深
5. [ ] 例句以蓝色左边框引用块呈现；英文斜体带引号；目标词（及派生形式）蓝色加粗高亮
6. [ ] 字段为空的单词（找一个只有 word+meaning_cn 的）对应行不渲染
7. [ ] 系统设置开启"减少动态效果"后，所有动画停止，内容仍完整可读
8. [ ] 触摸设备 / DevTools 切到移动端视图：tilt 禁用，光斑/流光动画保留
9. [ ] 长例句/多例句（3 条以上）排版不乱，引用块层次清晰

- [ ] **Step 3: 检查相关页面未受影响**

导航到「每日复习」「单词测验」确认 3D 翻转卡 / Tabs 仍正常（未受本次改动影响）。

- [ ] **Step 4: 若发现问题**

回到对应 Task 修复后重新执行该 Task 的验证步骤。常见问题：
- translateZ 无纵深效果 → 检查 `.wd-card-3d` 和 `.wd-content` 是否都设了 `transform-style: preserve-3d`；检查是否有 `overflow: hidden` 拍平了 3D 层（光斑层 `.wd-card-bg` 可以 overflow，但 `.wd-content` 链路上不能有）。
- 高亮不生效 → 确认 `word.word` 非空，浏览器控制台无正则错误。
- 移动端仍倾斜 → 确认 `coarse` 检测生效（DevTools 设备模拟下 `pointer: coarse` 为 true）。

---

## Self-Review Notes

**Spec coverage:**
- §3 页面结构 → Task 6
- §4 颜色编码 → Task 2 (FIELD_THEMES) + Task 3 (WordField) + Task 6 (装配)
- §5 沉浸式视觉 → Task 1 (CSS keyframes) + Task 6 (translateZ 层)
- §6 3D 视差 → Task 5 (ParallaxCard) + Task 1 (preserve-3d CSS) + Task 6 (translateZ 分层)
- §7 例句引用块 + 高亮 → Task 4 (ExampleQuote) + Task 2 (highlightSegments)
- §8 同义词渲染 → Task 6
- §9 文件改动清单 → 全部 Task 覆盖
- §10 组件接口 → Task 2/3/4/5 签名一致
- §11 字段映射 → Task 6
- §12 性能与无障碍 → Task 1 (reduced-motion) + Task 5 (rAF 节流 + coarse 降级)
- §13 YAGNI 边界 → 未引入 Text3D / 未改其它页面
- §14 验收 → Task 7

**Type consistency check:**
- `FieldThemeKey` 在 Task 2 定义，Task 3 引用 ✓
- `FIELD_THEMES` Task 2 导出，Task 3/Task 6 引用 ✓
- `highlightSegments` / `Segment` Task 2 定义，Task 4 引用 ✓
- `WordField` props (`label/theme/z/index/children`) Task 3 定义，Task 6 调用全部匹配 ✓
- `ExampleQuote` props (`sentence/translation/highlight`) Task 4 定义，Task 6 调用匹配 ✓
- `ParallaxCard` props (`children/maxTilt/className`) Task 5 定义，Task 6 调用匹配 ✓

**Placeholder scan:** 无 TBD/TODO/"implement later"。每步含完整代码。
