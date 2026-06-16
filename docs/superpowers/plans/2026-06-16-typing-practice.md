# Typing Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a word typing practice game to the word detail flow, with letter-by-letter input, fade-out animation on completion, result statistics with error retry, and backend persistence of practice results.

**Architecture:** New route `/words/:id/typing` with independent page component. Backend adds a single `POST /api/typing/result` endpoint that updates `learning_status` counts without triggering SM-2. Frontend reuses `useWords` hook for vocabulary source, consistent with existing list/detail context pattern.

**Tech Stack:** Rust/axum (backend), React 19 + TypeScript + framer-motion + Tailwind v4 (frontend)

---

### Task 1: Backend — Add typing result models

**Files:**
- Modify: `src/models.rs`

- [ ] **Step 1: Add `TypingWordResult` and `TypingResultRequest` structs**

Append to `src/models.rs`:

```rust
#[derive(Debug, Deserialize)]
pub struct TypingWordResult {
    pub word_id: i64,
    pub correct: bool,
    pub error_count: u32,
}

#[derive(Debug, Deserialize)]
pub struct TypingResultRequest {
    pub results: Vec<TypingWordResult>,
    pub total_time_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct TypingResultResponse {
    pub updated: u32,
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/models.rs
git commit -m "feat: add typing practice request/response models"
```

---

### Task 2: Backend — Add typing service

**Files:**
- Create: `src/services/typing.rs`

- [ ] **Step 1: Create typing service with `submit_typing_result` function**

Create `src/services/typing.rs`:

```rust
use rusqlite::{params, Connection};
use crate::error::AppError;
use crate::models::*;

pub fn submit_typing_result(conn: &Connection, req: &TypingResultRequest) -> Result<TypingResultResponse, AppError> {
    let now = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Iso8601::DEFAULT)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut updated = 0u32;

    for r in &req.results {
        let existing = conn.query_row(
            "SELECT id FROM learning_status WHERE word_id = ?1",
            params![r.word_id],
            |row| row.get::<_, i64>(0),
        );

        match existing {
            Ok(_) => {
                conn.execute(
                    "UPDATE learning_status SET review_count = review_count + 1, correct_count = correct_count + ?1, last_reviewed_at = ?2 WHERE word_id = ?3",
                    params![if r.correct { 1 } else { 0 }, now, r.word_id],
                )?;
                updated += 1;
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                conn.execute(
                    "INSERT INTO learning_status (word_id, status, review_count, correct_count, last_reviewed_at, next_review_at, ease_factor, interval_days) VALUES (?1, 'new', 1, ?2, ?3, ?3, 2.5, 0)",
                    params![r.word_id, if r.correct { 1 } else { 0 }, now],
                )?;
                updated += 1;
            }
            Err(e) => return Err(AppError::Internal(e.to_string())),
        }
    }

    Ok(TypingResultResponse { updated })
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/services/typing.rs
git commit -m "feat: add typing practice service with learning_status update"
```

---

### Task 3: Backend — Add typing handler and register route

**Files:**
- Create: `src/handlers/typing.rs`
- Modify: `src/main.rs`

- [ ] **Step 1: Create typing handler**

Create `src/handlers/typing.rs`:

```rust
use axum::extract::State;
use axum::Json;
use crate::db::Db;
use crate::error::AppError;
use crate::models::*;
use crate::services;

pub async fn submit_typing_result(
    State(db): State<Db>,
    Json(req): Json<TypingResultRequest>,
) -> Result<Json<TypingResultResponse>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let result = services::typing::submit_typing_result(&conn, &req)?;
    Ok(Json(result))
}
```

- [ ] **Step 2: Register the route in `src/main.rs`**

Add the route after the quiz routes in `main.rs`:

```rust
.route("/api/typing/result", post(handlers::typing::submit_typing_result))
```

The full router becomes:

