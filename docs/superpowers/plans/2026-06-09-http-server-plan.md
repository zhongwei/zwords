# HTTP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an axum-based HTTP server exposing RESTful API over words.db for multi-client access.

**Architecture:** Monolith three-layer: axum handlers → service functions → rusqlite queries. Single binary, reads local SQLite file.

**Tech Stack:** Rust (edition 2024), axum 0.8, rusqlite 0.31 (bundled), tokio, serde, time 0.3, tower/tower-http, tracing.

---

## File Structure

```
src/
├── main.rs              # Server bootstrap, router setup
├── config.rs            # Env-based config (port, db path)
├── db.rs                # Connection pool init
├── models.rs            # Data structs (Word, Example, Synonym, LearningStatus, query params)
├── error.rs             # AppError enum + IntoResponse
├── handlers/
│   ├── mod.rs
│   ├── words.rs         # GET/POST/PUT/DELETE /api/words
│   ├── review.rs        # GET /api/review/next, POST /api/review/:word_id/answer
│   └── quiz.rs          # POST /api/quiz/generate, POST /api/quiz/:id/submit
└── services/
    ├── mod.rs
    ├── words.rs         # CRUD SQL + list query with filters
    ├── review.rs        # SM-2 algorithm + next review fetch
    └── quiz.rs          # Quiz generation + scoring
```

---

### Task 1: Setup Cargo.toml dependencies

**Files:**
- Modify: `Cargo.toml`

- [ ] **Step 1: Update Cargo.toml with all required dependencies**

```toml
[package]
name = "mywords"
version = "0.1.0"
edition = "2024"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.31", features = ["bundled"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace"] }
tracing = "0.1"
tracing-subscriber = "0.3"
time = { version = "0.3", features = ["serde", "formatting", "parsing"] }
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check`
Expected: compiles successfully (may take time to build rusqlite from source)

- [ ] **Step 3: Commit**

```bash
git add Cargo.toml Cargo.lock
git commit -m "chore: add project dependencies"
```

---

### Task 2: Config module

**Files:**
- Create: `src/config.rs`

- [ ] **Step 1: Write config.rs**

```rust
use std::env;

pub struct Config {
    pub host: String,
    pub port: u16,
    pub db_path: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: env::var("MYWORDS_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: env::var("MYWORDS_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            db_path: env::var("MYWORDS_DB_PATH").unwrap_or_else(|_| "./words.db".into()),
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/config.rs
git commit -m "feat: add config module"
```

---

### Task 3: Error module

**Files:**
- Create: `src/error.rs`

- [ ] **Step 1: Write error.rs**

```rust
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

pub enum AppError {
    NotFound(String),
    BadRequest(String),
    Internal(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::NotFound(msg) => write!(f, "{}", msg),
            AppError::BadRequest(msg) => write!(f, "{}", msg),
            AppError::Internal(msg) => write!(f, "{}", msg),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "NOT_FOUND"),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "BAD_REQUEST"),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR"),
        };
        let body = json!({
            "error": {
                "code": code,
                "message": self.to_string(),
            }
        });
        (status, axum::Json(body)).into_response()
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/error.rs
git commit -m "feat: add unified error type"
```

---

### Task 4: Models module

**Files:**
- Create: `src/models.rs`

