# Word Audio BLOB Storage & Playback — Design

**Date**: 2026-06-16
**Status**: Approved (brainstorm), awaiting user spec review
**Scope**: 后端 + 前端 — 把 `audio/uk` 与 `audio/us` 下的 `.opus` 文件以 BLOB 入库，新增专用音频端点，并在前端单词详情页与复习页加入英/美播放按钮

**Relationship to prior work**: 实现 [2026-06-15-pronunciation-audio-download-design.md](./2026-06-15-pronunciation-audio-download-design.md) 第 8 节"后续可选工作"中的 BLOB 入库 + 音频端点 + 前端播放器三件事。该前序设计当时选择"仅下载到本地文件、不动 DB"，本次反转该决策为 BLOB 入库（与更早的 commit `dfaefc7` 方案一致）。文件格式已由 MP3 改为 Opus。

---

## 1. 背景与目标

### 1.1 当前状态
- `words` 表共 10,096 行（GRE 6,490 + TOEFL 3,606）
- 仓库根 `audio/uk/`（6,889 个 `.opus`，32 MB）与 `audio/us/`（8,466 个 `.opus`，45 MB）已存在，总约 **77 MB**
- 单文件 2–5 KB；Ogg-Opus 容器（魔数 `OggS` = `4f 67 67 53`）
- 文件名形如 `{word}.opus`，保留 DB 原始大小写与连字符（如 `Easter.opus`、`self-analysis.opus`）。当前数据集中**无**含空格/特殊字符的文件名（即无人需要下划线净化），但脚本仍按前序下载脚本的净化规则做匹配以保持稳健与一致
- `words.db` 当前约 3.5 MB；入库后将增长到约 80 MB
- 现有所有 `SELECT ... FROM words` 均使用显式列名（无 `SELECT *`），故新增 BLOB 列**不会**让普通查询拖回二进制数据

### 1.2 目标
1. `words` 表新增 `audio_uk`、`audio_us` 两个 BLOB 列，按 word 匹配填充 `.opus` 内容
2. 提供专用二进制端点 `GET /api/words/{id}/audio/{variant}` 流式返回音频
3. `Word` 序列化新增 `has_audio_uk` / `has_audio_us` 布尔（SQL 计算，不传 BLOB），供前端决定是否渲染按钮
4. 前端在单词详情页和复习页加英/美播放按钮

### 1.3 非目标
- 不修改 `CreateWordRequest` / `UpdateWordRequest`（音频只由导入脚本管理）
- 不在 `WordsList.tsx` 列表行加播放按钮（YAGNI）
- 不改 YAML、不改 `learning_status`、不引入新字典数据源
- 不改 `download_pronunciation.py`（数据采集与入库分离）

---

## 2. 决策记录

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 音频字节存储位置 | A. BLOB 入 SQLite / B. 文件系统直读 / C. 混合 | **A** | 用户指定；与项目"单二进制 + rust-embed"哲学一致；现有查询均为显式列，BLOB 污染可隔离 |
| 音频 API 形式 | 专用二进制端点 / Base64 嵌 JSON / 两者 | **专用二进制端点** | BLOB 仅按需读取；`<audio>` 直接消费；详情/列表 JSON 不被二进制污染 |
| 迁移策略 | 改 import 脚本（破坏性）/ 独立增量脚本 / 仅增量 | **独立增量脚本 + 同步 schema** | 保留现有 `learning_status` 学习进度；同时同步 schema 使未来重建也具备该列 |
| 缺失音频处理 | NULL / 空串 / 占位 | **NULL** | 自然表示"无数据"；端点返回 404；前端按布尔隐藏按钮 |
| 文件名匹配 | 大小写敏感精确 / 小写归一 / 净化规则 | **前序下载脚本的 `sanitize()` 规则** | 与下载端命名一致；当前数据集等价于大小写敏感精确匹配，但能正确处理未来含空格的词 |
| 音频 MIME | `audio/mpeg` / `audio/opus` / `audio/ogg` | **`audio/ogg`** | `.opus` 文件实为 Ogg-Opus 容器（魔数 `OggS`）；RFC 5334/7845 规定其 MIME 为 `audio/ogg`；`audio/opus` 非标准 |
| 前端覆盖范围 | 仅详情页 / 详情+复习 / +列表 | **详情 + 复习** | 发音在沉浸式详情与复习卡片中最有意义；列表行 YAGNI |

