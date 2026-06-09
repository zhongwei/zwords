# HTTP Server Design

## Overview

为 mywords 项目构建一个基于 axum 的 HTTP server，直接读取 `words.db` SQLite 数据库，暴露 RESTful API，供 web、TUI、GUI、agent 等多端统一访问。

## Architecture

单体三层架构：

```
axum router → handlers → services → rusqlite (words.db)
```

- **handlers**：HTTP 请求解析与响应构造
- **services**：业务逻辑（SM-2 调度、测验生成等）
- **rusqlite**：SQL 执行，直连 SQLite 文件

## Project Structure

```
src/
├── main.rs              # 启动入口，配置 axum server
├── config.rs            # 配置项（端口、DB路径）
├── db.rs                # SQLite 连接池初始化
├── models.rs            # 数据结构（Word, Example, Synonym, LearningStatus）
├── error.rs             # 统一错误类型 + JSON 错误响应
├── handlers/
│   ├── mod.rs
│   ├── words.rs         # 单词 CRUD + 查询
│   ├── review.rs        # 间隔重复复习
│   └── quiz.rs          # 测验
└── services/
    ├── mod.rs
    ├── words.rs          # 单词业务逻辑
    ├── review.rs         # SM-2 调度算法
    └── quiz.rs           # 测验生成与评分
```

## Dependencies

```toml
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

## API Endpoints

### Words CRUD (`/api/words`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/words` | 列表查询，分页+过滤 |
| GET | `/api/words/:id` | 单词详情（含 examples, synonyms, learning_status） |
| POST | `/api/words` | 新增单词 |
| PUT | `/api/words/:id` | 编辑单词 |
| DELETE | `/api/words/:id` | 删除单词 |

GET `/api/words` query parameters:
- `page` (default 1), `per_page` (default 50) — 分页
- `source` — `gre` / `toefl`
- `status` — `new` / `learning` / `review` / `mastered`
- `stage` — integer
- `q` — 模糊搜索单词（LIKE %q%）

### Review (`/api/review`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/review/next` | 获取待复习单词（按 next_review_at 升序） |
| POST | `/api/review/:word_id/answer` | 提交复习结果 |

POST body: `{ "quality": 4 }` (quality 0-5)

支持 query 参数 `?limit=N` 控制一次获取数量（默认 1）。

### Quiz (`/api/quiz`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/quiz/generate` | 生成测验 |
| POST | `/api/quiz/:id/submit` | 提交答案评分 |

Generate body: `{ "count": 20, "source": "gre", "type": "en2cn" }`

type 可选: `en2cn`（英译中）、`cn2en`（中译英）、`synonym`（同义词选择）

Submit body: `{ "answers": [{ "word_id": 1, "answer": "选项文本" }, ...] }`

返回每题对错、正确答案、总分，并自动将结果同步更新 learning_status。

## SM-2 Scheduling

用户提交 quality (0-5):

| quality | meaning |
|---------|---------|
| 0 | 完全不认识 |
| 1 | 看了答案才想起 |
| 2 | 勉强记得 |
| 3 | 想了一下记起来 |
| 4 | 比较轻松记住 |
| 5 | 非常熟悉 |

Rules:
- quality < 3: interval_days = 1, ease_factor 不变
- quality >= 3: ease_factor = max(1.3, ease_factor + (0.1 - (5 - quality) * 0.08)), interval_days = ceil(old_interval * ease_factor)
- review_count++, correct_count += (quality >= 3 ? 1 : 0)
- last_reviewed_at = now, next_review_at = now + interval_days
- 首次复习起始 interval_days = 1

## Quiz Logic

Generate:
1. 根据条件从 words 表随机抽取 N 个
2. 每题生成 4 个选项（1 正确 + 3 干扰，干扰项从同 source 其他单词中随机取）
3. 返回 quiz_id + 题目列表

Submit:
1. 校验所有答案
2. 返回每题对错、正确答案、总分
3. 同步更新 learning_status：答对映射 quality=5，答错映射 quality=1

## Response Format

Success:
```json
{
  "data": { ... },
  "meta": { "page": 1, "per_page": 50, "total": 10096 }
}
```

Error:
```json
{
  "error": { "code": "NOT_FOUND", "message": "Word not found" }
}
```

## Error Handling

```rust
enum AppError {
    NotFound(String),        // 404
    BadRequest(String),      // 400
    Internal(String),        // 500
}
```

All handlers return `Result<Json, AppError>`，impl IntoResponse 自动转统一 JSON。

## Middleware

```
request → CORS → TraceLogging → Handler
```

- CORS: AllowAll（本地工具）
- Trace: 请求方法、路径、耗时、状态码

## Configuration

默认值，可通过环境变量覆盖：
- `MYWORDS_PORT`: default `3000`
- `MYWORDS_HOST`: default `0.0.0.0`
- `MYWORDS_DB_PATH`: default `./words.db`

## Database Schema (existing)

words.db 包含 4 张表：words (10096 rows), examples (3779), synonyms (3280), learning_status (10096)，详见数据库 schema。

## Testing

- 单元测试：services 层，用 `:memory:` SQLite 数据库
- 集成测试：启动完整 server，用 reqwest 发送 HTTP 请求验证
