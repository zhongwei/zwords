# Pronunciation Audio BLOB Download — Design

**Date**: 2026-06-15
**Status**: Approved (brainstorm), awaiting user spec review
**Scope**: 单次数据填充任务 — 为 `words` 表所有单词获取英式/美式 MP3 发音并直接以 BLOB 形式存入数据库

---

## 1. 背景与目标

### 1.1 当前状态
- `words` 表共 10,096 行（GRE 6,490 + TOEFL 3,606）
- 已有单个 `phonetic` TEXT 字段存储 IPA 文本（例如 `/əˈkɑːmplɪʃmənt/`），约 10,095 行已填，1 行为 NULL
- `phonetic` 字段贯穿全栈：Python import 脚本、Rust models/handlers/services、TS types、3 个前端页面（`WordsList.tsx`、`Review.tsx`、`WordDetail.tsx`）
- 仓库根已有 `pronounce.json`（23.4 MB，481,229 行），格式为 `word: [url1, url2, ...]`，含约 119K 英语词条的 MP3 URL 列表，来源于 Cambridge、Oxford、Dictionary.com、Vocabulary.com、Free Dictionary 等 7 个字典站点

### 1.2 目标
为每个单词新增两个 BLOB 列：
- `audio_uk` — 英式发音 MP3 二进制内容
- `audio_us` — 美式发音 MP3 二进制内容

### 1.3 非目标（明确不做）
- **不**修改现有 `phonetic` 字段、Rust `Word` struct、API JSON、TS 类型或前端展示 —— 全部保持原样
- **不**新增 IPA 文本字段（如 `phonetic_uk` / `phonetic_us`）
- **不**通过 API 暴露音频（暂未规划音频服务端点；后续可另议）
- **不**集成进 `import_yaml_to_sqlite.py` 的运行流程（保持 YAML→DB 导入仍是几秒级的轻量操作）

---

## 2. 架构

### 2.1 总体策略：SCHEMA 加列 + 独立下载脚本

```
┌─────────────────────────────────────┐
│ import_yaml_to_sqlite.py            │
│  - SCHEMA 新增 audio_uk/audio_us 列 │
│  - 重建 DB 时列结构存在但为 NULL    │
└─────────────────────────────────────┘
                  ↓ （YAML 重建后）
┌─────────────────────────────────────┐
│ download_pronunciation.py (新)      │
│  - 解析 pronounce.json              │
│  - 并发下载 MP3 (8 worker, 3 retry) │
│  - 校验后写 BLOB                    │
│  - 幂等可重跑，只填 NULL 行         │
└─────────────────────────────────────┘
```

**为什么选这种分离**：
- YAML→DB 导入保持秒级，不被 20K+ HTTP 请求拖慢
- schema 单一来源（在 import 脚本的 `SCHEMA` 常量里），不分散
- 下载脚本可断点续跑、失败重跑无副作用
- DB 重建后只需重跑下载脚本即可恢复音频数据

### 2.2 文件位置
- `scripts/download_pronunciation.py` — 新建，与 `import_yaml_to_sqlite.py` 同级
- `scripts/import_yaml_to_sqlite.py` — 修改 `SCHEMA` 常量加 2 列
- 不新增 `scripts/requirements.txt`（保持简洁），脚本顶部 docstring 注明依赖：`pip install requests tqdm`

---

## 3. Schema 变更

### 3.1 `import_yaml_to_sqlite.py` 的 `SCHEMA` 修改

在 `words` 表定义中、`"references" TEXT,` 之后追加：
```sql
audio_uk BLOB,
audio_us BLOB,
```

两列均可空、无默认值。

### 3.2 现有 `words.db` 的一次性迁移

由于现有 DB 不会被 import 脚本重建，下载脚本启动时**自动检测并 ALTER**：
```python
def ensure_audio_columns(conn):
    cols = {row[1] for row in conn.execute("PRAGMA table_info(words)")}
    if "audio_uk" not in cols:
        conn.execute("ALTER TABLE words ADD COLUMN audio_uk BLOB")
    if "audio_us" not in cols:
        conn.execute("ALTER TABLE words ADD COLUMN audio_us BLOB")
    conn.commit()
```

这样开发期不必每次手动重建 DB。

### 3.3 不变项
- `phonetic` TEXT 列、所有引用 `phonetic` 的 Rust/TS/前端代码 — 完全不动
- API JSON 结构不变 — `audio_uk`/`audio_us` **不**进 Rust `Word` struct，不出现在 API 响应中
- 前端展示不变

