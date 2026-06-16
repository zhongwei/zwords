# Word Audio BLOB Storage & Playback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store UK/US `.opus` pronunciation audio as BLOBs in the `words` table, expose them via a dedicated streaming endpoint, and add play buttons to the word-detail and review pages.

**Architecture:** Two nullable BLOB columns (`audio_uk`, `audio_us`) are added to `words`. A new idempotent Python script (`scripts/add_audio_to_db.py`) backfills the blobs from `audio/{uk,us}/*.opus` without disturbing `learning_status`. A new axum endpoint `GET /api/words/{id}/audio/{variant}` streams the bytes (`Content-Type: audio/ogg`); the `Word` JSON gains two SQL-computed booleans (`has_audio_uk`/`has_audio_us`) so the UI can hide buttons when audio is absent. Frontend adds inline UK/US `<audio>` controls to `WordDetail` and `Review`.

**Tech Stack:** Rust (axum 0.8, rusqlite 0.31), Python 3 stdlib (sqlite3/re/os), React 19 + TypeScript + Tailwind v4 + lucide-react.

**Spec:** [`docs/superpowers/specs/2026-06-16-word-audio-blob-storage-design.md`](../specs/2026-06-16-word-audio-blob-storage-design.md)

---

## Test Strategy (read first)

The project has **no test infrastructure** in any language today (no `#[test]` in Rust, no Python test runner, no vitest/jest in `web/`). To honor TDD where it is high-value and cheap, and avoid forcing unscaffolded test frameworks elsewhere:

- **Rust service layer:** real TDD via `#[cfg(test)]` + `rusqlite::Connection::open_in_memory()`. This is the core logic (variant dispatch, blob fetch, missing-word/missing-blob distinction) and is trivially testable.
- **Rust handler / route:** verified by `cargo build` + manual `curl` (consistent with the project's existing handler style — no http-body test harness exists).
- **Python migration:** verified by a built-in `--dry-run` mode (prints match counts without writing) + post-run row-count assertions via a Python one-liner. No pytest.
- **Frontend:** verified by `bun run lint` + `cargo build` (which re-embeds `web/dist`) + manual click-test. No vitest.

This matches the approved spec's acceptance criteria (§7), which are behavioral, not unit-test-based.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `scripts/import_yaml_to_sqlite.py` | Modify | Add `audio_uk BLOB`, `audio_us BLOB` to `SCHEMA` so destructive rebuilds keep the columns |
| `scripts/add_audio_to_db.py` | Create | Idempotent incremental migration: add columns if missing, backfill blobs from `audio/`, report |
| `.gitignore` | Modify | Stop tracking `words.db` (now ~80 MB, fully regenerable) |
| `src/services/words.rs` | Modify | Add `get_word_audio`; extend `list_words` + `get_word` SELECTs with `has_audio_*` computed columns |
| `src/handlers/words.rs` | Modify | Add `get_word_audio` handler (streams bytes) |
| `src/main.rs` | Modify | Register `/api/words/{id}/audio/{variant}` route |
| `src/models.rs` | Modify | Add `has_audio_uk`, `has_audio_us` to `Word` |
| `web/src/lib/types.ts` | Modify | Add `has_audio_uk`, `has_audio_us` to `Word` |
| `web/src/lib/audio.ts` | Create | Tiny `audioUrl(wordId, variant)` helper (shared URL builder) |
| `web/src/locales/en.ts`, `web/src/locales/zh.ts` | Modify | Add `audio.uk` / `audio.us` labels |
| `web/src/pages/WordDetail.tsx` | Modify | Inline UK/US play buttons next to phonetic line |
| `web/src/pages/Review.tsx` | Modify | Inline UK/US play buttons under the review card |

---

## Task 1: Sync BLOB columns into the destructive import script

**Files:**
- Modify: `scripts/import_yaml_to_sqlite.py:11-64` (the `SCHEMA` constant)

- [ ] **Step 1: Add the two BLOB columns to the `words` table in `SCHEMA`**

In `scripts/import_yaml_to_sqlite.py`, inside the `SCHEMA = """ ... """` block, change the `CREATE TABLE IF NOT EXISTS words (...)` so the column list ends with the two new BLOB columns. Replace the block:

```python
CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('toefl', 'gre')),
    stage INTEGER,
    phonetic TEXT,
    pos TEXT,
    meaning_cn TEXT,
    meaning_en TEXT,
    root TEXT,
    association TEXT,
    collocations TEXT,
    derivatives TEXT,
    "references" TEXT,
    audio_uk BLOB,
    audio_us BLOB,
    UNIQUE(word, source) ON CONFLICT IGNORE
);
```

(Only the two `audio_*` lines are new; everything else in the file is unchanged. The `examples`, `synonyms`, `learning_status` tables and indexes stay as-is.)

- [ ] **Step 2: Verify syntax (do NOT run the script — it deletes the DB)**

Run:
```bash
python -c "import ast; ast.parse(open('scripts/import_yaml_to_sqlite.py', encoding='utf-8').read()); print('OK')"
```
Expected output: `OK`

> **Why not run it:** `import_yaml_to_sqlite.py` does `os.remove(DB_PATH)` on line 160-161, which would wipe the user's existing `learning_status`. We verify by syntax parse only. The columns will actually be created on the live DB by the migration script in Task 2.

- [ ] **Step 3: Commit**

```bash
git add scripts/import_yaml_to_sqlite.py
git commit -m "feat(db): add audio_uk/audio_us BLOB columns to import schema"
```

---

## Task 2: Create the incremental migration script

**Files:**
- Create: `scripts/add_audio_to_db.py`

- [ ] **Step 1: Write the full script**

Create `scripts/add_audio_to_db.py` with this exact content:

```python
#!/usr/bin/env python3
"""Idempotently backfill words.audio_uk / audio_us from audio/{uk,us}/*.opus.

Non-destructive: preserves learning_status and all existing data. Safe to re-run.
Adds the BLOB columns via ALTER TABLE if missing, then UPDATEs each word whose
sanitized name matches a file. Supports --dry-run to report matches without writing.
"""
import argparse
import os
import re
import sqlite3
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_DIR, "words.db")
AUDIO_DIR = os.path.join(PROJECT_DIR, "audio")
COLUMNS = ("audio_uk", "audio_us")  # (column, subdir) pairs below
VARIANTS = [("audio_uk", "uk"), ("audio_us", "us")]


def sanitize(word: str) -> str:
    """Match the rule in scripts/download_pronunciation.py exactly."""
    s = re.sub(r"[^a-zA-Z0-9-]", "_", word).strip("_.")
    return s or "_"


def column_exists(conn: sqlite3.Connection, column: str) -> bool:
    rows = conn.execute("PRAGMA table_info(words)").fetchall()
    return any(r[1] == column for r in rows)


def ensure_columns(conn: sqlite3.Connection) -> list[str]:
    added = []
    for col, _ in VARIANTS:
        if not column_exists(conn, col):
            conn.execute(f"ALTER TABLE words ADD COLUMN {col} BLOB")
            added.append(col)
    conn.commit()
    return added


def build_file_map(subdir: str) -> dict[str, str]:
    """Map sanitized stem -> absolute path for audio/<subdir>/*.opus."""
    folder = os.path.join(AUDIO_DIR, subdir)
    result: dict[str, str] = {}
    if not os.path.isdir(folder):
        return result
    for name in os.listdir(folder):
        if name.endswith(".opus"):
            stem = name[:-len(".opus")]
            result[stem] = os.path.join(folder, name)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report only, do not write")
    args = parser.parse_args()

    if not os.path.exists(DB_PATH):
        print(f"ERROR: {DB_PATH} not found", file=sys.stderr)
        return 1

    conn = sqlite3.connect(DB_PATH)

    added = ensure_columns(conn)
    if added:
        print(f"Added columns: {', '.join(added)}")
    else:
        print("Columns already present (no ALTER needed).")

    maps = {sub: build_file_map(sub) for _, sub in VARIANTS}
    for _, sub in VARIANTS:
        print(f"  audio/{sub}/*.opus files found: {len(maps[sub])}")

    rows = conn.execute("SELECT id, word FROM words").fetchall()
    total = len(rows)
    print(f"DB words: {total}")

    matched = {"audio_uk": 0, "audio_us": 0}
    orphan_uk = set(maps["uk"]) - {sanitize(w) for _, w in rows}
    orphan_us = set(maps["us"]) - {sanitize(w) for _, w in rows}

    if args.dry_run:
        for word_id, word in rows:
            stem = sanitize(word)
            for col, sub in VARIANTS:
                if stem in maps[sub]:
                    matched[col] += 1
        print("\n[DRY RUN] No changes written.")
        for col, sub in VARIANTS:
            print(f"  would set {col}: {matched[col]} / {total}")
        print(f"  orphan files (no matching DB word) uk: {len(orphan_uk)}, us: {len(orphan_us)}")
        conn.close()
        return 0

    batch = 0
    for word_id, word in rows:
        stem = sanitize(word)
        uk_path = maps["uk"].get(stem)
        us_path = maps["us"].get(stem)
        uk_bytes = open(uk_path, "rb").read() if uk_path else None
        us_bytes = open(us_path, "rb").read() if us_path else None
        if uk_bytes is None and us_bytes is None:
            continue
        conn.execute(
            "UPDATE words SET audio_uk = ?, audio_us = ? WHERE id = ?",
            (uk_bytes, us_bytes, word_id),
        )
        if uk_bytes is not None:
            matched["audio_uk"] += 1
        if us_bytes is not None:
            matched["audio_us"] += 1
        batch += 1
        if batch % 500 == 0:
            conn.commit()
    conn.commit()

    print("\nDone.")
    for col, sub in VARIANTS:
        print(f"  {col} set: {matched[col]} / {total}")
    print(f"  orphan files (no matching DB word) uk: {len(orphan_uk)}, us: {len(orphan_us)}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Verify syntax**

Run:
```bash
python -c "import ast; ast.parse(open('scripts/add_audio_to_db.py', encoding='utf-8').read()); print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Dry-run to confirm match counts before touching data**

Run:
```bash
python scripts/add_audio_to_db.py --dry-run
```
Expected: prints `audio/uk/*.opus files found: 6889`, `audio/us/*.opus files found: 8466`, and `would set audio_uk: <N>` / `would set audio_us: <M>` where `N` and `M` are close to 6889 / 8466 (slightly less if some files are orphans with no matching DB word). Column-add line and "no ALTER needed" line both acceptable depending on current DB state.

> If the dry-run reports 0 matches, STOP — the `sanitize()` rule or DB `word` casing differs from expectation; investigate before running for real.

- [ ] **Step 4: Commit the script**

```bash
git add scripts/add_audio_to_db.py
git commit -m "feat(scripts): add idempotent audio BLOB migration script"
```

---

## Task 3: Stop tracking words.db (now ~80 MB and fully regenerable)

**Files:**
- Modify: `.gitignore` (the `# SQLite runtime files` section around line 50)

**Rationale:** `words.db` is currently tracked (committed at 3.5 MB in `a51f069`). After Task 4 backfills 77 MB of Opus blobs, committing it would permanently bloat the repo. The DB is fully regenerable from `import_yaml_to_sqlite.py` + `add_audio_to_db.py`, so it should be a derived artifact, not source. (Flagged in handoff — this is a deliberate consequence of the BLOB decision and was not in the approved spec.)

- [ ] **Step 1: Add `words.db` to `.gitignore`**

In `.gitignore`, find the existing SQLite block:
```
# SQLite runtime files (regenerate on every server run with WAL mode)
words.db-shm
words.db-wal
```
Change it to:
```
# SQLite database (regenerable via scripts/import_yaml_to_sqlite.py + scripts/add_audio_to_db.py)
words.db
words.db-shm
words.db-wal
```

- [ ] **Step 2: Untrack the file from git (keeps the local copy)**

Run:
```bash
git rm --cached words.db
```
Expected: `rm 'words.db'` (the working-tree file remains on disk).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: stop tracking words.db (regenerable, will grow to ~80MB with audio blobs)"
```

---

## Task 4: Run the migration on the live DB

**Files:** none (data only — `words.db` is now gitignored)

- [ ] **Step 1: Record pre-migration learning_status count**

Run:
```bash
python -c "import sqlite3; c=sqlite3.connect('words.db'); print('learning_status rows:', c.execute('SELECT COUNT(*) FROM learning_status').fetchone()[0])"
```
Expected: a positive integer (remember it for the post-check).

- [ ] **Step 2: Run the migration for real**

Run:
```bash
python scripts/add_audio_to_db.py
```
Expected: `audio_uk set:` ≈ 6889, `audio_us set:` ≈ 8466 (within a few of file counts; difference = orphan files). Runtime ~30–90 s.

- [ ] **Step 3: Verify blob counts and learning_status preservation**

Run:
```bash
python -c "import sqlite3,os; c=sqlite3.connect('words.db'); print('uk blobs:', c.execute('SELECT COUNT(*) FROM words WHERE audio_uk IS NOT NULL').fetchone()[0]); print('us blobs:', c.execute('SELECT COUNT(*) FROM words WHERE audio_us IS NOT NULL').fetchone()[0]); print('learning_status rows:', c.execute('SELECT COUNT(*) FROM learning_status').fetchone()[0]); print('db size MB:', round(os.path.getsize('words.db')/1048576, 1))"
```
Expected:
- `uk blobs:` ≈ 6889
- `us blobs:` ≈ 8466
- `learning_status rows:` **identical** to Step 1's value (data preserved)
- `db size MB:` roughly 70–90

- [ ] **Step 4: Verify a known word's blob is real Ogg-Opus**

Run:
```bash
python -c "import sqlite3; c=sqlite3.connect('words.db'); b=c.execute(\"SELECT audio_uk FROM words WHERE word='abandon'\").fetchone()[0]; print('magic:', b[:4].hex(), 'len:', len(b))"
```
Expected: `magic: 4f676753` (= ASCII `OggS`) and a length of a few thousand bytes. (If `abandon` has no UK audio, pick another common word.)

No commit — `words.db` is gitignored.

---

## Task 5: Add `get_word_audio` service function with TDD

**Files:**
- Modify: `src/services/words.rs` (add function + `#[cfg(test)]` module at the end)

- [ ] **Step 1: Write the failing tests**

Append to `src/services/words.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE words (id INTEGER PRIMARY KEY, word TEXT, audio_uk BLOB, audio_us BLOB)",
        )
        .unwrap();
        conn
    }

    #[test]
    fn audio_returns_blob_when_present() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO words (id, word, audio_uk, audio_us) VALUES (1, 'abandon', X'DEADBEEF', NULL)",
            [],
        )
        .unwrap();
        let bytes = get_word_audio(&conn, 1, "uk").unwrap().unwrap();
        assert_eq!(bytes, vec![0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn audio_returns_none_when_blob_is_null() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO words (id, word, audio_uk, audio_us) VALUES (1, 'x', NULL, NULL)",
            [],
        )
        .unwrap();
        assert_eq!(get_word_audio(&conn, 1, "us").unwrap(), None);
    }

    #[test]
    fn audio_missing_word_is_not_found_error() {
        let conn = setup_db();
        let err = get_word_audio(&conn, 999, "uk").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn audio_invalid_variant_is_not_found_error() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO words (id, word, audio_uk, audio_us) VALUES (1, 'x', NULL, NULL)",
            [],
        )
        .unwrap();
        let err = get_word_audio(&conn, 1, "foo").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cargo test --lib get_word_audio
```
Expected: **compile error** — `cannot find function get_word_audio`. (Tests fail because the function does not exist yet.)

- [ ] **Step 3: Implement `get_word_audio`**

Add this function to `src/services/words.rs` (anywhere at module level, e.g. just before the `#[cfg(test)]` module or after `delete_word`):

```rust
pub fn get_word_audio(
    conn: &Connection,
    id: i64,
    variant: &str,
) -> Result<Option<Vec<u8>>, AppError> {
    // Column name is selected from a fixed allow-list (not user input), so dynamic
    // SQL string interpolation here is safe from injection.
    let column = match variant {
        "uk" => "audio_uk",
        "us" => "audio_us",
        _ => return Err(AppError::NotFound(format!("Unknown audio variant: {}", variant))),
    };
    let sql = format!("SELECT {} FROM words WHERE id = ?1", column);
    match conn.query_row(&sql, params![id], |row| row.get::<_, Option<Vec<u8>>>(0)) {
        Ok(blob) => Ok(blob),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Err(AppError::NotFound(format!("Word {} not found", id)))
        }
        Err(e) => Err(e.into()),
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cargo test --lib get_word_audio
```
Expected: `4 passed` (or `test result: ok. 4 passed`).

- [ ] **Step 5: Commit**

```bash
git add src/services/words.rs
git commit -m "feat(words): add get_word_audio service with unit tests"
```

---

## Task 6: Wire the audio endpoint (handler + route)

**Files:**
- Modify: `src/handlers/words.rs` (add handler; extend the `use` block)
- Modify: `src/main.rs:22-23` (add route)

- [ ] **Step 1: Add the handler**

In `src/handlers/words.rs`, extend the top `use` block. Replace:

```rust
use axum::extract::{Path, Query, State};
use axum::Json;
```

with:

```rust
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::Response;
use axum::Json;
```

Then append this handler at the end of the file (after `delete_word`):

```rust
pub async fn get_word_audio(
    State(db): State<Db>,
    Path((id, variant)): Path<(i64, String)>,
) -> Result<Response, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let blob = services::words::get_word_audio(&conn, id, &variant)?;
    match blob {
        Some(bytes) => {
            let len = bytes.len();
            let mut resp = Response::new(Body::from(bytes));
            resp.headers_mut()
                .insert(header::CONTENT_TYPE, "audio/ogg".parse().unwrap());
            resp.headers_mut()
                .insert(header::CONTENT_LENGTH, len.to_string().parse().unwrap());
            Ok(resp)
        }
        None => Err(AppError::NotFound(format!(
            "Audio '{}' for word {} not found",
            variant, id
        ))),
    }
}
```

> The return type `Result<Response, AppError>` works because both `Response` (identity) and `AppError` (its `IntoResponse` impl) implement `IntoResponse`, so the `Result` does too. Error path yields the existing JSON 404 body; success path returns raw bytes with 200.

- [ ] **Step 2: Register the route**

In `src/main.rs`, replace:

```rust
        .route("/api/words/{id}", get(handlers::words::get_word).put(handlers::words::update_word).delete(handlers::words::delete_word))
```

with:

```rust
        .route("/api/words/{id}", get(handlers::words::get_word).put(handlers::words::update_word).delete(handlers::words::delete_word))
        .route("/api/words/{id}/audio/{variant}", get(handlers::words::get_word_audio))
```

- [ ] **Step 3: Build (this also re-embeds `web/dist` via build.rs)**

Run:
```bash
cargo build
```
Expected: compiles cleanly. (If `web/dist` is stale, `build.rs` runs `bun install && bun run build` first — that is expected and fine.)

- [ ] **Step 4: Smoke-test the endpoint**

In one terminal:
```bash
cargo run
```
In another:
```bash
curl -s -o /dev/null -w "uk: %{http_code} %{content_type}\n" http://localhost:8000/api/words/1/audio/uk
curl -s http://localhost:8000/api/words/1/audio/uk | xxd | head -1
curl -s -o /dev/null -w "bad variant: %{http_code}\n" http://localhost:8000/api/words/1/audio/foo
```
Expected:
- `uk: 200 audio/ogg` (if word id 1 has UK audio) OR `uk: 404 application/json` (if id 1 has no UK audio — acceptable; pick an id known to have audio, e.g. from Task 4's `abandon`)
- first bytes `4f67 6753` (`OggS`) when 200
- `bad variant: 404`

Stop the server (`Ctrl+C`) when done.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/words.rs src/main.rs
git commit -m "feat(api): add GET /api/words/{id}/audio/{variant} streaming endpoint"
```

---

## Task 7: Expose `has_audio_uk` / `has_audio_us` on `Word`

**Files:**
- Modify: `src/models.rs:3-18` (the `Word` struct)
- Modify: `src/services/words.rs:42-47` (list SELECT) and `:54-69` (list row mapping) and `:77` (get SELECT) and `:79-93` (get row mapping)

> **Order matters:** this task changes the `Word` struct AND both SELECTs AND both row mappings together so the crate still compiles after the step. rusqlite reads by **positional index** (`row.get(0)?`, `row.get(1)?`, …), so the new columns go at the **end** (positions 13 and 14) to avoid renumbering existing reads.

- [ ] **Step 1: Add the two fields to `Word`**

In `src/models.rs`, replace:

```rust
    pub derivatives: Option<String>,
    pub references: Option<String>,
}
```
(the close of `pub struct Word { ... }`)

with:

```rust
    pub derivatives: Option<String>,
    pub references: Option<String>,
    pub has_audio_uk: bool,
    pub has_audio_us: bool,
}
```

- [ ] **Step 2: Extend the `list_words` SELECT and row mapping**

In `src/services/words.rs`, replace the `query_sql` format string (lines ~42-47):

```rust
    let query_sql = format!(
        "SELECT w.id, w.word, w.source, w.stage, w.phonetic, w.pos, w.meaning_cn, w.meaning_en, w.root, w.association, w.collocations, w.derivatives, w.\"references\" \
         FROM words w LEFT JOIN learning_status ls ON w.id = ls.word_id \
         {} ORDER BY w.id LIMIT ?{} OFFSET ?{}",
        where_sql, param_values.len() + 1, param_values.len() + 2
    );
