# Typing Practice: Default Show Word Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add word text display above the typing input area, default visible, with a toggle button to hide it for memory mode.

**Architecture:** Add `showWord` state to `TypingPractice` page, pass it and a toggle callback as props to `TypingCard`. `TypingCard` renders the word text line conditionally with AnimatePresence exit animation. Toggle button (Eye/EyeOff icon) positioned absolutely in the card's top-right corner.

**Tech Stack:** React 19, framer-motion, lucide-react, CSS (`.tp-` prefix)

---

### Task 1: Add i18n keys

**Files:**
- Modify: `web/src/locales/zh.ts:91-106`
- Modify: `web/src/locales/en.ts:91-106`

- [ ] **Step 1: Add keys to zh.ts**

In `web/src/locales/zh.ts`, add two keys inside the `typing` object after `typeHere`:

```ts
showWord: "显示单词",
hideWord: "隐藏单词",
```

- [ ] **Step 2: Add keys to en.ts**

In `web/src/locales/en.ts`, add two keys inside the `typing` object after `typeHere`:

```ts
showWord: "Show Word",
hideWord: "Hide Word",
```

- [ ] **Step 3: Commit**

```bash
git add web/src/locales/zh.ts web/src/locales/en.ts
git commit -m "feat: add i18n keys for typing show/hide word toggle"
```

---

### Task 2: Add CSS styles for word display line and toggle button

**Files:**
- Modify: `web/src/index.css:462-468` (after `.tp-meaning`, before `.tp-card-audio`)

- [ ] **Step 1: Add `.tp-card-word` and `.tp-card-toggle` styles**

Insert after the `.tp-meaning` block (after line 462) in `web/src/index.css`:

```css
.tp-card-word {
  text-align: center;
  margin-bottom: 24px;
  font-size: 32px;
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 4px;
  color: #e5e7eb;
}
.tp-card-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 3;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: color 0.2s ease;
}
.tp-card-toggle:hover {
  color: rgba(255, 255, 255, 0.7);
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/index.css
git commit -m "feat: add CSS styles for typing word display and toggle button"
```

---

### Task 3: Add showWord state to TypingPractice and pass props to TypingCard

**Files:**
- Modify: `web/src/pages/TypingPractice.tsx`

- [ ] **Step 1: Add showWord state**

In `TypingPractice`, add state after the existing state declarations (after line 51):

```ts
const [showWord, setShowWord] = useState(true);
```

- [ ] **Step 2: Pass props to TypingCard**

Update the `<TypingCard>` usage (lines 160-165) to pass the new props:

```tsx
<TypingCard
  key={currentWord.id}
  word={currentWord}
  showWord={showWord}
  onToggleShowWord={() => setShowWord((v) => !v)}
  onComplete={handleComplete}
  onError={handleError}
/>
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/TypingPractice.tsx
git commit -m "feat: add showWord state to TypingPractice page"
```

---

### Task 4: Update TypingCard to display word text and toggle button

**Files:**
- Modify: `web/src/components/typing/TypingCard.tsx`

- [ ] **Step 1: Update imports and props interface**

Replace the import line for lucide-react (line 6) and update the interface:

```tsx
import { Volume2, Eye, EyeOff } from "lucide-react";
```

Update the `TypingCardProps` interface:

```ts
interface TypingCardProps {
  word: Word;
  showWord: boolean;
  onToggleShowWord: () => void;
  onComplete: () => void;
  onError: () => void;
}
```

Update the function signature:

```ts
export default function TypingCard({ word, showWord, onToggleShowWord, onComplete, onError }: TypingCardProps) {
```

- [ ] **Step 2: Add toggle button and word display line to the card**

Inside the `<div className="tp-card-inner">`, add the toggle button as the first child, and add the word display line after the hint div. The full inner content becomes:

```tsx
<div className="tp-card-inner">
  <button
    className="tp-card-toggle"
    onClick={onToggleShowWord}
    title={showWord ? t.typing.hideWord : t.typing.showWord}
  >
    {showWord ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
  </button>

  <div className="tp-card-hint">
    {word.pos && <span className="tp-pos">{word.pos}</span>}
    {word.meaning_cn && <span className="tp-meaning">{word.meaning_cn}</span>}
  </div>

  <AnimatePresence>
    {showWord && (
      <motion.div
        key="word-display"
        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
        animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="tp-card-word"
      >
        {word.word}
      </motion.div>
    )}
  </AnimatePresence>

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
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/typing/TypingCard.tsx
git commit -m "feat: add word display line and toggle button to TypingCard"
```

---

### Task 5: Verify and lint

- [ ] **Step 1: Run lint**

```bash
cd web && bun run lint
```

Expected: No errors related to the changed files.

- [ ] **Step 2: Run build to verify no type errors**

```bash
cd web && bun run build
```

Expected: Build succeeds with no errors.