### 3.4 性能注意
现有 `services/words.rs` 中所有 SELECT 都显式枚举列（没有 `SELECT *`），新增 BLOB 列**不会**让现有查询变慢。

---

## 4. pronounce.json 解析

### 4.1 文件特性
`pronounce.json`（23.4 MB，481,229 行）格式目标是 `dict[str, list[str]]`，但实际存在结构问题：
- 数组有尾随逗号（如 `["url",]`）—— 标准 JSON 解析器报错
- 部分键的值后跟**孤立 URL**（无所属键，例如 line 300290 起 "oxeye daisy" 之后），使 `json.load` 在更深位置失败

### 4.2 解析策略：逐行状态机

不使用 `json` 模块，改为按行扫描：

```python
def parse_pronounce_json(path: str) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    current_key: str | None = None
    url_re = re.compile(r'"(https?://[^"]+\.mp3)"')
    key_re = re.compile(r'"([^"]+)"\s*:\s*\[')

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            m = key_re.search(line)
            if m:
                current_key = m.group(1).lower()
                result.setdefault(current_key, [])
                continue
            if current_key is not None:
                mu = url_re.search(line)
                if mu:
                    result[current_key].append(mu.group(1))
    return result
```

**鲁棒性保证**：
- 遇到新键就切换上下文，孤立 URL（无键的）自然被忽略
- 键统一转小写，因为 `words.word` 在 DB 中可能大小写不一，匹配时大小写不敏感
- 内存占用：~50 MB（可接受）

### 4.3 单词匹配规则
- DB 中的 `word` 字段 normalize 后去 pronounce.json 查找
- normalize = `.strip().lower()`
- 找不到 → 该词两个 BLOB 均留 NULL

---

## 5. URL 分类

### 5.1 严格匹配规则

**只有**显式含以下标记的 URL 才被接受；无标记 URL 一律丢弃：

| 区域 | 接受标记（URL 中出现任一即归类） |
|---|---|
| UK (英式) | `uk_pron`、`/en/UK/`、`uk_`（小写形式匹配） |
| US (美式) | `us_pron`、`/en/US/`、`/1.0/us/`、`us_`（小写形式匹配） |

```python
def classify(url: str) -> str | None:
    low = url.lower()
    if "uk_pron" in low or "/en/uk/" in low or "uk_" in low:
        return "uk"
    if "us_pron" in low or "/en/us/" in low or "/1.0/us/" in low or "us_" in low:
        return "us"
    return None  # 严格匹配：无标记丢弃
```

### 5.2 各字典源的归类结果
| 字典源 | URL 模式 | 归类 |
|---|---|---|
| thefreedictionary.com | `http://img2.tfd.com/pron/mp3/en/UK/...` | UK |
| thefreedictionary.com | `http://img2.tfd.com/pron/mp3/en/US/...` | US |
| oxforddictionaries.com | `http://www.oxforddictionaries.com/media/english/uk_pron/...` | UK |
| vocabulary.com | `http://s3.amazonaws.com/audio.vocabulary.com/1.0/us/...` | US |
| sfdict.com (Dictionary.com) | `http://static.sfdict.com/...` | **丢弃** |
| yourdictionary.com | `http://www.yourdictionary.com/audio/...` | **丢弃** |

预期覆盖率：UK ~30-50%，US ~50-70%（vocabulary.com 占大头）。GRE 生僻词覆盖率会更低。

---

## 6. 下载策略

### 6.1 并发与重试
- `concurrent.futures.ThreadPoolExecutor`，**8 个 worker**
- 单 URL 最多 **3 次尝试**，指数退避 `1s → 2s → 4s`
- 全部失败 → 换该区域下一个 URL；该区域所有 URL 失败 → 对应列留 NULL

### 6.2 HTTP 细节
```python
headers = {"User-Agent": "mywords-pronunciation-downloader/1.0"}
resp = requests.get(url, headers=headers, timeout=15, stream=True)
```

### 6.3 内容校验（下载后立即检查）
- 状态码必须 200
- Content-Type 含 `audio/` 或 `application/octet-stream`（不强制，部分源不标准）
- **MP3 magic bytes 检查**：首 4 字节为下列之一：
  - `FF FB`、`FF F3`、`FF FA`（MPEG frame header）
  - `49 44 33`（即 `ID3`，带标签的 MP3）
- 体积上限：**500 KB**（正常单词发音 10-50 KB，远超则视为异常丢弃）
- 校验失败 → 不重试，直接换下一 URL

