# 3D Cover Flow 单词轮播 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在详情页以 iTunes Cover Flow 风格的 3D 立体卡片流展示当前列表页的全部 100 个单词，中间一张完整详情卡，两侧卡片像立起的"书本"侧旋后退，支持按钮/键盘/触摸/滚轮/点击多种翻页。

**Architecture:** 列表页 `WordsList` 把 `page/q/source/status` 同步进 URL；点击单词携带参数跳转；详情页 `WordDetail` 读 URL 参数决定模式——有上下文且 id 在本页 100 词中时渲染新组件 `WordCoverFlow`（3D 舞台，中央复用提取出的 `WordDetailCard`，侧面轻量书皮），否则降级为单卡。翻页 = 改 URL `:id`（react-query 按 id 缓存，浏览器历史/后退正常）。

**Tech Stack:** React 19 + TypeScript 6 + react-router-dom v7（`useSearchParams`）+ @tanstack/react-query v5 + framer-motion v12（3D 卡片流转）+ Tailwind v4 + 现有 `wd-*` CSS 体系。

**Spec:** `docs/superpowers/specs/2026-06-16-coverflow-word-carousel-design.md`

---

## 验证方式说明（重要）

本前端**无测试框架**（`web/package.json` 无 vitest/jest，无 `test` 脚本）。按 AGENTS.md 约定，每个任务的验证用：

- 类型检查 + 构建：`bun run build`（在 `web/` 目录下；等价 `tsc -b && vite build`）
- Lint：`bun run lint`（eslint）
- 关键任务另做**浏览器手动核验**：终端 A 跑 `cargo run`（后端 :8000），终端 B 跑 `bun run dev`（前端 :5173），访问 http://localhost:5173

不引入测试框架——为单一 UI 特性加 vitest 属 YAGNI。

## 文件结构

| 文件 | 责任 | 改动 |
|---|---|---|
| `web/src/pages/WordsList.tsx` | 列表页：分页/搜索/筛选 | 改：状态同步进 URL，点击携带参数 |
| `web/src/hooks/useWords.ts` | react-query hooks | 改：`useWords` 增加 `enabled` 守卫 |
| `web/src/components/word-detail/WordDetailCard.tsx` | 单词详情卡主体（视差卡 + 音频播放 + 全字段） | **新增**：从 `WordDetail.tsx` 抽出 |
| `web/src/pages/WordDetail.tsx` | 详情页：模式判定 + 页头 + 装配 | 改：读 URL 决定 Cover Flow / 单卡 |
| `web/src/components/word-detail/WordCoverFlow.tsx` | 3D 舞台 + 卡片定位 + 翻页交互 + 倒影 + 指示器 | **新增** |
| `web/src/index.css` | 全局样式 | 改：新增 `wd-cf-*` 轮播样式 |
| `web/src/locales/zh.ts`、`en.ts` | 文案 | 改：新增 `coverFlow` 文案组 |

---

## Task 1: WordsList 状态同步进 URL + 点击携带参数

**Files:**
- Modify: `web/src/pages/WordsList.tsx`

- [ ] **Step 1: 把 `WordsList.tsx` 整体改为 URL 派生状态**

把 `useState` 的 `page/q/source/status` 全部改为从 `useSearchParams` 读取；改动筛选条件时重置 `page=1`；点击单词时把当前完整参数拼进 URL。`searchInput`（输入框即时值）保留本地 state，Enter 时写入 URL。

将 `web/src/pages/WordsList.tsx` 替换为：

