# Learning Status Table Design

## Goal

Add a `learning_status` table to `words.db` that tracks per-word learning progress for spaced repetition.

## Schema

```sql
CREATE TABLE IF NOT EXISTS learning_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'learning', 'review', 'mastered')),
    review_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at TEXT,
    next_review_at TEXT,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_learning_status_word_id ON learning_status(word_id);
CREATE INDEX IF NOT EXISTS idx_learning_status_status ON learning_status(status);
CREATE INDEX IF NOT EXISTS idx_learning_status_next_review ON learning_status(next_review_at);
```

## Implementation

- Update `scripts/import_yaml_to_sqlite.py` to add the table and initialize a row for every imported word with `status='new'`
- Re-run the script to regenerate the database
