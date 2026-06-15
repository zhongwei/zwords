# AGENTS.md

## Project Overview

mywords 是一个单词学习工具，包含约 1 万个 GRE/TOEFL 单词数据，存储在 SQLite 数据库 `words.db` 中。后端是基于 axum 的 HTTP server（Rust crate 名 `mywords`，但仓库目录名为 `zwords`，环境变量前缀统一为 `MYWORDS_`）；前端是独立的 React SPA（`web/`），构建产物经 `rust-embed` 嵌入二进制，由同一个 server 作为静态资源回退提供。

## Tech Stack

后端 (Rust, edition 2024):
- axum 0.8, tokio
- rusqlite 0.31 (bundled), 不用 ORM，手写 SQL
- serde / serde_json, time 0.3 (NOT chrono)
- tracing + tracing-subscriber, tower / tower-http (CORS, trace)
- rust-embed + mime_guess: 编译期把 `web/dist/` 嵌入二进制
- lazy_static

前端 (`web/`, 使用 bun):
- React 19 + TypeScript 6 + Vite 8
- Tailwind v4 (经 `@tailwindcss/vite` 插件), react-router-dom v7
- @tanstack/react-query, framer-motion, lucide-react
- @react-three/fiber + drei + postprocessing (3D 场景)
- @base-ui/react, class-variance-authority, clsx, tailwind-merge
- 路径别名 `@` → `web/src` (见 `vite.config.ts`)

## Build & Run

后端默认监听 `0.0.0.0:8000`（**不是 3000**）。环境变量：
- `MYWORDS_HOST` (默认 `0.0.0.0`)
- `MYWORDS_PORT` (默认 `8000`)
- `MYWORDS_DB_PATH` (默认 `./words.db`)

```bash
cargo build
cargo run                     # 监听 0.0.0.0:8000
MYWORDS_PORT=8080 cargo run   # 自定义端口
```

**重要：前端必须先构建，否则后端没有 UI 可服务。** `rust-embed` 在编译期把 `web/dist/` 嵌入二进制（见 `src/static_files.rs`）。`web/dist/` 被 gitignore，新检出时不存在；后端仍能编译/运行，但所有非 `/api/*` 请求会回退到 `index.html`（也不存在时返回 404）。

```bash
# 在 web/ 目录下（使用 bun）
bun install
bun run build                 # 产物输出到 web/dist/，之后 cargo run 即可服务前端
bun run lint                  # eslint
bun run dev                   # 启动 Vite dev server (默认 5173)
```

## 开发工作流

同时跑两套进程：Vite dev server 提供 HMR 前端，Rust server 提供 API。Vite 已配置把 `/api` 代理到 `http://localhost:8000`（见 `vite.config.ts`），所以开发时：

1. 一个终端：`cargo run`（后端在 8000）
2. 另一个终端：`bun run dev`（前端在 5173，访问 http://localhost:5173）

生产部署则只跑后端二进制（已内嵌 `web/dist/`）。

## Test

无 `tests/` 集成测试目录。

```bash
cargo test          # 所有测试（目前均为单元/模块内测试）
cargo test --lib
```

## Database

SQLite 文件 `words.db`，4 张表：
- `words` — 单词主表 (word, source CHECK in ('toefl','gre'), stage, phonetic, pos, meaning_cn, meaning_en, root, association, collocations, derivatives, references)
- `examples` — 例句 (word_id FK, sentence, translation)
- `synonyms` — 同义词 (word_id FK, synonym)
- `learning_status` — 学习状态 (word_id FK, status CHECK in ('new','learning','review','mastered'), review_count, correct_count, last_reviewed_at, next_review_at, ease_factor, interval_days)

连接初始化见 `src/db.rs`：开启 `WAL` journal_mode 和 `foreign_keys`；连接为 `Arc<Mutex<Connection>>`（单连接 + 互斥锁），通过 axum `State` 共享。

**重建数据库（破坏性）：** `scripts/import_yaml_to_sqlite.py` 从仓库根的 `GRE_Word_List.yaml` / `TOEFL_Word_List.yaml` 重新生成 `words.db`。脚本会先 **删除** 已有的 `words.db`，依赖 `pyyaml`。这是 DB 的数据来源（source of truth），不要手动 INSERT。

```bash
python scripts/import_yaml_to_sqlite.py   # 会覆盖现有 words.db
```

## Project Structure

```
src/
├── main.rs              # 路由装配、启动入口
├── config.rs            # 从环境变量读取 Config
├── db.rs                # SQLite 连接初始化 (Arc<Mutex<Connection>>, WAL)
├── models.rs            # 数据结构
├── error.rs             # AppError enum, 实现 IntoResponse
├── static_files.rs      # rust-embed 嵌入 web/dist/，作为路由 fallback
├── handlers/            # HTTP 解析层 (words, review, quiz)
└── services/            # 业务逻辑层 (words, review 含 SM-2, quiz)
web/                     # React 前端 (Vite + bun)，构建到 web/dist/
scripts/                 # import_yaml_to_sqlite.py 数据导入
```

## API

所有 API 端点以 `/api/` 开头（见 `src/main.rs` 路由表）：
- `/api/words`, `/api/words/{id}` — 单词 CRUD
- `/api/review/next`, `/api/review/{word_id}/answer` — 复习
- `/api/quiz/generate`, `/api/quiz/{id}/submit` — 测验

## Code Style

- 用 `time` crate 处理时间，不用 chrono
- 不用 ORM，手写 SQL
- 错误统一用 `AppError` enum，实现 `IntoResponse`
- handler 只做 HTTP 解析，业务逻辑放 service 层
- 不添加不必要的注释
- 不 commit secrets 或敏感信息
```