```tsx
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useWords } from "@/hooks/useWords";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export default function WordsList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? 1) || 1;
  const q = searchParams.get("q") ?? "";
  const source = searchParams.get("source") ?? "";
  const status = searchParams.get("status") ?? "";
  const [searchInput, setSearchInput] = useState(q);

  const update = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (!sp.has("page")) sp.set("page", "1");
    setSearchParams(sp, { replace: false });
  };

  const { data, isLoading } = useWords({
    page,
    per_page: 100,
    q: q || undefined,
    source: source || undefined,
    status: status || undefined,
  });

  const totalPages = data ? Math.ceil(data.meta.total / data.meta.per_page) : 1;

  const goDetail = (id: number) => {
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    if (q) sp.set("q", q);
    if (source) sp.set("source", source);
    if (status) sp.set("status", status);
    navigate(`/words/${id}?${sp.toString()}`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">{t.nav.words}</h1>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={t.words.search}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                update({ q: searchInput || undefined, page: undefined });
              }
            }}
            className="border-white/10 bg-white/5 pl-10 text-white placeholder:text-gray-500"
          />
        </div>
        <Select value={source || "all"} onValueChange={(v) => update({ source: v === "all" ? undefined : v, page: undefined })}>
          <SelectTrigger className="w-32 border-white/10 bg-white/5 text-white">
            <SelectValue placeholder={t.words.source} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.words.all}</SelectItem>
            <SelectItem value="GRE">GRE</SelectItem>
            <SelectItem value="TOEFL">TOEFL</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status || "all"} onValueChange={(v) => update({ status: v === "all" ? undefined : v, page: undefined })}>
          <SelectTrigger className="w-32 border-white/10 bg-white/5 text-white">
            <SelectValue placeholder={t.words.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.words.all}</SelectItem>
            <SelectItem value="learning">{t.wordDetail.statusLearning}</SelectItem>
            <SelectItem value="review">{t.wordDetail.statusReview}</SelectItem>
            <SelectItem value="mastered">{t.wordDetail.statusMastered}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>
      ) : !data?.data.length ? (
        <div className="py-20 text-center text-gray-400">{t.words.noResults}</div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-3">
            {data.data.map((word) => (
              <button
                key={word.id}
                onClick={() => goDetail(word.id)}
                className="group rounded-xl border border-white/10 bg-white/5 p-3 text-left backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:border-violet-500/30 hover:bg-white/10"
              >
                <div className="flex items-start justify-between">
                  <span className="text-lg font-semibold text-white">{word.word}</span>
                  {word.source && (
                    <Badge
                      variant="outline"
                      title={word.source}
                      className="text-xs border-white/20 text-gray-400"
                    >
                      {word.source.toLowerCase() === "toefl" ? "T" : "G"}
                    </Badge>
                  )}
                </div>
                {word.phonetic && (
                  <p className="mt-1 text-sm text-violet-300">{word.phonetic}</p>
                )}
                <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                  {word.meaning_cn || word.meaning_en || "—"}
                </p>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => update({ page: String(page - 1) })}
              className="border-white/10 text-white hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-400">
              {t.words.page.replace("{page}", String(page)).replace("{total}", String(totalPages))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => update({ page: String(page + 1) })}
              className="border-white/10 text-white hover:bg-white/10"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint + 构建验证**

Run（在 `web/` 目录）:
```
bun run lint
bun run build
```
Expected: 两者均无错误。

- [ ] **Step 3: 浏览器手动核验**

启动 `cargo run` 与 `bun run dev`，访问 `http://localhost:5173/words`：
- 切换 source/status、搜索、翻页时，浏览器地址栏 URL 应实时包含 `?page=..&source=..&q=..`。
- 刷新页面，筛选/页码状态应保留。
- 点击任一单词，地址栏应变为 `/words/{id}?page=..&...`（详情页此时仍是旧的单卡，正常）。

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/WordsList.tsx
git commit -m "feat(words-list): sync page/filter state to URL and carry params into detail"
```

---

## Task 2: useWords 增加 enabled 守卫

详情页在"无列表上下文"时不应该触发列表请求。给 `useWords` 加 `enabled` 守卫：传 `undefined` 则不请求。

**Files:**
- Modify: `web/src/hooks/useWords.ts`

- [ ] **Step 1: 修改 `useWords`**

将 `web/src/hooks/useWords.ts` 第 5-10 行的 `useWords` 改为：

```ts
export function useWords(params?: ListWordsParams) {
  return useQuery({
    queryKey: ["words", params],
    queryFn: () => api.listWords(params),
    enabled: params !== undefined,
  });
}
```

（`useWord`、`useNextReview` 保持不变。）

- [ ] **Step 2: 验证**

Run（在 `web/` 目录）:
```
bun run lint
bun run build
```
Expected: 无错误。`WordsList` 传入的是定义的对象，`enabled` 恒为 true，行为不变。

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useWords.ts
git commit -m "refactor(words): disable useWords query when params undefined"
```

---

## Task 3: 抽出 WordDetailCard 组件（纯重构）

把 `WordDetail.tsx` 中"视差卡主体 + 音频播放逻辑"抽成独立组件 `WordDetailCard`，供单卡模式与 Cover Flow 中央槽位复用。这是纯重构，单卡模式外观/行为应**完全不变**。

**Files:**
- Create: `web/src/components/word-detail/WordDetailCard.tsx`
- Modify: `web/src/pages/WordDetail.tsx`

- [ ] **Step 1: 新建 `WordDetailCard.tsx`**

创建 `web/src/components/word-detail/WordDetailCard.tsx`：

