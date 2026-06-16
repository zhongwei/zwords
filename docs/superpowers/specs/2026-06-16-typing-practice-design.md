# Typing Practice Feature Design

## Overview

Add a word typing practice game to the word detail flow. Users see a word's part of speech and Chinese meaning, hear the pronunciation, and type the word letter by letter. Correctly typed words fade out and auto-advance. Results are persisted to the backend.

## Route & Navigation

- New route: `/words/:id/typing` with component `TypingPractice`
- Entry point: "Typing Practice" button on the WordDetail CoverFlow view, navigating to `/words/:id/typing?page=...&q=...&source=...&status=...` (same list context params as the detail page)
- Back button on the typing page returns to `/words/:id`
- Sidebar does not add a new nav item; this feature is accessed only from word detail

## Page Flow

The page has 3 phases: **Playing** → **Result** → **Error Retry**

### Playing Phase

- Center of screen: word card showing POS badge + Chinese meaning
- Auto-play word pronunciation on each new word (UK/US audio, same as WordDetailCard)
- Below the card: letter grid (one cell per character, underline style like verification code input)
- User types one letter at a time:
  - Correct letter: cell turns green, locked
  - Wrong letter: cell turns red, user must press Backspace to delete before retrying
- When all letters are correct, card fades out with animation, auto-advances to next word
- Top progress bar shows current position / total count

### Result Phase

- Statistics: accuracy rate, total time, average time per word
- Error word list: word, error count, which letters were wrong
- Two buttons: "Restart All" and "Practice Errors Only"

### Error Retry Phase

- Same as Playing phase but only with words that had errors
- After completion, shows Result phase again with updated stats

## Backend API

### POST /api/typing/result

Submit typing practice results.

Request body:
```json
{
  "results": [
    { "word_id": 123, "correct": true, "error_count": 0 },
    { "word_id": 456, "correct": false, "error_count": 3 }
  ],
  "total_time_ms": 120000
}
```

Response: `200 OK` with `{ "updated": 15 }` (count of updated records)

### Persistence Logic

Update existing `learning_status` records — do NOT create a new table:
- For `correct` words: `correct_count += 1`, `review_count += 1`, update `last_reviewed_at`
- For `incorrect` words: `review_count += 1`, update `last_reviewed_at`
- Do NOT trigger SM-2 algorithm — typing practice is supplementary memorization, not equivalent to spaced repetition review. Do not modify `ease_factor`, `interval_days`, `next_review_at`, or `status`
- If no `learning_status` row exists for a word, create one with `status='new'`

### Backend Files to Add/Modify

- `src/handlers/typing.rs` — new handler for `POST /api/typing/result`
- `src/services/typing.rs` — new service with persistence logic
- `src/main.rs` — register new route
- `src/models.rs` — add `TypingResultRequest`, `TypingWordResult` structs

## Frontend Components

```
web/src/
├── pages/TypingPractice.tsx          # Page entry, manages phase switching
├── components/typing/
│   ├── TypingCard.tsx                # Word card (POS + meaning + audio + letter grid)
│   ├── TypingInput.tsx               # Letter grid input component (per-letter state)
│   ├── TypingResult.tsx              # Result stats page (accuracy, time, error list)
│   └── TypingProgress.tsx            # Top progress bar
```

### TypingPractice

1. Uses `useWords(params)` to fetch word list (same params as words list page)
2. Locates current word from URL `:id` in the list, starts practice from that word
3. Maintains state: `currentIndex`, `results[]`, `startTime`
4. On completion: calls `POST /api/typing/result`, shows TypingResult
5. Error retry: filters `results` where `correct=false`, re-enters Playing phase

### TypingInput

- Listens to `keydown` events for letter input
- Maintains `typedChars[]` array, each position has state: `empty | correct | wrong`
- Wrong letters turn red; Backspace sets state back to `empty`
- Non-letter characters (hyphens, spaces, apostrophes) in the word are pre-filled and locked as `correct` — user only types alphabetic characters
- When all positions are `correct`, triggers completion callback

### TypingCard

- Displays POS badge and Chinese meaning
- Plays audio on mount via `<audio>` element using `audioUrl(wordId, variant)`
- Contains TypingInput as child
- On completion: applies fade-out animation (framer-motion `AnimatePresence`), then calls `onComplete`

## Data Flow

```
WordsList → WordDetail → [Typing Practice button] → TypingPractice
                                                        │
                                        useWords(params) fetches list
                                                        │
                                        User types each word letter-by-letter
                                                        │
                                        All words done → POST /api/typing/result
                                                        │
                                        TypingResult shows stats
                                                        │
                                        [Practice Errors Only] → re-enter Playing
```