- [ ] **Step 1: Write models.rs**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Word {
    pub id: i64,
    pub word: String,
    pub source: String,
    pub stage: Option<i32>,
    pub phonetic: Option<String>,
    pub pos: Option<String>,
    pub meaning_cn: Option<String>,
    pub meaning_en: Option<String>,
    pub root: Option<String>,
    pub association: Option<String>,
    pub collocations: Option<String>,
    pub derivatives: Option<String>,
    pub references: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Example {
    pub id: i64,
    pub word_id: i64,
    pub sentence: String,
    pub translation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Synonym {
    pub id: i64,
    pub word_id: i64,
    pub synonym: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LearningStatus {
    pub id: i64,
    pub word_id: i64,
    pub status: String,
    pub review_count: i32,
    pub correct_count: i32,
    pub last_reviewed_at: Option<String>,
    pub next_review_at: Option<String>,
    pub ease_factor: f64,
    pub interval_days: i32,
}

#[derive(Debug, Serialize)]
pub struct WordDetail {
    pub word: Word,
    pub examples: Vec<Example>,
    pub synonyms: Vec<Synonym>,
    pub learning_status: Option<LearningStatus>,
}

#[derive(Debug, Deserialize)]
pub struct ListWordsQuery {
    pub page: Option<u32>,
    pub per_page: Option<u32>,
    pub source: Option<String>,
    pub status: Option<String>,
    pub stage: Option<i32>,
    pub q: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T: Serialize> {
    pub data: Vec<T>,
    pub meta: PaginationMeta,
}

#[derive(Debug, Serialize)]
pub struct PaginationMeta {
    pub page: u32,
    pub per_page: u32,
    pub total: u32,
}

#[derive(Debug, Deserialize)]
pub struct CreateWordRequest {
    pub word: String,
    pub source: String,
    pub stage: Option<i32>,
    pub phonetic: Option<String>,
    pub pos: Option<String>,
    pub meaning_cn: Option<String>,
    pub meaning_en: Option<String>,
    pub root: Option<String>,
    pub association: Option<String>,
    pub collocations: Option<String>,
    pub derivatives: Option<String>,
    pub references: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWordRequest {
    pub stage: Option<i32>,
    pub phonetic: Option<String>,
    pub pos: Option<String>,
    pub meaning_cn: Option<String>,
    pub meaning_en: Option<String>,
    pub root: Option<String>,
    pub association: Option<String>,
    pub collocations: Option<String>,
    pub derivatives: Option<String>,
    pub references: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReviewAnswerRequest {
    pub quality: u32,
}

#[derive(Debug, Deserialize)]
pub struct GenerateQuizRequest {
    pub count: Option<u32>,
    pub source: Option<String>,
    #[serde(rename = "type")]
    pub quiz_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct QuizQuestion {
    pub word_id: i64,
    pub word: String,
    pub question: String,
    pub options: Vec<String>,
    pub correct_index: usize,
}

#[derive(Debug, Serialize)]
pub struct Quiz {
    pub id: i64,
    pub questions: Vec<QuizQuestion>,
}

#[derive(Debug, Deserialize)]
pub struct QuizAnswer {
    pub word_id: i64,
    pub answer: String,
}

#[derive(Debug, Deserialize)]
pub struct SubmitQuizRequest {
    pub answers: Vec<QuizAnswer>,
}

#[derive(Debug, Serialize)]
pub struct QuizResult {
    pub total: u32,
    pub correct: u32,
    pub details: Vec<QuizResultItem>,
}

#[derive(Debug, Serialize)]
pub struct QuizResultItem {
    pub word_id: i64,
    pub word: String,
    pub correct: bool,
    pub correct_answer: String,
    pub user_answer: String,
}
```

- [ ] **Step 2: Commit**

```bash
git add src/models.rs
git commit -m "feat: add data models"
```

---

### Task 5: DB module

**Files:**
- Create: `src/db.rs`

- [ ] **Step 1: Write db.rs**

```rust
use rusqlite::Connection;
use std::sync::Mutex;
use crate::config::Config;

pub type Db = Mutex<Connection>;

pub fn init_connection(config: &Config) -> Result<Db, rusqlite::Error> {
    let conn = Connection::open(&config.db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    Ok(Mutex::new(conn))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db.rs
git commit -m "feat: add db connection module"
```

---

### Task 6: Words service

**Files:**
- Create: `src/services/mod.rs`
- Create: `src/services/words.rs`

- [ ] **Step 1: Write services/mod.rs**

```rust
pub mod words;
pub mod review;
pub mod quiz;
```

- [ ] **Step 2: Write services/words.rs**

```rust
use rusqlite::{params, Connection};
use crate::error::AppError;
use crate::models::*;

pub fn list_words(conn: &Connection, query: &ListWordsQuery) -> Result<(Vec<Word>, u32), AppError> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(50).min(100);
    let offset = (page - 1) * per_page;

    let mut where_clauses = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref source) = query.source {
        where_clauses.push(format!("w.source = ?{}", param_values.len() + 1));
        param_values.push(Box::new(source.clone()));
    }
    if let Some(ref status) = query.status {
        where_clauses.push(format!("ls.status = ?{}", param_values.len() + 1));
        param_values.push(Box::new(status.clone()));
    }
    if let Some(stage) = query.stage {
        where_clauses.push(format!("w.stage = ?{}", param_values.len() + 1));
        param_values.push(Box::new(stage));
    }
    if let Some(ref q) = query.q {
        where_clauses.push(format!("w.word LIKE ?{}", param_values.len() + 1));
        param_values.push(Box::new(format!("%{}%", q)));
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let count_sql = format!(
        "SELECT COUNT(*) FROM words w LEFT JOIN learning_status ls ON w.id = ls.word_id {}",
        where_sql
    );
    let total: u32 = conn.query_row(&count_sql, param_values.iter().map(|p| p.as_ref()).collect::<Vec<_>>().as_slice(), |row| row.get(0))?;

    let query_sql = format!(
        "SELECT w.id, w.word, w.source, w.stage, w.phonetic, w.pos, w.meaning_cn, w.meaning_en, w.root, w.association, w.collocations, w.derivatives, w.references \
         FROM words w LEFT JOIN learning_status ls ON w.id = ls.word_id \
         {} ORDER BY w.id LIMIT ?{} OFFSET ?{}",
        where_sql, param_values.len() + 1, param_values.len() + 2
    );

    let mut param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    param_refs.push(&per_page);
    param_refs.push(&offset);

    let mut stmt = conn.prepare(&query_sql)?;
    let words = stmt.query_map(param_refs.as_slice(), |row| {
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
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok((words, total))
}

pub fn get_word(conn: &Connection, id: i64) -> Result<WordDetail, AppError> {
    let word = conn.query_row(
        "SELECT id, word, source, stage, phonetic, pos, meaning_cn, meaning_en, root, association, collocations, derivatives, references FROM words WHERE id = ?1",
        params![id],
        |row| Ok(Word {
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
        }),
    ).map_err(|_| AppError::NotFound(format!("Word {} not found", id)))?;

    let mut stmt = conn.prepare("SELECT id, word_id, sentence, translation FROM examples WHERE word_id = ?1")?;
    let examples = stmt.query_map(params![id], |row| {
        Ok(Example { id: row.get(0)?, word_id: row.get(1)?, sentence: row.get(2)?, translation: row.get(3)? })
    })?.collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare("SELECT id, word_id, synonym FROM synonyms WHERE word_id = ?1")?;
    let synonyms = stmt.query_map(params![id], |row| {
        Ok(Synonym { id: row.get(0)?, word_id: row.get(1)?, synonym: row.get(2)? })
    })?.collect::<Result<Vec<_>, _>>()?;

    let learning_status = conn.query_row(
        "SELECT id, word_id, status, review_count, correct_count, last_reviewed_at, next_review_at, ease_factor, interval_days FROM learning_status WHERE word_id = ?1",
        params![id],
        |row| Ok(LearningStatus {
            id: row.get(0)?,
            word_id: row.get(1)?,
            status: row.get(2)?,
            review_count: row.get(3)?,
            correct_count: row.get(4)?,
            last_reviewed_at: row.get(5)?,
            next_review_at: row.get(6)?,
            ease_factor: row.get(7)?,
            interval_days: row.get(8)?,
        }),
    ).ok();

    Ok(WordDetail { word, examples, synonyms, learning_status })
}

pub fn create_word(conn: &Connection, req: &CreateWordRequest) -> Result<Word, AppError> {
    conn.execute(
        "INSERT INTO words (word, source, stage, phonetic, pos, meaning_cn, meaning_en, root, association, collocations, derivatives, references) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![req.word, req.source, req.stage, req.phonetic, req.pos, req.meaning_cn, req.meaning_en, req.root, req.association, req.collocations, req.derivatives, req.references],
    )?;
    let id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO learning_status (word_id) VALUES (?1)",
        params![id],
    ).ok();

    get_word(conn, id).map(|d| d.word)
}

pub fn update_word(conn: &Connection, id: i64, req: &UpdateWordRequest) -> Result<Word, AppError> {
    let existing = get_word(conn, id)?.word;

    conn.execute(
        "UPDATE words SET stage = ?1, phonetic = ?2, pos = ?3, meaning_cn = ?4, meaning_en = ?5, root = ?6, association = ?7, collocations = ?8, derivatives = ?9, references = ?10 WHERE id = ?11",
        params![
            req.stage.unwrap_or(existing.stage.unwrap_or(0)),
            req.phonetic.as_ref().or(existing.phonetic.as_ref()),
            req.pos.as_ref().or(existing.pos.as_ref()),
            req.meaning_cn.as_ref().or(existing.meaning_cn.as_ref()),
            req.meaning_en.as_ref().or(existing.meaning_en.as_ref()),
            req.root.as_ref().or(existing.root.as_ref()),
            req.association.as_ref().or(existing.association.as_ref()),
            req.collocations.as_ref().or(existing.collocations.as_ref()),
            req.derivatives.as_ref().or(existing.derivatives.as_ref()),
            req.references.as_ref().or(existing.references.as_ref()),
            id,
        ],
    )?;

    get_word(conn, id).map(|d| d.word)
}

pub fn delete_word(conn: &Connection, id: i64) -> Result<(), AppError> {
    let rows = conn.execute("DELETE FROM words WHERE id = ?1", params![id])?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("Word {} not found", id)));
    }
    Ok(())
}
```

- [ ] **Step 3: Commit**

```bash
mkdir -p src/services
git add src/services/mod.rs src/services/words.rs
git commit -m "feat: add words service layer"
```

---

### Task 7: Review service (SM-2 algorithm)

**Files:**
- Create: `src/services/review.rs`

- [ ] **Step 1: Write services/review.rs**

```rust
use rusqlite::{params, Connection};
use crate::error::AppError;
use crate::models::*;

pub fn get_next_review(conn: &Connection, limit: u32) -> Result<Vec<WordDetail>, AppError> {
    let now = time::OffsetDateTime::now_utc().format(&time::format_description::well_known::Iso8601::DEFAULT).map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT w.id FROM words w JOIN learning_status ls ON w.id = ls.word_id WHERE ls.next_review_at <= ?1 OR ls.next_review_at IS NULL ORDER BY ls.next_review_at ASC NULLS FIRST LIMIT ?2"
    )?;
    let word_ids: Vec<i64> = stmt.query_map(params![now, limit], |row| row.get(0))?.collect::<Result<Vec<_>, _>>()?;

    let mut results = Vec::new();
    for wid in word_ids {
        results.push(super::words::get_word(conn, wid)?);
    }
    Ok(results)
}

pub fn submit_review(conn: &Connection, word_id: i64, quality: u32) -> Result<LearningStatus, AppError> {
    if quality > 5 {
        return Err(AppError::BadRequest("quality must be 0-5".into()));
    }

    let status = conn.query_row(
        "SELECT id, word_id, status, review_count, correct_count, last_reviewed_at, next_review_at, ease_factor, interval_days FROM learning_status WHERE word_id = ?1",
        params![word_id],
        |row| Ok(LearningStatus {
            id: row.get(0)?,
            word_id: row.get(1)?,
            status: row.get(2)?,
            review_count: row.get(3)?,
            correct_count: row.get(4)?,
            last_reviewed_at: row.get(5)?,
            next_review_at: row.get(6)?,
            ease_factor: row.get(7)?,
            interval_days: row.get(8)?,
        }),
    ).map_err(|_| AppError::NotFound(format!("Learning status not found for word {}", word_id)))?;

    let new_review_count = status.review_count + 1;
    let new_correct_count = status.correct_count + if quality >= 3 { 1 } else { 0 };

    let new_ease_factor = if quality >= 3 {
        let ef = status.ease_factor + (0.1 - (5.0 - quality as f64) * 0.08);
        ef.max(1.3)
    } else {
        status.ease_factor
    };

    let new_interval = if quality < 3 {
        1
    } else if status.review_count == 0 {
        1
    } else {
        (status.interval_days as f64 * new_ease_factor).ceil() as i32
    };

    let now = time::OffsetDateTime::now_utc();
    let now_str = now.format(&time::format_description::well_known::Iso8601::DEFAULT).map_err(|e| AppError::Internal(e.to_string()))?;
    let next = now + time::Duration::days(new_interval as i64);
    let next_str = next.format(&time::format_description::well_known::Iso8601::DEFAULT).map_err(|e| AppError::Internal(e.to_string()))?;

    let new_status = if new_correct_count >= 5 && new_ease_factor >= 2.0 { "mastered" } else if new_review_count >= 1 { "review" } else { "learning" };

    conn.execute(
        "UPDATE learning_status SET status = ?1, review_count = ?2, correct_count = ?3, last_reviewed_at = ?4, next_review_at = ?5, ease_factor = ?6, interval_days = ?7 WHERE word_id = ?8",
        params![new_status, new_review_count, new_correct_count, now_str, next_str, new_ease_factor, new_interval, word_id],
    )?;

    conn.query_row(
        "SELECT id, word_id, status, review_count, correct_count, last_reviewed_at, next_review_at, ease_factor, interval_days FROM learning_status WHERE word_id = ?1",
        params![word_id],
        |row| Ok(LearningStatus {
            id: row.get(0)?,
            word_id: row.get(1)?,
            status: row.get(2)?,
            review_count: row.get(3)?,
            correct_count: row.get(4)?,
            last_reviewed_at: row.get(5)?,
            next_review_at: row.get(6)?,
            ease_factor: row.get(7)?,
            interval_days: row.get(8)?,
        }),
    ).map_err(Into::into)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/review.rs
git commit -m "feat: add review service with SM-2 algorithm"
```

---

### Task 8: Quiz service

**Files:**
- Create: `src/services/quiz.rs`

- [ ] **Step 1: Write services/quiz.rs**

```rust
use rusqlite::{params, Connection};
use std::sync::atomic::{AtomicI64, Ordering};
use crate::error::AppError;
use crate::models::*;

static QUIZ_COUNTER: AtomicI64 = AtomicI64::new(1);

pub fn generate_quiz(conn: &Connection, req: &GenerateQuizRequest) -> Result<Quiz, AppError> {
    let count = req.count.unwrap_or(20).min(50);
    let quiz_type = req.quiz_type.as_deref().unwrap_or("en2cn");

    let mut where_clauses = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref source) = req.source {
        where_clauses.push(format!("source = ?{}", param_values.len() + 1));
        param_values.push(Box::new(source.clone()));
    }

    let where_sql = if where_clauses.is_empty() { String::new() } else { format!("WHERE {}", where_clauses.join(" AND ")) };

    let query_sql = format!(
        "SELECT id, word, meaning_cn, meaning_en FROM words {} ORDER BY RANDOM() LIMIT ?{}",
        where_sql, param_values.len() + 1
    );

    struct RawWord { id: i64, word: String, meaning_cn: Option<String>, meaning_en: Option<String> }

    let mut param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    param_refs.push(&count);

    let mut stmt = conn.prepare(&query_sql)?;
    let raw_words: Vec<RawWord> = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(RawWord { id: row.get(0)?, word: row.get(1)?, meaning_cn: row.get(2)?, meaning_en: row.get(3)? })
    })?.collect::<Result<Vec<_>, _>>()?;

    let distractor_sql = format!(
        "SELECT meaning_cn FROM words WHERE id != ?1 {} ORDER BY RANDOM() LIMIT 3",
        if let Some(ref source) = req.source { format!("AND source = '{}'", source) } else { String::new() }
    );

    let quiz_id = QUIZ_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut questions = Vec::new();

    for rw in &raw_words {
        let correct_answer = match quiz_type {
            "cn2en" => rw.word.clone(),
            "synonym" => rw.word.clone(),
            _ => rw.meaning_cn.clone().unwrap_or_default(),
        };

        let question_text = match quiz_type {
            "cn2en" => rw.meaning_cn.clone().unwrap_or_default(),
            "synonym" => rw.word.clone(),
            _ => rw.word.clone(),
        };

        let mut stmt2 = conn.prepare(&distractor_sql)?;
        let distractors: Vec<String> = stmt2.query_map(params![rw.id], |row| {
            let m: Option<String> = row.get(0)?;
            Ok(m.unwrap_or_default())
        })?.filter_map(|r| r.ok()).take(3).collect();

        let mut options = distractors;
        let correct_index = (rw.id % 4) as usize;
        options.insert(correct_index, correct_answer.clone());
        options.truncate(4);

        questions.push(QuizQuestion {
            word_id: rw.id,
            word: rw.word.clone(),
            question: question_text,
            options,
            correct_index,
        });
    }

    Ok(Quiz { id: quiz_id, questions })
}

pub fn submit_quiz(conn: &Connection, quiz: &Quiz, req: &SubmitQuizRequest) -> Result<QuizResult, AppError> {
    let mut details = Vec::new();
    let mut correct = 0u32;

    for answer in &req.answers {
        let question = quiz.questions.iter().find(|q| q.word_id == answer.word_id);
        let (is_correct, correct_answer) = match question {
            Some(q) => {
                let ca = q.options.get(q.correct_index).cloned().unwrap_or_default();
                let ok = answer.answer == ca;
                (ok, ca)
            }
            None => (false, String::new()),
        };

        if is_correct {
            correct += 1;
            let _ = super::review::submit_review(conn, answer.word_id, 5);
        } else {
            let _ = super::review::submit_review(conn, answer.word_id, 1);
        }

        let word_text = question.map(|q| q.word.clone()).unwrap_or_default();

        details.push(QuizResultItem {
            word_id: answer.word_id,
            word: word_text,
            correct: is_correct,
            correct_answer,
            user_answer: answer.answer.clone(),
        });
    }

    Ok(QuizResult {
        total: req.answers.len() as u32,
        correct,
        details,
    })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/quiz.rs
git commit -m "feat: add quiz service"
```

---

### Task 9: Handlers

**Files:**
- Create: `src/handlers/mod.rs`
- Create: `src/handlers/words.rs`
- Create: `src/handlers/review.rs`
- Create: `src/handlers/quiz.rs`

- [ ] **Step 1: Write handlers/mod.rs**

```rust
pub mod words;
pub mod review;
pub mod quiz;
```

- [ ] **Step 2: Write handlers/words.rs**

```rust
use axum::extract::{Path, Query, State};
use axum::Json;
use crate::db::Db;
use crate::error::AppError;
use crate::models::*;
use crate::services;

pub async fn list_words(
    State(db): State<Db>,
    Query(query): Query<ListWordsQuery>,
) -> Result<Json<PaginatedResponse<Word>>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let (words, total) = services::words::list_words(&conn, &query)?;
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(50);
    Ok(Json(PaginatedResponse { data: words, meta: PaginationMeta { page, per_page, total } }))
}

pub async fn get_word(
    State(db): State<Db>,
    Path(id): Path<i64>,
) -> Result<Json<WordDetail>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let detail = services::words::get_word(&conn, id)?;
    Ok(Json(detail))
}

pub async fn create_word(
    State(db): State<Db>,
    Json(req): Json<CreateWordRequest>,
) -> Result<Json<Word>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let word = services::words::create_word(&conn, &req)?;
    Ok(Json(word))
}

pub async fn update_word(
    State(db): State<Db>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateWordRequest>,
) -> Result<Json<Word>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let word = services::words::update_word(&conn, id, &req)?;
    Ok(Json(word))
}