```tsx
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/lib/i18n";
import type { WordDetail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";
import { audioUrl } from "@/lib/audio";
import ParallaxCard from "@/components/word-detail/ParallaxCard";
import WordField from "@/components/word-detail/WordField";
import ExampleQuote from "@/components/word-detail/ExampleQuote";
import { FIELD_THEMES } from "@/components/word-detail/fieldTheme";

const z = (px: number): CSSProperties => ({ transform: `translateZ(${px}px)` });

interface WordDetailCardProps {
  data: WordDetail;
}

export default function WordDetailCard({ data }: WordDetailCardProps) {
  const { t } = useI18n();
  const { word, examples, synonyms } = data;

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingVariant, setPlayingVariant] = useState<"uk" | "us" | null>(null);
  const queueRef = useRef<("uk" | "us")[] | null>(null);
  const queueIdxRef = useRef(0);

  useEffect(() => {
    const pair: ("uk" | "us")[] = [];
    for (let i = 0; i < 3; i++) {
      if (word.has_audio_uk) pair.push("uk");
      if (word.has_audio_us) pair.push("us");
    }
    if (pair.length === 0 || !audioRef.current) return;
    queueRef.current = pair;
    queueIdxRef.current = 0;
    const el = audioRef.current;
    el.src = audioUrl(word.id, pair[0]);
    el.play().then(() => setPlayingVariant(pair[0])).catch(() => {
      queueRef.current = null;
      setPlayingVariant(null);
    });
  }, [word]);

  const play = (variant: "uk" | "us") => {
    const el = audioRef.current;
    if (!el) return;
    queueRef.current = null;
    if (playingVariant === variant) {
      el.pause();
      setPlayingVariant(null);
      return;
    }
    el.src = audioUrl(word.id, variant);
    el.play().then(() => setPlayingVariant(variant)).catch(() => setPlayingVariant(null));
  };

  const handleEnded = () => {
    const q = queueRef.current;
    if (!q) {
      setPlayingVariant(null);
      return;
    }
    queueIdxRef.current += 1;
    if (queueIdxRef.current < q.length) {
      const next = q[queueIdxRef.current];
      const el = audioRef.current;
      if (el) {
        el.src = audioUrl(word.id, next);
        el.play().then(() => setPlayingVariant(next)).catch(() => {
          queueRef.current = null;
          setPlayingVariant(null);
        });
      }
      return;
    }
    queueRef.current = null;
    setPlayingVariant(null);
  };

  let fieldIndex = 0;
  const nextIndex = () => fieldIndex++;

  const rootText = [word.root, word.association].filter(Boolean).join(" → ");
  const blue = FIELD_THEMES.blue;

  return (
    <div className="mx-auto max-w-2xl">
      <ParallaxCard>
        <div className="wd-card-bg">
          <div className="wd-glow wd-glow-1" />
          <div className="wd-glow wd-glow-2" />
        </div>
        <div className="wd-content">
          <h1 className="wd-word" style={z(55)}>
            {word.word}
          </h1>

          <div className="mt-4 flex items-center justify-start gap-4" style={z(35)}>
            {word.phonetic && <div className="wd-phonetic">{word.phonetic}</div>}
            {word.pos && <span className="wd-pos">{word.pos}</span>}
            {word.has_audio_uk && (
              <Button
                variant="ghost"
                aria-label={t.audio.uk}
                onClick={(e) => { e.stopPropagation(); play("uk"); }}
                className={playingVariant === "uk" ? "text-violet-300" : "text-gray-400 hover:text-white"}
              >
                <Volume2 className="h-5 w-5" />
                <span className="ml-1.5 text-sm font-medium">{t.audio.uk}</span>
              </Button>
            )}
            {word.has_audio_us && (
              <Button
                variant="ghost"
                aria-label={t.audio.us}
                onClick={(e) => { e.stopPropagation(); play("us"); }}
                className={playingVariant === "us" ? "text-violet-300" : "text-gray-400 hover:text-white"}
              >
                <Volume2 className="h-5 w-5" />
                <span className="ml-1.5 text-sm font-medium">{t.audio.us}</span>
              </Button>
            )}
            <audio ref={audioRef} onEnded={handleEnded} />
          </div>

          {(word.meaning_cn || word.meaning_en) && (
            <div className="wd-meaning" style={z(45)}>
              {word.meaning_cn && <div className="wd-meaning-cn">{word.meaning_cn}</div>}
              {word.meaning_en && <div className="wd-val-muted">{word.meaning_en}</div>}
            </div>
          )}

          <hr className="wd-rainbow" style={z(20)} />

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
  );
}
```

> 注意：抽离后保留了原有"挂载/word 变化时自动播放 UK/US 队列"的行为。在 Cover Flow 模式下每次翻到新词都会触发自动播放——这是**保留的既有行为**，如后续觉得翻页时自动播放打扰，可作为独立后续项调整，不在本计划范围内。

- [ ] **Step 2: 改 `WordDetail.tsx` 使用 `WordDetailCard`（暂不改其他逻辑）**

将 `web/src/pages/WordDetail.tsx` 替换为下面这版（删除已搬走的音频/卡片代码，改为渲染 `WordDetailCard`；页头 `← 返回` + Badge 行保留）：

```tsx
import { useParams, useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useWord } from "@/hooks/useWords";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import WordDetailCard from "@/components/word-detail/WordDetailCard";

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

  const { word, learning_status } = data;

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

      <WordDetailCard data={data} />
    </div>
  );
}
```

- [ ] **Step 3: Lint + 构建验证**

Run（在 `web/` 目录）:
```
bun run lint
bun run build
```
Expected: 无错误。

- [ ] **Step 4: 浏览器手动核验（行为应与重构前完全一致）**