```

with:

```rust
    let query_sql = format!(
        "SELECT w.id, w.word, w.source, w.stage, w.phonetic, w.pos, w.meaning_cn, w.meaning_en, w.root, w.association, w.collocations, w.derivatives, w.\"references\", \
         w.audio_uk IS NOT NULL AS has_audio_uk, w.audio_us IS NOT NULL AS has_audio_us \
         FROM words w LEFT JOIN learning_status ls ON w.id = ls.word_id \
         {} ORDER BY w.id LIMIT ?{} OFFSET ?{}",
        where_sql, param_values.len() + 1, param_values.len() + 2
    );
```

Then in the same function, extend the `query_map` closure. Replace:

```rust
        Ok(Word {
            id: row.get(0)?,
            word: row.get(1)?,
            source: row.get(2)?,
            stage: row.get(3)?,
            phonetic: row.get(4)?,
            pos: row.get(5)?,
            meaning_cn: row.get(6)?,
            meaning_en: row.get(7)?,
            root: row.get(8)?,
            association: row.get(9)?,
            collocations: row.get(10)?,
            derivatives: row.get(11)?,
            references: row.get(12)?,
        })
```

with:

```rust
        Ok(Word {
            id: row.get(0)?,
            word: row.get(1)?,
            source: row.get(2)?,
            stage: row.get(3)?,
            phonetic: row.get(4)?,
            pos: row.get(5)?,
            meaning_cn: row.get(6)?,
            meaning_en: row.get(7)?,
            root: row.get(8)?,
            association: row.get(9)?,
            collocations: row.get(10)?,
            derivatives: row.get(11)?,
            references: row.get(12)?,
            has_audio_uk: row.get(13)?,
            has_audio_us: row.get(14)?,
        })