pub async fn delete_word(
    State(db): State<Db>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    services::words::delete_word(&conn, id)?;
    Ok(Json(serde_json::json!({"deleted": true})))
}
```

- [ ] **Step 3: Write handlers/review.rs**

```rust
use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;
use crate::db::Db;
use crate::error::AppError;
use crate::models::*;
use crate::services;

#[derive(Deserialize)]
pub struct NextQuery {
    pub limit: Option<u32>,
}

pub async fn get_next_review(
    State(db): State<Db>,
    Query(query): Query<NextQuery>,
) -> Result<Json<Vec<WordDetail>>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let words = services::review::get_next_review(&conn, query.limit.unwrap_or(1))?;
    Ok(Json(words))
}

pub async fn submit_review(
    State(db): State<Db>,
    Path(word_id): Path<i64>,
    Json(req): Json<ReviewAnswerRequest>,
) -> Result<Json<LearningStatus>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let status = services::review::submit_review(&conn, word_id, req.quality)?;
    Ok(Json(status))
}
```

- [ ] **Step 4: Write handlers/quiz.rs**

```rust
use axum::extract::{Path, State};
use axum::Json;
use std::collections::HashMap;
use std::sync::Mutex;
use crate::db::Db;
use crate::error::AppError;
use crate::models::*;
use crate::services;