访问 `http://localhost:5173/words/1`：
- 视差卡、流光标题、音频按钮（点击 UK/US 播放/暂停）、所有字段、例句高亮均正常。
- 自动播放队列仍生效。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/word-detail/WordDetailCard.tsx web/src/pages/WordDetail.tsx
git commit -m "refactor(word-detail): extract WordDetailCard for reuse"
```

---

## Task 4: WordDetail 读 URL，单卡模式保留 + 返回携带参数

让 `WordDetail` 读 `useSearchParams`，构造列表参数；返回按钮携带参数回到列表。**本任务仍只走单卡模式**（Cover Flow 在 Task 6 接入），但要确保"从列表点进来"和"直接打开"两种入口都不出错，且点击单词带过来的参数能被读出来。

**Files:**
- Modify: `web/src/pages/WordDetail.tsx`

- [ ] **Step 1: 引入 `useSearchParams`，返回按钮携带参数**

只做两处小改（**不**提前引入 `parseListParams`/`listParams`——那是 Task 6 的事，避免 `noUnusedLocals` 构建失败）：

(a) `web/src/pages/WordDetail.tsx` 顶部 import 的第一行改为：

```tsx
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
```

(b) 在组件内 `const { data, isLoading } = useWord(Number(id));` 这一行**之前**插入：

```tsx
  const [searchParams] = useSearchParams();
```

(c) 把 return 中返回按钮的 `onClick` 从 `() => navigate("/words")` 改为：

```tsx
        onClick={() =>
          navigate(`/words${searchParams.toString() ? `?${searchParams.toString()}` : ""}`)
        }
```

其余 JSX（Badge 行 + `<WordDetailCard data={data} />`）保持不变。

- [ ] **Step 2: Lint + 构建验证**

Run（在 `web/` 目录）:
```
bun run lint
bun run build
```
Expected: 无错误。

- [ ] **Step 3: 浏览器手动核验**

- 从 `/words?page=2&source=GRE` 点一个单词进详情 → 详情正常显示（单卡）。
- 点 `← 返回列表` → 回到 `/words?page=2&source=GRE`（页码/筛选保留）。
- 直接访问 `/words/1`（无参数）→ 单卡正常，返回回 `/words`。

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/WordDetail.tsx
git commit -m "feat(word-detail): back button preserves list query params"
```

---

## Task 5: i18n 文案 + wd-cf-* 样式

**Files:**
- Modify: `web/src/locales/zh.ts`
- Modify: `web/src/locales/en.ts`
- Modify: `web/src/index.css`

- [ ] **Step 1: 给 `zh.ts` 的 `wordDetail` 加 `coverFlow` 组**

在 `web/src/locales/zh.ts` 的 `wordDetail: { ... }` 内（`statusNew: "未学习",` 之后）追加：

```ts
    coverFlow: {
      position: "第 {page} 页 · {current} / {total}",
      prev: "上一个",
      next: "下一个",
    },
```

- [ ] **Step 2: 给 `en.ts` 的 `wordDetail` 加 `coverFlow` 组**

在 `web/src/locales/en.ts` 的 `wordDetail: { ... }` 内（`statusNew: "New",` 之后）追加：

```ts
    coverFlow: {
      position: "Page {page} · {current} / {total}",
      prev: "Previous",
      next: "Next",
    },
```

- [ ] **Step 3: 给 `index.css` 追加 `wd-cf-*` 样式**

在 `web/src/index.css` 末尾（`@media (prefers-reduced-motion: reduce)` 块**之前**）追加：

```css
/* ===== Cover Flow 轮播 ===== */
.wd-cf-stage {
  position: relative;
  perspective: 1100px;
  perspective-origin: 50% 45%;
  height: 560px;
  touch-action: pan-y;
  user-select: none;
}
.wd-cf-card {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  max-width: 42rem;
  will-change: transform, opacity;
}
.wd-cf-center {
  z-index: 30;
}
.wd-cf-side {
  cursor: pointer;
  z-index: 10;
}
.wd-cf-side-card {
  width: 14rem;
  height: 18rem;
  margin-left: -7rem;
  margin-top: -9rem;
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(139, 92, 246, 0.16), rgba(30, 27, 75, 0.55));
  border: 1px solid rgba(139, 92, 246, 0.32);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
}
.wd-cf-side-word {
  font-size: 26px;
  font-weight: 700;
  background: linear-gradient(90deg, #c4b5fd, #93c5fd);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  line-height: 1.1;
}
.wd-cf-side-pho {
  font-size: 13px;
  color: rgba(167, 139, 250, 0.85);
}
/* 中央卡倒影（仅镜像单词标题，避免重复渲染整卡/音频） */
.wd-cf-reflection {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  transform: scaleY(-1);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.35), transparent 55%);
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.35), transparent 55%);
  pointer-events: none;
  text-align: center;
  opacity: 0.5;
}
.wd-cf-reflection-word {
  font-size: 56px;
  font-weight: 800;
  line-height: 1.05;
  background: linear-gradient(90deg, #ffffff, #c4b5fd, #60a5fa, #ffffff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.wd-cf-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 8px;
}
.wd-cf-progress {
  width: 220px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.wd-cf-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #a78bfa, #60a5fa);
  transition: width 0.35s ease;
}
.wd-cf-position {
  font-size: 13px;
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.18);
  border: 1px solid rgba(139, 92, 246, 0.35);
  padding: 3px 12px;
  border-radius: 999px;
}
```