```

- [ ] **Step 3: Extend the `get_word` SELECT and row mapping**

In `src/services/words.rs` `get_word`, replace the SELECT (line ~77):

```rust
        "SELECT id, word, source, stage, phonetic, pos, meaning_cn, meaning_en, root, association, collocations, derivatives, \"references\" FROM words WHERE id = ?1",
```

with:

```rust
        "SELECT id, word, source, stage, phonetic, pos, meaning_cn, meaning_en, root, association, collocations, derivatives, \"references\", audio_uk IS NOT NULL AS has_audio_uk, audio_us IS NOT NULL AS has_audio_us FROM words WHERE id = ?1",
```

Then extend that row mapping. Replace:

```rust
            references: row.get(12)?,
        }),
    ).map_err(|_| AppError::NotFound(format!("Word {} not found", id)))?;
```

with:

```rust
            references: row.get(12)?,
            has_audio_uk: row.get(13)?,
            has_audio_us: row.get(14)?,
        }),
    ).map_err(|_| AppError::NotFound(format!("Word {} not found", id)))?;
```

- [ ] **Step 4: Build and run all tests**

Run:
```bash
cargo build && cargo test --lib
```
Expected: clean build; all tests pass (the 4 `get_word_audio` tests plus any others).

- [ ] **Step 5: Verify the JSON shape**

```bash
cargo run
```
In another terminal:
```bash
curl -s http://localhost:8000/api/words/1 | python -c "import sys,json; d=json.load(sys.stdin); print('keys:', sorted(d.keys())); print('has_audio_uk:', d['has_audio_uk'], 'has_audio_us:', d['has_audio_us'])"
```
Expected: `has_audio_uk` and `has_audio_us` are present in `keys` and are booleans. No `audio_uk`/`audio_us` binary keys leak into the JSON.

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/models.rs src/services/words.rs
git commit -m "feat(api): expose has_audio_uk/has_audio_us on Word"
```