lazy_static::lazy_static! {
    static ref QUIZ_STORE: Mutex<HashMap<i64, Quiz>> = Mutex::new(HashMap::new());
}

pub async fn generate_quiz(
    State(db): State<Db>,
    Json(req): Json<GenerateQuizRequest>,
) -> Result<Json<Quiz>, AppError> {
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let quiz = services::quiz::generate_quiz(&conn, &req)?;
    QUIZ_STORE.lock().unwrap().insert(quiz.id, quiz.clone());
    Ok(Json(quiz))
}

pub async fn submit_quiz(
    State(db): State<Db>,
    Path(id): Path<i64>,
    Json(req): Json<SubmitQuizRequest>,
) -> Result<Json<QuizResult>, AppError> {
    let quiz = QUIZ_STORE.lock().unwrap().get(&id).cloned()
        .ok_or_else(|| AppError::NotFound(format!("Quiz {} not found", id)))?;
    let conn = db.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let result = services::quiz::submit_quiz(&conn, &quiz, &req)?;
    Ok(Json(result))
}
```

- [ ] **Step 5: Add lazy_static to Cargo.toml dependencies**

Add to `[dependencies]`:
```toml
lazy_static = "1.5"
```

- [ ] **Step 6: Commit**

```bash
git add src/handlers/ Cargo.toml
git commit -m "feat: add handlers layer"
```

---

### Task 10: Main entry + router

**Files:**
- Modify: `src/main.rs`

- [ ] **Step 1: Rewrite main.rs**

```rust
mod config;
mod db;
mod error;
mod handlers;
mod models;
mod services;