### 6.4 单词处理流程
```
对每个 word：
    urls = pronounce_data.get(word.normalized, [])
    uk_urls = [u for u in urls if classify(u) == "uk"]
    us_urls = [u for u in urls if classify(u) == "us"]

    if audio_uk is NULL and uk_urls:
        audio_uk = download_first_success(uk_urls)  # 返回 bytes 或 None

    if audio_us is NULL and us_urls:
        audio_us = download_first_success(us_urls)

    UPDATE words SET audio_uk=?, audio_us=? WHERE id=?
```

### 6.5 幂等 / 断点续传
脚本启动时：
```sql
SELECT id, word FROM words WHERE audio_uk IS NULL OR audio_us IS NULL
```
只处理尚未填满的行 —— 中断后再跑会从断点继续，已有数据的行不动。

### 6.6 进度与统计
- `tqdm` 进度条，按单词计
- 末尾打印：
  - 总词数 / 已处理词数
  - `audio_uk` 成功数 / 失败数 / 无 URL 数
  - `audio_us` 成功数 / 失败数 / 无 URL 数
  - 双 NULL 词数、单 NULL 词数

### 6.7 磁盘占用预估
- 平均 MP3 ~30 KB，10K 词 × 2 区域 ≈ **600 MB** 进入 `words.db`
- 当前 `words.db` ~3 MB → 完成后 ~600 MB
- WAL 模式运行期间临时空间可能翻倍（`words.db-wal`）

### 6.8 依赖
脚本顶部 docstring 注明：`pip install requests tqdm`

---

## 7. 失败处理汇总

| 场景 | 处理 |
|---|---|
| 单词不在 pronounce.json | `audio_uk`、`audio_us` 均留 NULL |
| 该词没有任何 uk 标记 URL | `audio_uk` 留 NULL |
| 该词没有任何 us 标记 URL | `audio_us` 留 NULL |
| 该区域所有 URL 都下载/校验失败 | 对应列留 NULL |
| HTTP 4xx/5xx、超时、连接错误 | 重试 3 次（指数退避），仍失败换下一 URL |
| 校验失败（非 MP3、超 500KB） | 立即换下一 URL，不重试 |

---

## 8. 验收标准

1. `scripts/download_pronunciation.py` 可独立运行：`python scripts/download_pronunciation.py`
2. 启动时自动检测并补齐缺失的 `audio_uk`/`audio_us` 列
3. 运行结束后 `words` 表每行 `audio_uk`/`audio_us`：有数据的是合法 MP3 BLOB，无数据的为 NULL
4. 脚本可重跑：再次运行时只处理 NULL 行，不重复下载已有数据
5. `phonetic` 字段、Rust models/handlers/services、TS types、前端展示全部不变
6. API 响应结构不变（`audio_uk`/`audio_us` 不出现在 `/api/words` 响应中）
7. `cargo build` 仍通过（因为后端代码无需改动）
8. 末尾统计输出清晰反映成功率

---

## 9. 后续可选工作（不在本次范围）

- 音频服务端点：`GET /api/words/{id}/audio/{uk|us}` 返回 `audio/mpeg`
- Rust `Word` struct 增加 `audio_uk`/`audio_us` 字段（用 `#[serde(skip_serializing)]` 或独立端点避免 JSON 膨胀）
- 前端播放器 UI（英/美切换按钮）
- 缺失覆盖率统计 → 决定是否引入第二数据源（如 Free Dictionary API）补 UK

---

## 10. 决策记录

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 数据类型 | MP3 URL / MP3 文件 / IPA / 两者 | **MP3 文件 BLOB**（原 phonetic 保留） | 用户明确要求"音频字段不存文本，直接存 mp3 内容" |
| 数据源 | 参考仓库 / Free Dictionary API / 两者 | **仅 pronounce.json** | 用户指定参考仓库；放弃 IPA 字段后无需第二源 |
| 无标记 URL | 默认 us / 丢弃 | **丢弃** | 用户选择严格匹配，数据更干净 |
| 现有 phonetic | 删除 / 保留备份 / 作为美式 | **完全保留不变** | 用户明确要求 |
| 并发数 | 16 / 8 | **8** | 用户选择，更礼貌 |
| 重试次数 | 1 / 3 | **3** | 用户选择，网络更鲁棒 |
| Schema 集成 | 改 SCHEMA / 脚本自 ALTER | **改 SCHEMA + 自 ALTER 兜底** | 单一来源 + 现有 DB 无需重建即可用 |