---

## Task 8: Frontend — types, helper, locales

**Files:**
- Modify: `web/src/lib/types.ts:1-15`
- Create: `web/src/lib/audio.ts`
- Modify: `web/src/locales/en.ts`
- Modify: `web/src/locales/zh.ts`

- [ ] **Step 1: Add the two boolean fields to the `Word` interface**

In `web/src/lib/types.ts`, replace:

```ts
  derivatives: string | null;
  references: string | null;
}
```
(end of `interface Word`)

with:

```ts
  derivatives: string | null;
  references: string | null;
  has_audio_uk: boolean;
  has_audio_us: boolean;
}
```

- [ ] **Step 2: Create the URL helper**

Create `web/src/lib/audio.ts` with this exact content:

```ts
export function audioUrl(wordId: number, variant: "uk" | "us"): string {
  return `/api/words/${wordId}/audio/${variant}`;
}
```

- [ ] **Step 3: Add locale keys (English)**

In `web/src/locales/en.ts`, replace:

```ts
  quiz: {
```

with:

```ts
  audio: {
    uk: "UK",
    us: "US",
  },
  quiz: {
```

- [ ] **Step 4: Add locale keys (Chinese — must mirror English exactly; type is `typeof zh`)**

In `web/src/locales/zh.ts`, add the same `audio` block before `quiz:` (open the file first to find the exact surrounding text; mirror the structure of `en.ts`). The block is:

```ts
  audio: {
    uk: "英式",
    us: "美式",
  },
```

> The `Translations` type is inferred from `typeof zh` (see `web/src/lib/i18n.tsx:6`), so `zh.ts` and `en.ts` MUST have identical key shapes or TypeScript will error. Add the block to **both** files.

- [ ] **Step 5: Lint**

Run:
```bash
bun run lint
```
(workdir: `web/`)
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/audio.ts web/src/locales/en.ts web/src/locales/zh.ts
git commit -m "feat(web): add has_audio fields, audio URL helper, uk/us locale labels"
```

---

## Task 9: Frontend — play buttons on WordDetail

**Files:**
- Modify: `web/src/pages/WordDetail.tsx` (imports + the phonetic block at lines ~87-91)

> Per the approved spec (§6.2), playback state is **inline** (no shared hook/component) — the two call sites don't justify a shared abstraction yet. Each page holds its own `<audio>` ref + `playingVariant` state. The URL helper (`audioUrl`) is the only shared bit.

- [ ] **Step 1: Add imports**

In `web/src/pages/WordDetail.tsx`, replace the import block:

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
```

with:

```tsx
import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useWord } from "@/hooks/useWords";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Volume2 } from "lucide-react";
import { audioUrl } from "@/lib/audio";
import ParallaxCard from "@/components/word-detail/ParallaxCard";
import WordField from "@/components/word-detail/WordField";
import ExampleQuote from "@/components/word-detail/ExampleQuote";
import { FIELD_THEMES } from "@/components/word-detail/fieldTheme";
```

- [ ] **Step 2: Add the playback hooks (must be before the early returns)**