---

## 3. 数据层

### 3.1 Schema 变更
`words` 表追加两个可空 BLOB 列：

```sql
ALTER TABLE words ADD COLUMN audio_uk BLOB;
ALTER TABLE words ADD COLUMN audio_us BLOB;
```

- 同步写入 `scripts/import_yaml_to_sqlite.py` 的 `SCHEMA`，保证未来破坏性重建也含此二列（重建后 audio 列为 NULL，需再跑增量脚本回填，见 §4.2）。
- 不加索引（BLOB 不索引；存在性通过 `audio_uk IS NOT NULL` 计算）。

### 3.2 文件名匹配规则
复用前序下载脚本 [`scripts/download_pronunciation.py`](../../scripts/download_pronunciation.py) 的净化函数，确保入库与下载命名完全一致：

```python
def sanitize(word: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9-]", "_", word).strip("_.")
    return s or "_"
```

- 对每个 DB `word`：`stem = sanitize(word)`，查 `audio/uk/{stem}.opus` 与 `audio/us/{stem}.opus`。
- 当前数据集 0 个文件含 `_`，故等价于大小写敏感精确匹配；保留净化仅为对齐下载端约定。
- 存在即读取整文件字节 `UPDATE`；不存在则该列保持 NULL。

---

## 4. 迁移与导入

### 4.1 新增文件
`scripts/add_audio_to_db.py` — 非破坏性增量入库脚本。

### 4.2 流程
1. 连接 `words.db`。
2. 通过 `PRAGMA table_info(words)` 检查列是否已存在；缺则 `ALTER TABLE ... ADD COLUMN audio_uk BLOB` / `audio_us BLOB`。**幂等**：列已存在时跳过 ALTER（既适用于老库升级，也适用于刚 `import_yaml_to_sqlite.py` 重建过、列已存在但数据为 NULL 的情况）。
3. 扫描 `audio/uk/*.opus`、`audio/us/*.opus`，构建 `{sanitize-stem: abs_path}` 映射。
4. `SELECT id, word FROM words`，对每行 `sanitize(word)` 查两份映射；命中则以 `UPDATE words SET audio_uk = ?, audio_us = ? WHERE id = ?` 写入（参数化，NULL 占位未命中项）。
5. 为减小事务开销，按批（如每 500 行）`commit`。

### 4.3 报告输出
末尾打印：
- 总词数
- UK：命中数 / 缺失数；US：命中数 / 缺失数
- `audio/` 中存在但 DB 无对应 word 的孤立文件数（仅统计，不删除）

### 4.4 依赖
仅标准库（`sqlite3`、`os`、`re`、`pathlib`）—— 与 `import_yaml_to_sqlite.py` 保持一致，不引入第三方。

---

## 5. 后端 API（Rust / axum）

### 5.1 新增端点
```
GET /api/words/{id}/audio/{variant}
```
- 路径参数：`id: i64`，`variant: String`（校验 ∈ `{"uk","us"}`，否则 404）。
- 在 `src/main.rs` 路由表新增一行：
  ```rust
  .route("/api/words/{id}/audio/{variant}", get(handlers::words::get_word_audio))
  ```

### 5.2 Handler 行为（`src/handlers/words.rs`）
1. 查询：`SELECT audio_uk, audio_us FROM words WHERE id = ?1`（只取这两列）。
2. 行不存在 → `404 Not Found`。
3. 行存在但请求的 BLOB 为 NULL → `404 Not Found`（前端把"无音频"统一视为缺失）。
4. 命中 → 返回 `[(header::CONTENT_TYPE, "audio/ogg"), (header::CONTENT_LENGTH, len)]` + 字节体。使用 axum 的 `Response<Body>` 直接装 `Vec<u8>`（单文件平均 ~4 KB，无需分块）。

### 5.3 存在性标记（`src/models.rs` + `src/services/words.rs`）
`Word` 结构新增两个字段（始终序列化）：
```rust
pub has_audio_uk: bool,
pub has_audio_us: bool,
```
对应 SQL 在**详情查询**与**列表查询**中追加两列（用 `IS NOT NULL` 计算，避免传 BLOB）：
```sql
SELECT id, word, ..., "references",
       audio_uk IS NOT NULL AS has_audio_uk,
       audio_us IS NOT NULL AS has_audio_us
FROM words ...
```
- `CreateWordRequest` / `UpdateWordRequest` 不变。
- 由于 rusqlite 行转结构体是按位置读列，务必保证 SELECT 列序与 `row.get` 顺序一致。