```rust
let app = Router::new()
    .route("/api/words", get(handlers::words::list_words).post(handlers::words::create_word))
    .route("/api/words/{id}", get(handlers::words::get_word).put(handlers::words::update_word).delete(handlers::words::delete_word))
    .route("/api/words/{id}/audio/{variant}", get(handlers::words::get_word_audio))
    .route("/api/review/next", get(handlers::review::get_next_review))
    .route("/api/review/{word_id}/answer", post(handlers::review::submit_review))
    .route("/api/quiz/generate", post(handlers::quiz::generate_quiz))
    .route("/api/quiz/{id}/submit", post(handlers::quiz::submit_quiz))
    .route("/api/typing/result", post(handlers::typing::submit_typing_result))
    .layer(CorsLayer::permissive())
    .layer(TraceLayer::new_for_http())
    .fallback(static_files::static_handler)
    .with_state(pool);
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check`
Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/handlers/typing.rs src/main.rs
git commit -m "feat: add POST /api/typing/result endpoint and register route"
```

---

### Task 4: Frontend — Add TypeScript types and API method

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: Add typing practice types to `web/src/lib/types.ts`**

Append to the file:

```typescript
export interface TypingWordResult {
  word_id: number;
  correct: boolean;
  error_count: number;
}

export interface TypingResultRequest {
  results: TypingWordResult[];
  total_time_ms: number;
}

