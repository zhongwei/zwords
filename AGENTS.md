# AGENTS.md

## Project Overview

mywords 是一个单词学习工具，包含约 1 万个 GRE/TOEFL 单词数据，存储在 SQLite 数据库 `words.db` 中。项目正在构建一个基于 axum 的 HTTP server，暴露 RESTful API 供多端（web/TUI/GUI/agent）访问。

## Tech Stack

- Language: Rust (edition 2024)
- Web framework: axum 0.8
- Database: SQLite via rusqlite 0.31 (bundled)
- Async runtime: tokio
- Serialization: serde / serde_json
- Time: time 0.3 (NOT chrono)
- Logging: tracing + tracing-subscriber
- Middleware: tower / tower-http (CORS, trace)

## Build & Run

```bash
cargo build
cargo run                  # 启动 server，默认 0.0.0.0:3000
MYWORDS_PORT=8080 cargo run  # 自定义端口
```

## Test

```bash
cargo test                 # 所有测试
cargo test --lib           # 单元测试
cargo test --test '*'      # 集成测试
```

## Project Structure

```
src/
├── main.rs              # 启动入口
├── config.rs            # 配置
├── db.rs                # SQLite 连接初始化
├── models.rs            # 数据结构
├── error.rs             # 统一错误类型
├── handlers/
│   ├── words.rs         # 单词 CRUD
│   ├── review.rs        # 复习
│   └── quiz.rs          # 测验
└── services/
    ├── words.rs
    ├── review.rs        # SM-2 算法
    └── quiz.rs
```

## API Prefix

所有端点以 `/api/` 开头：`/api/words`, `/api/review`, `/api/quiz`

## Code Style

- 使用 `time` crate 处理时间，不用 chrono
- 不使用 ORM，手写 SQL
- 错误统一用 `AppError` enum，实现 `IntoResponse`
- handler 只做 HTTP 解析，业务逻辑放 service 层
- 不添加不必要的注释
- 不 commit secrets 或敏感信息

## Database

SQLite 文件：`words.db`，包含 4 张表：
- `words` — 单词主表 (word, source, stage, phonetic, pos, meaning_cn, meaning_en, root, association, collocations, derivatives, references)
- `examples` — 例句 (word_id FK, sentence, translation)
- `synonyms` — 同义词 (word_id FK, synonym)
- `learning_status` — 学习状态 (word_id FK, status, review_count, correct_count, last_reviewed_at, next_review_at, ease_factor, interval_days)