### 5.4 错误处理
复用现有 `AppError` enum；新增的 404 用既有 `AppError::NotFound` 变体即可，无需扩展枚举。

---

## 6. 前端（React）

### 6.1 类型（`web/src/lib/types.ts`）
`Word` 接口追加：
```ts
has_audio_uk: boolean;
has_audio_us: boolean;
```

### 6.2 播放原语
不抽独立 hook 除非复用点 > 2（实际复用 2 处：详情、复习），先在两处各用一个小工具函数 / 内联 `<audio ref>`，状态：`idle | playing`。点击按钮 → 若 `playing` 则 `pause()`，否则 `play()`；监听 `onEnded` 复位。

URL 构造（dev 与 prod 通用，因 Vite 已代理 `/api` → `:8000`）：
```ts
`/api/words/${word.id}/audio/${variant}`
```

### 6.3 详情页（`web/src/pages/WordDetail.tsx`）
在 `wd-phonetic` 行（WordDetail.tsx:87）旁加两个紧凑按钮（UK / US），使用 `lucide-react` 的 `Volume2` 图标：
- `has_audio_uk === false` 时不渲染 UK 按钮；US 同理。
- 播放中按钮加视觉态（如高亮/脉动）。
- 互斥：点击 UK 时若 US 在播，先暂停 US（反之亦然）—— 可用单一 `currentVariant` 状态简化。

### 6.4 复习页（`web/src/pages/Review.tsx`）
复习卡片当前在 Review.tsx:101 显示 `current.word.phonetic`。在该位置加同样的 UK/US 按钮，行为一致。

### 6.5 不做的事
- `WordsList.tsx` 列表行**不加**播放按钮。
- 不做播放进度条 / 音量控制（短促单词发音不需要）。

---

## 7. 验收标准

1. `python scripts/add_audio_to_db.py` 在现有 `words.db` 上幂等运行：首次给 `words` 表加两 BLOB 列并填充；再次运行不报错（ALTER 跳过，UPDATE 重写）。
2. 运行后 `SELECT COUNT(*) FROM words WHERE audio_uk IS NOT NULL` ≈ 6,889；`audio_us IS NOT NULL` ≈ 8,466（与 `audio/` 文件数一致或略少，取决于 DB 是否含对应 word）。
3. `learning_status` 表行数与运行前相同（学习进度未丢）。
4. `scripts/import_yaml_to_sqlite.py` 的 `SCHEMA` 含 `audio_uk BLOB` / `audio_us BLOB` 两列。
5. `GET /api/words/{id}/audio/uk` 对有音频的词返回 `200` + `Content-Type: audio/ogg` + 字节体（首 4 字节 `OggS`）；对无音频的词返回 `404`。
6. `GET /api/words/{id}/audio/foo`（非法 variant）返回 `404`。
7. `GET /api/words/{id}` 的 JSON 含 `has_audio_uk` / `has_audio_us` 布尔字段；不含任何 base64。
8. `cargo build` 通过；`cargo test` 通过；`bun run lint` 通过。
9. 单词详情页在有音频的词上显示 UK/US 按钮，点击可听到发音；无音频的词不显示按钮。
10. 复习页同样可播放当前复习词的发音。
11. `words.db` 体积增长到约 80 MB。

---

## 8. 风险与备注

- **DB 体积**：3.5 MB → ~80 MB。备份与 `VACUUM` 成本上升。可接受（单机学习工具）。
- **浏览器 Opus 解码**：现代 Chrome/Edge/Firefox 原生支持 Ogg-Opus；Safari 对 Opus 的 `<audio>` 解码支持较晚（iOS 17 / macOS 14+ 才完善）。若目标用户含老版 Safari，需后续追加 MP3 回退源 —— 本次不在范围。
- **rusqlite 列序**：5.3 节强调 SELECT 列序与 `row.get` 顺序必须对齐，是迁移中最易出错点，实现时需对照检查。
- **孤立音频文件**：DB 中无对应 word 的 `.opus`（如人名/外文词）会被统计但不入库，符合预期。