export interface TypingResultResponse {
  updated: number;
}
```

- [ ] **Step 2: Add `submitTypingResult` method to `web/src/lib/api.ts`**

Add the import for new types and add the method to the `api` object:

At the top, update the import:

```typescript
import type {
  PaginatedResponse,
  Word,
  WordDetail,
  LearningStatus,
  ListWordsParams,
  Quiz,
  QuizResult,
  GenerateQuizParams,
  TypingResultRequest,
  TypingResultResponse,
} from "./types";
```

Add to the `api` object:

```typescript
  submitTypingResult(req: TypingResultRequest): Promise<TypingResultResponse> {
    return request(`/typing/result`, {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
```

- [ ] **Step 3: Verify no type errors**

Run: `bun run --cwd web build`
Expected: builds without type errors

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts
git commit -m "feat: add typing practice types and API method"
```

---

### Task 5: Frontend — Add i18n translations

**Files:**
- Modify: `web/src/locales/zh.ts`
- Modify: `web/src/locales/en.ts`

- [ ] **Step 1: Add Chinese translations**

Add a `typing` key to the exported object in `web/src/locales/zh.ts`:

```typescript
  typing: {
    title: "打字练习",
    progress: "第 {current} 个 / 共 {total} 个",
    back: "返回详情",
    typeHere: "输入单词...",
    result: "练习结果",
    accuracy: "正确率",
    totalTime: "总用时",
    avgTime: "平均每词",
    errorWords: "错误单词",
    errorCount: "错 {count} 次",
    restartAll: "重新练习全部",
    retryErrors: "只练错词",
    noErrors: "全部正确，太棒了！",
    seconds: "秒",
  },
```

- [ ] **Step 2: Add English translations**

Add a `typing` key to the exported object in `web/src/locales/en.ts`:

```typescript
  typing: {
    title: "Typing Practice",
    progress: "Word {current} / {total}",
    back: "Back to Detail",
    typeHere: "Type the word...",
    result: "Practice Result",
    accuracy: "Accuracy",
    totalTime: "Total Time",
    avgTime: "Avg per Word",
    errorWords: "Error Words",
    errorCount: "{count} error(s)",
    restartAll: "Restart All",
    retryErrors: "Practice Errors Only",
    noErrors: "Perfect! No errors!",
    seconds: "s",
  },
```

- [ ] **Step 3: Commit**

```bash
git add web/src/locales/zh.ts web/src/locales/en.ts
git commit -m "feat: add typing practice i18n translations"
```

---

### Task 6: Frontend — Create TypingInput component

**Files:**
- Create: `web/src/components/typing/TypingInput.tsx`

- [ ] **Step 1: Create TypingInput component**

Create `web/src/components/typing/TypingInput.tsx`:

```tsx
import { useEffect, useRef, useCallback } from "react";

type CharState = "empty" | "correct" | "wrong";

interface TypingInputProps {
  word: string;
  onComplete: () => void;
  onError: () => void;
}

export default function TypingInput({ word, onComplete, onError }: TypingInputProps) {
  const chars = useRef<CharState[]>(
    word.split("").map((c) => (/[a-zA-Z]/.test(c) ? "empty" : "correct"))
  );
  const cursor = useRef(
    word.split("").findIndex((c) => /[a-zA-Z]/.test(c))
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chars.current = word.split("").map((c) =>
      /[a-zA-Z]/.test(c) ? "empty" : "correct"
    );
    cursor.current = word.split("").findIndex((c) => /[a-zA-Z]/.test(c));
    containerRef.current?.focus();
  }, [word]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab" || e.key === "Escape") return;
      e.preventDefault();

      if (e.key === "Backspace") {
        let prev = cursor.current - 1;
        while (prev >= 0 && chars.current[prev] !== "empty" && chars.current[prev] !== "wrong") {
          prev--;
        }
        if (prev >= 0 && chars.current[prev] === "wrong") {
          chars.current[prev] = "empty";
          cursor.current = prev;
        }
        return;
      }

      if (cursor.current >= word.length) return;
      if (!/^[a-zA-Z]$/.test(e.key)) return;

      const expected = word[cursor.current];
      if (e.key.toLowerCase() === expected.toLowerCase()) {
        chars.current[cursor.current] = "correct";
      } else {
        chars.current[cursor.current] = "wrong";
        onError();
      }

      let next = cursor.current + 1;
      while (next < word.length && chars.current[next] === "correct" && !/[a-zA-Z]/.test(word[next])) {
        next++;
      }
      cursor.current = next;

      if (chars.current.every((s) => s === "correct")) {
        onComplete();
      }
    },
    [word, onComplete, onError]
  );

  const displayChars = word.split("").map((c, i) => {
    const state = chars.current[i];
    const isLetter = /[a-zA-Z]/.test(c);
    let cls = "tp-char ";
    if (!isLetter) {
      cls += "tp-char-preset";
    } else if (state === "correct") {
      cls += "tp-char-correct";
    } else if (state === "wrong") {
      cls += "tp-char-wrong";
    } else if (i === cursor.current) {
      cls += "tp-char-active";
    } else {
      cls += "tp-char-empty";
    }
    return (
      <span key={i} className={cls}>
        {state === "correct" || state === "wrong" ? c : isLetter ? "" : c}
      </span>
    );
  });

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="tp-input-outline"
      onKeyDown={handleKeyDown}
    >
      <div className="tp-input-grid">{displayChars}</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/typing/TypingInput.tsx
git commit -m "feat: add TypingInput component with letter-by-letter state"
```

---

### Task 7: Frontend — Create TypingCard component

**Files:**
- Create: `web/src/components/typing/TypingCard.tsx`

- [ ] **Step 1: Create TypingCard component**

Create `web/src/components/typing/TypingCard.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { audioUrl } from "@/lib/audio";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";
import type { Word } from "@/lib/types";
import TypingInput from "@/components/typing/TypingInput";

interface TypingCardProps {
  word: Word;
  onComplete: () => void;
  onError: () => void;
}

export default function TypingCard({ word, onComplete, onError }: TypingCardProps) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingVariant, setPlayingVariant] = useState<"uk" | "us" | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDone(false);
    if (!audioRef.current) return;
    const variant: "uk" | "us" = word.has_audio_uk ? "uk" : "us";
    if (!word.has_audio_uk && !word.has_audio_us) return;
    const el = audioRef.current;
    el.src = audioUrl(word.id, variant);
    el.play().then(() => setPlayingVariant(variant)).catch(() => setPlayingVariant(null));
  }, [word]);

  const play = (variant: "uk" | "us") => {
    const el = audioRef.current;
    if (!el) return;
    if (playingVariant === variant) {
      el.pause();
      setPlayingVariant(null);
      return;
    }
    el.src = audioUrl(word.id, variant);
    el.play().then(() => setPlayingVariant(variant)).catch(() => setPlayingVariant(null));
  };

  const handleComplete = () => {
    setDone(true);
    setTimeout(onComplete, 600);
  };

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key={word.id}
          initial={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85, y: -20 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="tp-card"
        >
          <div className="tp-card-inner">
            <div className="tp-card-hint">
              {word.pos && <span className="tp-pos">{word.pos}</span>}
              {word.meaning_cn && <span className="tp-meaning">{word.meaning_cn}</span>}
            </div>

            <div className="tp-card-audio">
              {word.has_audio_uk && (
                <Button
                  variant="ghost"
                  onClick={() => play("uk")}
                  className={playingVariant === "uk" ? "text-violet-300" : "text-gray-400 hover:text-white"}
                >
                  <Volume2 className="h-4 w-4" />
                  <span className="ml-1 text-sm">{t.audio.uk}</span>
                </Button>
              )}
              {word.has_audio_us && (
                <Button
                  variant="ghost"
                  onClick={() => play("us")}
                  className={playingVariant === "us" ? "text-violet-300" : "text-gray-400 hover:text-white"}
                >
                  <Volume2 className="h-4 w-4" />
                  <span className="ml-1 text-sm">{t.audio.us}</span>
                </Button>
              )}
              <audio ref={audioRef} onEnded={() => setPlayingVariant(null)} />
            </div>

            <TypingInput word={word.word} onComplete={handleComplete} onError={onError} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/typing/TypingCard.tsx
git commit -m "feat: add TypingCard component with audio and fade-out"
```

---

### Task 8: Frontend — Create TypingProgress component

**Files:**
- Create: `web/src/components/typing/TypingProgress.tsx`

- [ ] **Step 1: Create TypingProgress component**

Create `web/src/components/typing/TypingProgress.tsx`:

```tsx
interface TypingProgressProps {
  current: number;
  total: number;
}

export default function TypingProgress({ current, total }: TypingProgressProps) {
  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="tp-progress-wrap">
      <div className="tp-progress-bar">
        <div className="tp-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="tp-progress-label">{current} / {total}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/typing/TypingProgress.tsx
git commit -m "feat: add TypingProgress component"
```

---

### Task 9: Frontend — Create TypingResult component

**Files:**
- Create: `web/src/components/typing/TypingResult.tsx`

- [ ] **Step 1: Create TypingResult component**

Create `web/src/components/typing/TypingResult.tsx`:

```tsx
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { RotateCcw, Target } from "lucide-react";

export interface TypingErrorWord {
  word_id: number;
  word: string;
  error_count: number;
}

interface TypingResultProps {
  total: number;
  correct: number;
  totalTimeMs: number;
  errorWords: TypingErrorWord[];
  onRestartAll: () => void;
  onRetryErrors: () => void;
}

export default function TypingResult({
  total,
  correct,
  totalTimeMs,
  errorWords,
  onRestartAll,
  onRetryErrors,
}: TypingResultProps) {
  const { t } = useI18n();
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const avgMs = total > 0 ? Math.round(totalTimeMs / total) : 0;

  return (
    <div className="tp-result">
      <h2 className="tp-result-title">{t.typing.result}</h2>

      <div className="tp-result-stats">
        <div className="tp-result-stat">
          <Target className="h-6 w-6 text-violet-400" />
          <div>
            <div className="tp-result-value">{accuracy}%</div>
            <div className="tp-result-label">{t.typing.accuracy}</div>
          </div>
        </div>
        <div className="tp-result-stat">
          <div className="tp-result-value">{(totalTimeMs / 1000).toFixed(1)}{t.typing.seconds}</div>
          <div className="tp-result-label">{t.typing.totalTime}</div>
        </div>
        <div className="tp-result-stat">
          <div className="tp-result-value">{(avgMs / 1000).toFixed(1)}{t.typing.seconds}</div>
          <div className="tp-result-label">{t.typing.avgTime}</div>
        </div>
      </div>

      {errorWords.length > 0 ? (
        <div className="tp-result-errors">
          <h3 className="tp-result-errors-title">{t.typing.errorWords}</h3>
          <div className="tp-result-errors-list">
            {errorWords.map((ew) => (
              <div key={ew.word_id} className="tp-result-error-item">
                <span className="tp-result-error-word">{ew.word}</span>
                <span className="tp-result-error-count">
                  {t.typing.errorCount.replace("{count}", String(ew.error_count))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="tp-result-perfect">{t.typing.noErrors}</div>
      )}

      <div className="tp-result-actions">
        <Button onClick={onRestartAll} variant="outline" className="gap-2 border-white/20 text-white hover:bg-white/10">
          <RotateCcw className="h-4 w-4" />
          {t.typing.restartAll}
        </Button>
        {errorWords.length > 0 && (
          <Button onClick={onRetryErrors} className="gap-2 bg-violet-600 hover:bg-violet-700">
            <Target className="h-4 w-4" />
            {t.typing.retryErrors}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/typing/TypingResult.tsx
git commit -m "feat: add TypingResult component with stats and error retry"
```

---

### Task 10: Frontend — Create TypingPractice page

**Files:**
- Create: `web/src/pages/TypingPractice.tsx`

- [ ] **Step 1: Create TypingPractice page**

Create `web/src/pages/TypingPractice.tsx`:

```tsx
import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useWords } from "@/hooks/useWords";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import TypingCard from "@/components/typing/TypingCard";
import TypingProgress from "@/components/typing/TypingProgress";
import TypingResult, { type TypingErrorWord } from "@/components/typing/TypingResult";
import type { ListWordsParams, Word } from "@/lib/types";

type Phase = "playing" | "result";

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

interface WordResult {
  word_id: number;
  word: string;
  correct: boolean;
  error_count: number;
}

export default function TypingPractice() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const numericId = Number(id);

  const listParams = parseListParams(searchParams);
  const hasListContext = searchParams.has("page");
  const { data: listData } = useWords(hasListContext ? listParams : undefined);

  const [practiceWords, setPracticeWords] = useState<Word[] | null>(null);
  const [phase, setPhase] = useState<Phase>("playing");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<WordResult[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [totalTimeMs, setTotalTimeMs] = useState(0);

  useMemo(() => {
    if (practiceWords === null && listData) {
      const allWords = listData.data;
      const startIdx = allWords.findIndex((w) => w.id === numericId);
      const words = startIdx >= 0 ? allWords.slice(startIdx) : allWords;
      setPracticeWords(words);
      setStartTime(Date.now());
    }
  }, [listData, practiceWords, numericId]);

  const currentWord = practiceWords?.[currentIndex];

  const handleError = useCallback(() => {
    setResults((prev) => {
      const copy = [...prev];
      const existing = copy.find((r) => r.word_id === currentWord!.id);
      if (existing) {
        existing.error_count += 1;
        existing.correct = false;
      } else {
        copy.push({ word_id: currentWord!.id, word: currentWord!.word, correct: false, error_count: 1 });
      }
      return copy;
    });
  }, [currentWord]);

  const handleComplete = useCallback(() => {
    const isLast = currentIndex + 1 >= (practiceWords?.length ?? 0);
    const elapsed = Date.now() - startTime;

    setResults((prev) => {
      const copy = [...prev];
      const existing = copy.find((r) => r.word_id === currentWord!.id);
      if (existing) {
        existing.correct = existing.error_count === 0;
      } else {
        copy.push({ word_id: currentWord!.id, word: currentWord!.word, correct: true, error_count: 0 });
      }

      if (isLast) {
        api.submitTypingResult({
          results: copy.map((r) => ({
            word_id: r.word_id,
            correct: r.correct,
            error_count: r.error_count,
          })),
          total_time_ms: elapsed,
        }).catch(() => {});
      }

      return copy;
    });

    if (isLast) {
      setTotalTimeMs(elapsed);
      setPhase("result");
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentWord, currentIndex, practiceWords, startTime]);

  const handleRestartAll = () => {
    setPhase("playing");
    setCurrentIndex(0);
    setResults([]);
    setStartTime(Date.now());
    setTotalTimeMs(0);
  };

  const handleRetryErrors = () => {
    const errorWordIds = new Set(results.filter((r) => !r.correct).map((r) => r.word_id));
    const retryWords = practiceWords?.filter((w) => errorWordIds.has(w.id)) ?? [];
    setPracticeWords(retryWords);
    setPhase("playing");
    setCurrentIndex(0);
    setResults([]);
    setStartTime(Date.now());
    setTotalTimeMs(0);
  };

  const backTo = () => navigate(`/words/${id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);

  const correctCount = results.filter((r) => r.correct).length;
  const errorWords: TypingErrorWord[] = results
    .filter((r) => !r.correct)
    .map((r) => ({ word_id: r.word_id, word: r.word, error_count: r.error_count }));

  if (!listData || !practiceWords) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  }

  return (
    <div className="tp-page">
      <div className="tp-header">
        <Button variant="ghost" onClick={backTo} className="gap-2 text-gray-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {t.typing.back}
        </Button>
        <h1 className="tp-title">{t.typing.title}</h1>
      </div>

      {phase === "playing" && currentWord && (
        <>
          <TypingProgress
            current={currentIndex + 1}
            total={practiceWords.length}
          />
          <TypingCard
            key={currentWord.id}
            word={currentWord}
            onComplete={handleComplete}
            onError={handleError}
          />
        </>
      )}

      {phase === "result" && (
        <TypingResult
          total={results.length}
          correct={correctCount}
          totalTimeMs={totalTimeMs}
          errorWords={errorWords}
          onRestartAll={handleRestartAll}
          onRetryErrors={handleRetryErrors}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/TypingPractice.tsx
git commit -m "feat: add TypingPractice page with playing and result phases"
```

---

### Task 11: Frontend — Register route and add entry button

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/pages/WordDetail.tsx`

- [ ] **Step 1: Add typing route to `web/src/App.tsx`**

Add import and route:

```tsx
import TypingPractice from "./pages/TypingPractice";
```

Add route under the `words/:id` route:

```tsx
<Route path="words/:id/typing" element={<TypingPractice />} />
```

Full `App.tsx`:

```tsx
import { Routes, Route } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import WordsList from "./pages/WordsList";
import WordDetail from "./pages/WordDetail";
import TypingPractice from "./pages/TypingPractice";
import Review from "./pages/Review";
import Quiz from "./pages/Quiz";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="words" element={<WordsList />} />
        <Route path="words/:id" element={<WordDetail />} />
        <Route path="words/:id/typing" element={<TypingPractice />} />
        <Route path="review" element={<Review />} />
        <Route path="quiz" element={<Quiz />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 2: Add "Typing Practice" button to `web/src/pages/WordDetail.tsx`**

Add import for `Keyboard` icon from lucide-react and add a button next to the back button in the header area. In the `<div className="flex items-center justify-between">` section, after the back button and before the badges div, add:

```tsx
{coverFlowMode && (
  <Button
    variant="outline"
    onClick={() => navigate(`/words/${id}/typing${searchParams.toString() ? `?${searchParams.toString()}` : ""}`)}
    className="gap-2 border-violet-500/40 text-violet-300 hover:bg-violet-500/20 hover:text-violet-200"
  >
    <Keyboard className="h-4 w-4" />
    {t.typing.title}
  </Button>
)}
```

Also add the import at the top:

```tsx
import { ArrowLeft, Keyboard } from "lucide-react";
```

- [ ] **Step 3: Verify build**

Run: `bun run --cwd web build`
Expected: builds successfully

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx web/src/pages/WordDetail.tsx
git commit -m "feat: register typing route and add entry button on detail page"
```

---

### Task 12: Frontend — Add typing practice CSS styles

**Files:**
- Modify: `web/src/index.css`

- [ ] **Step 1: Add typing practice styles to `web/src/index.css`**

Append before the `@media (prefers-reduced-motion)` block:

```css
/* ===== Typing Practice 打字练习 ===== */
.tp-page {
  max-width: 48rem;
  margin: 0 auto;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
}
.tp-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}
.tp-title {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(90deg, #c4b5fd, #93c5fd);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.tp-card {
  margin-top: 32px;
}
.tp-card-inner {
  background: linear-gradient(135deg, #0f0f23 0%, #15153a 100%);
  border-radius: 20px;
  padding: 48px 40px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  position: relative;
  border: 1px solid rgba(139, 92, 246, 0.3);
}
.tp-card-inner::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 20px;
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
.tp-card-hint {
  text-align: center;
  margin-bottom: 28px;
}
.tp-pos {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 6px;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  color: #c4b5fd;
  font-size: 18px;
  font-style: italic;
  margin-right: 12px;
  vertical-align: middle;
}
.tp-meaning {
  font-size: 22px;
  font-weight: 500;
  color: #f1f1f3;
  vertical-align: middle;
}
.tp-card-audio {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 32px;
}
.tp-input-outline {
  outline: none;
  display: flex;
  justify-content: center;
}
.tp-input-outline:focus {
  outline: none;
}
.tp-input-grid {
  display: flex;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}
.tp-char {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 52px;
  font-size: 24px;
  font-weight: 700;
  font-family: monospace;
  border-radius: 8px;
  transition: all 0.15s ease;
}
.tp-char-empty {
  border-bottom: 3px solid rgba(255, 255, 255, 0.25);
  color: transparent;
}
.tp-char-active {
  border-bottom: 3px solid #a78bfa;
  color: transparent;
  box-shadow: 0 2px 8px rgba(167, 139, 250, 0.3);
}
.tp-char-correct {
  border-bottom: 3px solid #34d399;
  color: #34d399;
  background: rgba(52, 211, 153, 0.08);
}
.tp-char-wrong {
  border-bottom: 3px solid #f87171;
  color: #f87171;
  background: rgba(248, 113, 113, 0.08);
}
.tp-char-preset {
  border-bottom: 3px solid rgba(139, 92, 246, 0.4);
  color: #a78bfa;
}
.tp-progress-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.tp-progress-bar {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.tp-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #a78bfa, #60a5fa);
  transition: width 0.35s ease;
}
.tp-progress-label {
  font-size: 13px;
  color: #c4b5fd;
  white-space: nowrap;
}
.tp-result {
  margin-top: 48px;
  text-align: center;
}
.tp-result-title {
  font-size: 28px;
  font-weight: 800;
  background: linear-gradient(90deg, #c4b5fd, #93c5fd);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin-bottom: 32px;
}
.tp-result-stats {
  display: flex;
  justify-content: center;
  gap: 40px;
  margin-bottom: 36px;
}
.tp-result-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.tp-result-value {
  font-size: 28px;
  font-weight: 700;
  color: #e5e7eb;
}
.tp-result-label {
  font-size: 13px;
  color: #9ca3af;
}
.tp-result-errors {
  margin-top: 24px;
}
.tp-result-errors-title {
  font-size: 16px;
  font-weight: 600;
  color: #f87171;
  margin-bottom: 12px;
}
.tp-result-errors-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.tp-result-error-item {
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
  border-radius: 8px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tp-result-error-word {
  font-size: 18px;
  font-weight: 600;
  color: #fca5a5;
}
.tp-result-error-count {
  font-size: 13px;
  color: #f87171;
}
.tp-result-perfect {
  font-size: 20px;
  font-weight: 600;
  color: #34d399;
  margin: 24px 0;
}
.tp-result-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 32px;
}
```

- [ ] **Step 2: Verify build**

Run: `bun run --cwd web build`
Expected: builds successfully

- [ ] **Step 3: Commit**

```bash
git add web/src/index.css
git commit -m "feat: add typing practice CSS styles"
```

---

### Task 13: Integration test — Build and verify

**Files:** None (verification only)

- [ ] **Step 1: Run backend build**

Run: `cargo build`
Expected: compiles without errors

- [ ] **Step 2: Run frontend build**

Run: `bun run --cwd web build`
Expected: builds successfully

- [ ] **Step 3: Run backend tests**

Run: `cargo test`
Expected: all existing tests pass

- [ ] **Step 4: Run frontend lint**

Run: `bun run --cwd web lint`
Expected: no lint errors

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address build/lint issues from integration"
```