并在 `@media (prefers-reduced-motion: reduce)` 块内的选择器列表里追加 `.wd-cf-progress-fill`，使其过渡在减少动效偏好下也被禁用：

```css
  .wd-cf-progress-fill {
    transition: none !important;
  }
```

- [ ] **Step 4: 验证**

Run（在 `web/` 目录）:
```
bun run lint
bun run build
```
Expected: 无错误（文案 key 类型由 `typeof zh` 推导，两份 locale 结构需一致）。

- [ ] **Step 5: Commit**

```bash
git add web/src/locales/zh.ts web/src/locales/en.ts web/src/index.css
git commit -m "feat(cover-flow): add i18n keys and wd-cf-* styles"
```

---

## Task 6: WordCoverFlow 组件（舞台 + 卡片定位 + 接入详情页）

新建 `WordCoverFlow`，用 framer-motion 按偏移量定位 ±3 窗口的卡片；中央槽位渲染 `WordDetailCard`（自行 `useWord(currentId)`，与页头 `useWord` 同 key、react-query 自动去重），侧面渲染轻量书皮。本任务先不接翻页交互（Task 7），但点击侧面卡可直接导航。

**Files:**
- Create: `web/src/components/word-detail/WordCoverFlow.tsx`
- Modify: `web/src/pages/WordDetail.tsx`

- [ ] **Step 1: 新建 `WordCoverFlow.tsx`**

创建 `web/src/components/word-detail/WordCoverFlow.tsx`：

```tsx
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { useWord } from "@/hooks/useWords";
import type { Word } from "@/lib/types";
import WordDetailCard from "@/components/word-detail/WordDetailCard";

const VISIBLE = 3; // 中央两侧各渲染 3 张

interface OffsetTarget {
  x: number;
  z: number;
  rotateY: number;
  opacity: number;
}

function offsetTarget(d: number): OffsetTarget {
  const sign = Math.sign(d);
  const a = Math.abs(d);
  if (a === 0) return { x: 0, z: 0, rotateY: 0, opacity: 1 };
  if (a === 1) return { x: sign * 130, z: -140, rotateY: sign * -50, opacity: 0.6 };
  if (a === 2) return { x: sign * 230, z: -280, rotateY: sign * -58, opacity: 0.35 };
  return { x: sign * 320, z: -420, rotateY: sign * -62, opacity: 0.18 };
}

interface WordCoverFlowProps {
  words: Word[];
  currentId: number;
  onNavigate: (id: number) => void;
}

export default function WordCoverFlow({ words, currentId, onNavigate }: WordCoverFlowProps) {
  const { t } = useI18n();
  const { data, isLoading } = useWord(currentId);
  const currentIndex = useMemo(
    () => words.findIndex((w) => w.id === currentId),
    [words, currentId]
  );

  const visible = useMemo(() => {
    const start = Math.max(0, currentIndex - VISIBLE);
    const end = Math.min(words.length - 1, currentIndex + VISIBLE);
    const arr: { word: Word; d: number }[] = [];
    for (let i = start; i <= end; i++) arr.push({ word: words[i], d: i - currentIndex });
    return arr;
  }, [words, currentIndex]);

  return (
    <div className="wd-cf-stage">
      <AnimatePresence initial={false}>
        {visible.map(({ word, d }) => {
          const target = offsetTarget(d);
          const isCenter = d === 0;
          return (
            <motion.div
              key={word.id}
              className={isCenter ? "wd-cf-card wd-cf-center" : "wd-cf-card wd-cf-side"}
              initial={{ opacity: 0 }}
              animate={target}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              transformTemplate={(_, g) => `translate(-50%, -50%) ${g}`}
              onClick={isCenter ? undefined : () => onNavigate(word.id)}
              style={isCenter ? undefined : { width: "auto", maxWidth: "none" }}
            >
              {isCenter ? (
                isLoading || !data ? (
                  <div className="flex items-center justify-center py-32 text-gray-400">
                    Loading...
                  </div>
                ) : (
                  <div className="relative">
                    <WordDetailCard data={data} />
                    <div className="wd-cf-reflection" aria-hidden>
                      <div className="wd-cf-reflection-word">{data.word.word}</div>
                    </div>
                  </div>
                )
              ) : (
                <div className="wd-cf-side-card">
                  <div className="wd-cf-side-word">{word.word}</div>
                  {word.phonetic && <div className="wd-cf-side-pho">{word.phonetic}</div>}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      <div className="wd-cf-controls">
        {/* Task 7 接入按钮/键盘/触摸/滚轮交互；此处仅占位指示 */}
        <span className="text-sm text-gray-500">
          {t.wordDetail.coverFlow.prev} / {t.wordDetail.coverFlow.next}
        </span>
      </div>
    </div>
  );
}
```

> 说明：中央卡用 `key` 隐式由 `motion.div` 的 `word.id` 区分；`WordDetailCard` 内部音频 `useEffect` 依赖 `word`，导航到新词时 `data` 变化触发自动播放（保留既有行为）。