> **Rules of Hooks:** `useRef`/`useState` run on every render and must come **before** any `if (...) return` early-return. In `WordDetail.tsx` the early returns are the `if (isLoading)` / `if (!data)` blocks (lines ~21-31); the `word` destructure (`const { word, ... } = data;`) is at line ~33, **after** those returns. So the hooks go at the top; the `play` function (which needs `word.id`) goes after the destructure.

In `export default function WordDetail()`, immediately after `const { data, isLoading } = useWord(Number(id));` add **only the hooks**:

```tsx
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingVariant, setPlayingVariant] = useState<"uk" | "us" | null>(null);
```

Then, **after** the `const { word, examples, synonyms, learning_status } = data;` destructure (so `word` is in scope), add the `play` function:

```tsx
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
```

- [ ] **Step 3: Render the buttons + a hidden `<audio>` element**

Replace the phonetic block:

```tsx
            {phoneticLine && (
              <div className="wd-phonetic" style={z(35)}>
                {phoneticLine}
              </div>
            )}
```

with:

```tsx
            <div className="flex items-center justify-center gap-3" style={z(35)}>
              {phoneticLine && <div className="wd-phonetic">{phoneticLine}</div>}
              {word.has_audio_uk && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.audio.uk}
                  onClick={(e) => { e.stopPropagation(); play("uk"); }}
                  className={playingVariant === "uk" ? "text-violet-300" : "text-gray-400 hover:text-white"}
                >
                  <Volume2 className="h-4 w-4" />
                  <span className="ml-1 text-xs">{t.audio.uk}</span>
                </Button>
              )}
              {word.has_audio_us && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.audio.us}
                  onClick={(e) => { e.stopPropagation(); play("us"); }}
                  className={playingVariant === "us" ? "text-violet-300" : "text-gray-400 hover:text-white"}
                >
                  <Volume2 className="h-4 w-4" />
                  <span className="ml-1 text-xs">{t.audio.us}</span>
                </Button>
              )}
              <audio
                ref={audioRef}
                onEnded={() => setPlayingVariant(null)}
              />
            </div>
```

> `e.stopPropagation()` guards against any ancestor click handler. The `Volume2` icon is already a project dependency (`lucide-react`).

- [ ] **Step 4: Lint**

Run:
```bash
bun run lint
```
(workdir: `web/`)
Expected: no errors.

- [ ] **Step 5: Build to re-embed**

Run:
```bash
cargo build
```
Expected: clean. (`build.rs` runs `bun run build` because `web/src` is newer than `web/dist`.)

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/WordDetail.tsx
git commit -m "feat(web): add UK/US audio buttons to word detail page"
```

---

## Task 10: Frontend — play buttons on Review

**Files:**
- Modify: `web/src/pages/Review.tsx` (imports + the card area around lines 91-105)

> `Review.tsx` renders the word inside a 3D `<Canvas>` (`Card3D`). HTML buttons can't live inside the canvas, so the UK/US row goes **below** the card (between the card's `h-80` wrapper and the flip-hint area is visually busy; placing it directly under the card wrapper is cleanest).

- [ ] **Step 1: Add imports**

In `web/src/pages/Review.tsx`, replace:

```tsx
import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { useNextReview } from "@/hooks/useWords";
import { api } from "@/lib/api";
import Card3D from "@/components/shared/Card3D";
import ParticleExplosion from "@/components/shared/ParticleExplosion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
```

with:

```tsx
import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { useNextReview } from "@/hooks/useWords";
import { api } from "@/lib/api";
import { audioUrl } from "@/lib/audio";
import Card3D from "@/components/shared/Card3D";
import ParticleExplosion from "@/components/shared/ParticleExplosion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Volume2 } from "lucide-react";
```

- [ ] **Step 2: Add playback state inside `Review()`**

In `Review()`, after the existing state declarations:

```tsx
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [explosion, setExplosion] = useState(false);
  const [explosionSuccess, setExplosionSuccess] = useState(true);
```

add:

```tsx
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingVariant, setPlayingVariant] = useState<"uk" | "us" | null>(null);

  const play = useCallback(
    (variant: "uk" | "us") => {
      const el = audioRef.current;
      if (!el || !current) return;
      if (playingVariant === variant) {
        el.pause();
        setPlayingVariant(null);
        return;
      }
      el.src = audioUrl(current.word.id, variant);
      el.play().then(() => setPlayingVariant(variant)).catch(() => setPlayingVariant(null));
    },
    [current, playingVariant]
  );