use axum::routing::{get, post, delete};
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let cfg = config::Config::from_env();
    let pool = db::init_connection(&cfg).expect("Failed to connect to database");

    let app = Router::new()
        .route("/api/words", get(handlers::words::list_words).post(handlers::words::create_word))
        .route("/api/words/{id}", get(handlers::words::get_word).put(handlers::words::update_word).delete(handlers::words::delete_word))
        .route("/api/review/next", get(handlers::review::get_next_review))
        .route("/api/review/{word_id}/answer", post(handlers::review::submit_review))
        .route("/api/quiz/generate", post(handlers::quiz::generate_quiz))
        .route("/api/quiz/{id}/submit", post(handlers::quiz::submit_quiz))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(pool);

    let addr = format!("{}:{}", cfg.host, cfg.port);
    tracing::info!("Server running on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo build`
Expected: compiles successfully

- [ ] **Step 3: Test with curl**

```bash
cargo run &
curl http://localhost:3000/api/words?per_page=2
curl http://localhost:3000/api/words/1
curl http://localhost:3000/api/review/next?limit=3
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add src/main.rs
git commit -m "feat: wire up axum router and start server"
```

---

### Task 11: Integration test

**Files:**
- Create: `tests/api_test.rs`

- [ ] **Step 1: Write integration test**

```rust
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use tower::ServiceExt;
use mywords::{create_app, Db};

fn test_app() -> (Router, Db) {
    let cfg = mywords::config::Config {
        host: "127.0.0.1".into(),
        port: 0,
        db_path: ":memory:".into(),
    };
    let pool = rusqlite::Connection::open(":memory:").unwrap();
    pool.execute_batch(include_str!("../words.db.sql")).ok();
    let db = std::sync::Mutex::new(pool);
    let app = mywords::create_app(db.clone());
    (app, db)
}

#[tokio::test]
async fn test_list_words() {
    let (app, _) = test_app();
    let req = Request::builder().uri("/api/words?per_page=2").body(Body::empty()).unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}
```

Note: Adjust `create_app` to be a public function exported from main.rs that builds the Router without binding to a port. Extract the router construction into a separate function for testability.

- [ ] **Step 2: Commit**

```bash
git add tests/
git commit -m "test: add integration test scaffold"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run all tests**

Run: `cargo test`
Expected: all pass

- [ ] **Step 2: Run `cargo build` and `cargo run`**

Start server, hit all endpoints with curl to verify full workflow.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete HTTP server implementation"
```