- [ ] **Step 2: 在 `WordDetail.tsx` 接入 Cover Flow 模式**

把 `web/src/pages/WordDetail.tsx` 的组件主体改为：用 `useWords(listParams)` 拉本页 100 词（有 `page` 参数时），判定 `coverFlowMode = hasListContext && id 在本页列表中`，是则渲染 `<WordCoverFlow>`，否则渲染单卡。

完整替换 `web/src/pages/WordDetail.tsx`：

```tsx
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useWord, useWords } from "@/hooks/useWords";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import WordDetailCard from "@/components/word-detail/WordDetailCard";
import WordCoverFlow from "@/components/word-detail/WordCoverFlow";
import type { ListWordsParams } from "@/lib/types";

function parseListParams(sp: URLSearchParams): ListWordsParams {
  const params: ListWordsParams = { per_page: 100 };
  const page = sp.get("page");
  if (page) params.page = Number(page);
  const q = sp.get("q");
  if (q) params.q = q;
  const source = sp.get("source");
  if (source) params.source = source;
  const status = sp.get("status");
  if (status) params.status = status;
  return params;
}

export default function WordDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const listParams = parseListParams(searchParams);
  const hasListContext = searchParams.has("page");
  const numericId = Number(id);

  const { data: wordData, isLoading } = useWord(numericId);
  const { data: listData } = useWords(hasListContext ? listParams : undefined);

  const inList = !!listData?.data.some((w) => w.id === numericId);
  const coverFlowMode = hasListContext && inList && !!listData;

  const backTo = () =>
    navigate(`/words${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>
    );
  }
  if (!wordData) {
    return <div className="py-20 text-center text-gray-400">Word not found</div>;
  }

  const { word, learning_status } = wordData;
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

  const goId = (nextId: number) =>
    navigate(`/words/${nextId}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={backTo} className="gap-2 text-gray-400 hover:text-white">
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

      {coverFlowMode ? (
        <WordCoverFlow words={listData!.data} currentId={numericId} onNavigate={goId} />
      ) : (
        <WordDetailCard data={wordData} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Lint + 构建验证**

Run（在 `web/` 目录）:
```
bun run lint
bun run build
```
Expected: 无错误。

- [ ] **Step 4: 浏览器手动核验**

- 从 `/words` 点一个单词 → 详情页应出现 3D Cover Flow：中间完整详情卡 + 两侧各最多 3 张侧旋书皮（带单词 + 音标），左右远近层次正确。
- 点某张侧面卡 → 中央切换为该词，URL `:id` 更新，卡片流转动画顺畅。
- 中央卡下方应有单词标题的镜面倒影。
- 直接访问 `/words/1`（无参数）→ 仍是单卡（降级正常）。
- 返回按钮回列表后页码/筛选保留。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/word-detail/WordCoverFlow.tsx web/src/pages/WordDetail.tsx
git commit -m "feat(cover-flow): 3D cover flow stage with side cards and center detail"
```

---

## Task 7: 翻页交互（按钮 + 键盘 + 触摸 + 滚轮）

给 `WordCoverFlow` 加五种翻页输入：圆形 ‹ › 按钮（边界禁用）、键盘 ← →、触摸左右滑、鼠标滚轮（节流）。点击侧面卡已在 Task 6 实现。

**Files:**
- Modify: `web/src/components/word-detail/WordCoverFlow.tsx`

- [ ] **Step 1: 改写 `WordCoverFlow.tsx`，加入交互**

把 `web/src/components/word-detail/WordCoverFlow.tsx` 整体替换为：

```tsx
import { useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { useWord } from "@/hooks/useWords";
import type { Word } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import WordDetailCard from "@/components/word-detail/WordDetailCard";

const VISIBLE = 3;

interface OffsetTarget {
  x: number;
  z: number;
  rotateY: number;
  opacity: number;
}

function offsetTarget(d: number): OffsetTarget {
  const sign = Math.sign(d);
  const a = Math.abs(d);
  if (a === 0) return { x: 0, z: 0, rotateY: 0, opacity: 1 };
  if (a === 1) return { x: sign * 130, z: -140, rotateY: sign * -50, opacity: 0.6 };
  if (a === 2) return { x: sign * 230, z: -280, rotateY: sign * -58, opacity: 0.35 };
  return { x: sign * 320, z: -420, rotateY: sign * -62, opacity: 0.18 };
}

interface WordCoverFlowProps {
  words: Word[];
  currentId: number;
  onNavigate: (id: number) => void;
}

export default function WordCoverFlow({ words, currentId, onNavigate }: WordCoverFlowProps) {
  const { t } = useI18n();
  const { data, isLoading } = useWord(currentId);
  const currentIndex = useMemo(
    () => words.findIndex((w) => w.id === currentId),
    [words, currentId]
  );

  const visible = useMemo(() => {
    const start = Math.max(0, currentIndex - VISIBLE);
    const end = Math.min(words.length - 1, currentIndex + VISIBLE);
    const arr: { word: Word; d: number }[] = [];
    for (let i = start; i <= end; i++) arr.push({ word: words[i], d: i - currentIndex });
    return arr;
  }, [words, currentIndex]);

  const atStart = currentIndex <= 0;
  const atEnd = currentIndex >= words.length - 1;

  const go = (dir: -1 | 1) => {
    const next = words[currentIndex + dir];
    if (next) onNavigate(next.id);
  };

  // 键盘 ← →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, words]);

  // 鼠标滚轮（节流：累计 delta > 30 且冷却 450ms 外才触发）
  const stageRef = useRef<HTMLDivElement>(null);
  const wheelAccum = useRef(0);
  const wheelLock = useRef(false);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (wheelLock.current) {
        wheelAccum.current = 0;
        return;
      }
      wheelAccum.current += e.deltaY;
      if (Math.abs(wheelAccum.current) < 30) return;
      wheelLock.current = true;
      go(wheelAccum.current > 0 ? 1 : -1);
      wheelAccum.current = 0;
      window.setTimeout(() => {
        wheelLock.current = false;
      }, 450);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, words]);

  // 触摸左右滑
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  return (
    <div
      ref={stageRef}
      className="wd-cf-stage"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <AnimatePresence initial={false}>
        {visible.map(({ word, d }) => {
          const target = offsetTarget(d);
          const isCenter = d === 0;
          return (
            <motion.div
              key={word.id}
              className={isCenter ? "wd-cf-card wd-cf-center" : "wd-cf-card wd-cf-side"}
              initial={{ opacity: 0 }}
              animate={target}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              transformTemplate={(_, g) => `translate(-50%, -50%) ${g}`}
              onClick={isCenter ? undefined : () => onNavigate(word.id)}
              style={isCenter ? undefined : { width: "auto", maxWidth: "none" }}
            >
              {isCenter ? (
                isLoading || !data ? (
                  <div className="flex items-center justify-center py-32 text-gray-400">
                    Loading...
                  </div>
                ) : (
                  <div className="relative">
                    <WordDetailCard data={data} />
                    <div className="wd-cf-reflection" aria-hidden>
                      <div className="wd-cf-reflection-word">{data.word.word}</div>
                    </div>
                  </div>
                )
              ) : (
                <div className="wd-cf-side-card">
                  <div className="wd-cf-side-word">{word.word}</div>
                  {word.phonetic && <div className="wd-cf-side-pho">{word.phonetic}</div>}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      <div className="wd-cf-controls">
        <Button
          variant="outline"
          size="icon"
          aria-label={t.wordDetail.coverFlow.prev}
          disabled={atStart}
          onClick={() => go(-1)}
          className="border-white/10 text-white hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t.wordDetail.coverFlow.next}
          disabled={atEnd}
          onClick={() => go(1)}
          className="border-white/10 text-white hover:bg-white/10"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
```

> 已知限制：滚轮在舞台区被 `preventDefault` 接管用于翻卡，舞台内长内容无法用滚轮滚动（中央卡内容应能在一屏内基本展示）。如后续需要长卡内滚动，作为独立后续项处理。

- [ ] **Step 2: Lint + 构建验证**

Run（在 `web/` 目录）:
```
bun run lint
bun run build
```
Expected: 无错误。

- [ ] **Step 3: 浏览器手动核验**

从列表进入详情 Cover Flow：
- 点 ‹ / › 按钮 → 切换相邻词，首词时 ‹ 禁用、末词时 › 禁用。
- 按键盘 ← / → → 同样切换。
- 触摸屏（或 DevTools 设备模拟）左右滑 → 切换。
- 鼠标滚轮上下滚 → 切换，且连续滚动不会一次跳过多张（节流生效）。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/word-detail/WordCoverFlow.tsx
git commit -m "feat(cover-flow): add button/keyboard/touch/wheel navigation"
```

---

## Task 8: 位置指示 + 进度条（边界已在上任务禁用）

补上顶部位置徽标 `第 N 页 · i / 100` 与底部进度条。`WordCoverFlow` 当前 props 没有 `page`；本任务需要让详情页把页码传进来。

**Files:**
- Modify: `web/src/components/word-detail/WordCoverFlow.tsx`
- Modify: `web/src/pages/WordDetail.tsx`

- [ ] **Step 1: 给 `WordCoverFlow` 加 `page` prop 与指示器/进度条**

在 `web/src/components/word-detail/WordCoverFlow.tsx`：

(a) `WordCoverFlowProps` 增加 `page: number;`：

```tsx
interface WordCoverFlowProps {
  words: Word[];
  currentId: number;
  page: number;
  onNavigate: (id: number) => void;
}
```

(b) 函数签名改为：

```tsx
export default function WordCoverFlow({ words, currentId, page, onNavigate }: WordCoverFlowProps) {
```

(c) 在 `const atStart = ...` 之后、`go` 之前插入 `position`/`progress` 计算：

```tsx
  const positionLabel = t.wordDetail.coverFlow.position
    .replace("{page}", String(page))
    .replace("{current}", String(currentIndex + 1))
    .replace("{total}", String(words.length));
  const progressPct = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;
```

(d) 在 `<div className="wd-cf-controls">` 的两个 Button **之间**插入进度条，并在 `.wd-cf-controls` 容器**上方**（紧贴 `<div ... ref={stageRef} className="wd-cf-stage" ...>` 开标签之后）插入位置徽标。最终舞台结构变为：

```tsx
    <div
      ref={stageRef}
      className="wd-cf-stage"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mb-3 flex justify-end">
        <span className="wd-cf-position">{positionLabel}</span>
      </div>

      <AnimatePresence initial={false}>
        {/* …卡片映射保持不变… */}
      </AnimatePresence>

      <div className="wd-cf-controls">
        <Button
          variant="outline"
          size="icon"
          aria-label={t.wordDetail.coverFlow.prev}
          disabled={atStart}
          onClick={() => go(-1)}
          className="border-white/10 text-white hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="wd-cf-progress" aria-hidden>
          <div className="wd-cf-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label={t.wordDetail.coverFlow.next}
          disabled={atEnd}
          onClick={() => go(1)}
          className="border-white/10 text-white hover:bg-white/10"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
```

（即：把原来两 Button 之间替换为进度条；在 AnimatePresence 前加位置徽标行。其余代码不变。）

- [ ] **Step 2: 详情页传入 `page`**

在 `web/src/pages/WordDetail.tsx` 中，把渲染处：

```tsx
        <WordCoverFlow words={listData!.data} currentId={numericId} onNavigate={goId} />
```

改为：

```tsx
        <WordCoverFlow
          words={listData!.data}
          currentId={numericId}
          page={listParams.page ?? 1}
          onNavigate={goId}
        />
```

- [ ] **Step 3: Lint + 构建验证**

Run（在 `web/` 目录）:
```
bun run lint
bun run build
```
Expected: 无错误。

- [ ] **Step 4: 浏览器手动核验**

- 顶部右侧显示 `第 2 页 · 5 / 100`（按当前页/位置），中英文案随 locale 切换。
- 底部 ‹ › 之间为进度条，宽度随位置变化，带过渡动画。
- 首词/末词边界禁用仍正常。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/word-detail/WordCoverFlow.tsx web/src/pages/WordDetail.tsx
git commit -m "feat(cover-flow): position label and progress bar"
```

---

## Task 9: 全量验证 + 收尾

**Files:** （无新改动；仅验证）

- [ ] **Step 1: 全量 Lint + 构建**

Run（在 `web/` 目录）:
```
bun run lint
bun run build
```
Expected: 均无错误、无警告（构建产出 `web/dist/`）。

- [ ] **Step 2: 端到端手动核验清单**

启动 `cargo run` + `bun run dev`，访问 `http://localhost:5173`：

1. `/words` 切换 source/status、搜索、翻页 → URL 实时反映；刷新保留状态。
2. 点单词进详情 → 3D Cover Flow：中间完整详情卡（视差倾斜、流光、音频可播、全部字段、例句高亮）+ 两侧各 ≤3 张侧旋书皮。
3. 中央卡下方有标题倒影。
4. 五种翻页：‹ › 按钮、键盘 ← →、触摸左右滑、鼠标滚轮（节流不跳多张）、点侧面卡。
5. 顶部位置徽标 + 底部进度条随位置更新；首/末词边界禁用。
6. `← 返回列表` 带参数回 `/words?page=..&...`。
7. 直接访问 `/words/1`（无参数）→ 单卡降级，无轮播。
8. 参数中 id 不在本页（手工把 URL 的 `:id` 改成本页没有的 id，但保留 `?page=..`）→ 单卡降级。
9. 切换中/英 locale → 位置徽标文案随之变化。
10. 减少动效（系统设置或 DevTools）→ 进度条过渡禁用、卡片动画尊重偏好。

- [ ] **Step 3: （可选）最终整理 commit**

如 Step 1/2 无需改动则跳过；若有微调：

```bash
git add -A
git commit -m "chore(cover-flow): final polish"
```

---

## 自检（Self-Review 结果）

- **Spec 覆盖**：URL 上下文通道（Task 1/2/4）、WordsList URL 同步（Task 1）、WordDetail 双模式 + 降级（Task 4/6）、WordCoverFlow 舞台/三卡槽/倒影/定位（Task 6）、五种翻页交互含滚轮节流（Task 7）、性能窗口化 ±3（Task 6）、边界禁用（Task 7）、位置指示 + 进度条（Task 8）、i18n + 样式（Task 5）均覆盖。
- **占位符**：无 TBD/TODO；所有代码步均含完整代码。
- **类型一致性**：`WordCoverFlowProps`（words/currentId/page/onNavigate）、`parseListParams`、`offsetTarget`、`useWords(enabled)`、`WordDetailCardProps` 各任务间签名一致；Task 6 → Task 8 的 props 扩展（加 `page`）已同步更新详情页调用处。
- **已知行为**：中央卡翻页时自动播放音频为既有行为保留，已在 Task 3 注明。