```

- [ ] **Step 3: Reset playback state when the card advances**

In the `handleAnswer` `setTimeout` callback, after `setFlipped(false);` (the branch that advances to the next card), also reset audio. Replace:

```tsx
          if (currentIndex < total - 1) {
            setCurrentIndex(currentIndex + 1);
            setFlipped(false);
          } else {
```

with:

```tsx
          if (currentIndex < total - 1) {
            setCurrentIndex(currentIndex + 1);
            setFlipped(false);
            if (audioRef.current) audioRef.current.pause();
            setPlayingVariant(null);
          } else {
```

- [ ] **Step 4: Render the audio row + hidden `<audio>` element under the card**

Replace the card block:

```tsx
      <div className="w-full max-w-lg">
        <p className="mb-3 text-center text-sm text-gray-500">{t.review.clickToFlip}</p>
        <div className="h-80">
          <Card3D
            front={current.word.word}
            back={
              current.word.meaning_cn ||
              current.word.meaning_en ||
              "—"
            }
            subtext={current.word.phonetic || undefined}
            onClick={() => setFlipped(!flipped)}
          />
        </div>
      </div>
```

with:

```tsx
      <div className="w-full max-w-lg">
        <p className="mb-3 text-center text-sm text-gray-500">{t.review.clickToFlip}</p>
        <div className="h-80">
          <Card3D
            front={current.word.word}
            back={
              current.word.meaning_cn ||
              current.word.meaning_en ||
              "—"
            }
            subtext={current.word.phonetic || undefined}
            onClick={() => setFlipped(!flipped)}
          />
        </div>
        {(current.word.has_audio_uk || current.word.has_audio_us) && (
          <div className="mt-3 flex items-center justify-center gap-3">
            {current.word.has_audio_uk && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.audio.uk}
                onClick={() => play("uk")}
                className={playingVariant === "uk" ? "text-violet-300" : "text-gray-400 hover:text-white"}
              >
                <Volume2 className="h-4 w-4" />
                <span className="ml-1 text-xs">{t.audio.uk}</span>
              </Button>
            )}
            {current.word.has_audio_us && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.audio.us}
                onClick={() => play("us")}
                className={playingVariant === "us" ? "text-violet-300" : "text-gray-400 hover:text-white"}
              >
                <Volume2 className="h-4 w-4" />
                <span className="ml-1 text-xs">{t.audio.us}</span>
              </Button>
            )}
            <audio
              ref={audioRef}
              onEnded={() => setPlayingVariant(null)}
            />
          </div>
        )}
      </div>
```

- [ ] **Step 5: Lint and build**

Run:
```bash
bun run lint
cargo build
```
(`bun run lint` workdir: `web/`)
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Review.tsx
git commit -m "feat(web): add UK/US audio buttons to review page"
```

---

## Task 11: End-to-end verification

**Files:** none

- [ ] **Step 1: Start the backend (serves embedded frontend)**

```bash
cargo run
```

- [ ] **Step 2: API checks**

```bash
curl -s -o /dev/null -w "uk: %{http_code} %{content_type}\n" http://localhost:8000/api/words/1/audio/uk
curl -s -o /dev/null -w "bad variant: %{http_code}\n" http://localhost:8000/api/words/1/audio/foo
```
Expected: `uk: 200 audio/ogg` (or 404 if id 1 lacks audio — then substitute a known id); `bad variant: 404`.

- [ ] **Step 3: UI checks (open http://localhost:8000 in a browser)**

- Navigate to a word that has audio (e.g. `abandon`) detail page: UK and US buttons appear next to the phonetic line; clicking plays audio; clicking the same button again pauses; the active button is highlighted.
- Navigate to a word without audio: buttons are hidden.
- Go to Review: the UK/US row appears under the card (only for words that have audio); playback works; advancing to the next card stops/reset audio.
- Switch the locale (zh/en): the UK/US labels localize (英式/美式 ↔ UK/US).

- [ ] **Step 4: Final lint/build sweep**

```bash
cargo test --lib
bun run lint
```
(`bun run lint` workdir: `web/`)
Expected: all tests pass; lint clean.

No commit (verification only). If anything surfaced fixes, commit those with clear messages.

---

## Notes for the implementer

- **Do not run `scripts/import_yaml_to_sqlite.py`** during this work — it deletes `words.db` and would destroy the user's `learning_status`. The migration script (`add_audio_to_db.py`) is the only thing that should touch the live DB, and it's non-destructive.
- **The `word.id` in WordDetail's `play()`**: place the `play`/`audioRef` block **after** `const { word, ... } = data;` so `word` is in scope. (Task 9 Step 2 calls this out.)
- **rusqlite reads are positional** — that's why new columns go at the END of the SELECT and get indices 13/14. Never reorder existing columns or existing `row.get(N)` calls.
- **Both locale files must stay shape-identical** or TS (which infers `Translations = typeof zh`) will fail.
- **`format!` for the column name in `get_word_audio`** is safe only because the value comes from a fixed match on `"uk"`/`"us"`, never from user input. Do not "improve" it to accept arbitrary variants.
