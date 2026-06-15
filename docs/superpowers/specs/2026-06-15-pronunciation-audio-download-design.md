# Pronunciation Audio Download to Local Directory — Design

**Date**: 2026-06-15
**Status**: Approved (brainstorm), awaiting user spec review
**Scope**: 单次数据采集任务 — 为 `words` 表所有单词从 `pronounce.json` 匹配 URL，下载英式/美式 MP3 到本地目录

**Supersedes**: 之前的 BLOB 入库方案（commit `dfaefc7`，仍保留在 git 历史中供参考）。本设计**完全不修改数据库**。

---

## 1. 背景与目标

### 1.1 当前状态
- `words` 表共 10,096 行（GRE 6,490 + TOEFL 3,606）
- 已有单个 `phonetic` TEXT 字段存储 IPA 文本，贯穿全栈使用中
- 仓库根已有 `pronounce.json`（23.4 MB，481,229 行），格式为 `word: [url1, url2, ...]`，含约 119K 英语词条的 MP3 URL，来源于 Cambridge、Oxford、Dictionary.com、Vocabulary.com、Free Dictionary 等 7 个字典站点

### 1.2 目标
- 为 `words` 表中每个单词，从 `pronounce.json` 匹配 MP3 URL
- 按 URL 区域标记严格分类为英式（uk）和美式（us）
- 下载到本地目录 `audio/uk/{word}.mp3` 和 `audio/us/{word}.mp3`
- 每个区域只下载一个能成功获取的 MP3 即可

### 1.3 非目标（明确不做）
- **不**修改 `words` 表 schema（不加列、不加 BLOB、不加路径字段）
- **不**修改 `import_yaml_to_sqlite.py`
- **不**修改任何 Rust / TS / 前端代码
- **不**通过 API 暴露音频
- **不**将 `audio/` 目录纳入 git 跟踪
- **不**收集 IPA 文本字段

---

## 2. 文件与目录

### 2.1 新增文件
- `scripts/download_pronunciation.py` — 独立下载脚本

### 2.2 新增目录（运行时创建）
```
audio/
├── uk/
│   ├── abandon.mp3
│   ├── accomplishment.mp3
│   └── ...
└── us/
    ├── abandon.mp3
    ├── accomplishment.mp3
    └── ...
```

### 2.3 文件名净化规则
DB 中 `word` 可能含空格、点号、斜杠等不允许或不宜出现在文件名中的字符（例如 `.22 caliber`、`knee-high`、`faux pas`）。统一规则：

```python
def sanitize(word: str) -> str:
    # 非 [a-zA-Z0-9-] 字符替换为 _，并 strip 首尾的下划线/点号
    s = re.sub(r"[^a-zA-Z0-9-]", "_", word).strip("_.")
    return s or "_"
```

| 原 word | 净化后文件名 |
|---|---|
| `accomplishment` | `accomplishment.mp3` |
| `.22 caliber` | `22_caliber.mp3` |
| `knee-high` | `knee-high.mp3`（保留连字符） |
| `faux pas` | `faux_pas.mp3` |

冲突风险：极低。不同 word 净化后冲突时，后到的覆盖先到的（可接受；并在统计中报告）。

### 2.4 gitignore
在根 `.gitignore` 追加：
```
# Pronunciation audio (large, externally sourced)
audio/
```

`pronounce.json` 也建议加入 `.gitignore`（23 MB 外部数据），但这是用户的决定，本次不在范围内强制。

---

## 3. pronounce.json 解析

### 3.1 文件特性
`pronounce.json`（23.4 MB，481,229 行）格式目标是 `dict[str, list[str]]`，但实际存在结构问题：
- 数组有尾随逗号（如 `["url",]`）—— 标准 JSON 解析器报错
- 部分键的值后跟**孤立 URL**（无所属键），使 `json.load` 在更深位置失败

### 3.2 解析策略：逐行状态机

不使用 `json` 模块，按行扫描：

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

**鲁棒性**：遇到新键即切换上下文，孤立 URL（无键的）自然被丢弃；键统一转小写以支持大小写不敏感匹配。内存占用约 50 MB。

### 3.3 单词匹配
- 从 DB `SELECT word FROM words` 取所有 10,096 词
- normalize = `.strip().lower()`
- 用 normalized key 查 pronounce.json

---

## 4. URL 分类（严格匹配）

### 4.1 规则
**只有**显式含以下标记的 URL 才被接受；无标记 URL 一律丢弃：

| 区域 | 接受标记（URL 中出现任一即归类） |
|---|---|
| UK (英式) | `uk_pron`、`/en/uk/`、`uk_`（小写匹配） |
| US (美式) | `us_pron`、`/en/us/`、`/1.0/us/`、`us_`（小写匹配） |

```python
def classify(url: str) -> str | None:
    low = url.lower()
    if "uk_pron" in low or "/en/uk/" in low or "uk_" in low:
        return "uk"
    if "us_pron" in low or "/en/us/" in low or "/1.0/us/" in low or "us_" in low:
        return "us"
    return None
```

### 4.2 各字典源归类结果
| 字典源 | 归类 |
|---|---|
| thefreedictionary.com `/en/UK/` | UK |
| thefreedictionary.com `/en/US/` | US |
| oxforddictionaries.com `uk_pron` | UK |
| vocabulary.com `/1.0/us/` | US |
| sfdict.com（Dictionary.com） | **丢弃** |
| yourdictionary.com | **丢弃** |

预期覆盖率：UK ~30-50%，US ~50-70%（vocabulary.com 占大头）。GRE 生僻词覆盖率会更低。

---

## 5. 下载策略

### 5.1 并发与重试
- `concurrent.futures.ThreadPoolExecutor`，**8 个 worker**
- 单 URL 最多 **3 次尝试**，指数退避 `1s → 2s → 4s`
- 全部失败 → 换该区域下一个 URL；该区域所有 URL 失败 → 该 word 该区域不生成文件

### 5.2 HTTP 细节
```python
headers = {"User-Agent": "mywords-pronunciation-downloader/1.0"}
resp = requests.get(url, headers=headers, timeout=15, stream=True)
```

### 5.3 内容校验
- 状态码必须 200
- **MP3 magic bytes 检查**（首 4 字节为下列之一）：
  - `FF FB`、`FF F3`、`FF FA`（MPEG frame header）
  - `49 44 33`（即 `ID3`，带标签的 MP3）
- 体积上限：**500 KB**（正常单词发音 10-50 KB，远超则视为异常丢弃）
- 校验失败 → 不重试，直接换下一 URL

### 5.4 单词处理流程
```
对每个 word：
    if audio/uk/{sanitized}.mp3 已存在：跳过 uk
    if audio/us/{sanitized}.mp3 已存在：跳过 us

    urls = pronounce_data.get(word.normalized, [])
    uk_urls = [u for u in urls if classify(u) == "uk"]
    us_urls = [u for u in urls if classify(u) == "us"]

    if 不跳过 uk and uk_urls：
        bytes = download_first_success(uk_urls)
        if bytes: write to audio/uk/{sanitized}.mp3

    if 不跳过 us and us_urls：
        bytes = download_first_success(us_urls)
        if bytes: write to audio/us/{sanitized}.mp3
```

### 5.5 幂等 / 断点续传
脚本启动时检查目标文件是否已存在，已存在的跳过该区域 —— 中断后再跑会从断点继续，已有文件不动。

### 5.6 进度与统计
- `tqdm` 进度条，按单词计
- 末尾打印：
  - 总词数 / 已处理词数
  - UK 文件成功数 / 失败数 / 无 URL 数 / 已存在跳过数
  - US 文件成功数 / 失败数 / 无 URL 数 / 已存在跳过数
  - 文件名冲突警告（如有）

### 5.7 磁盘占用预估
- 平均 MP3 ~30 KB，10K 词 × 2 区域 ≈ **600 MB** 落到 `audio/` 目录

### 5.8 依赖
脚本顶部 docstring 注明：`pip install requests tqdm`

---

## 6. 失败处理汇总

| 场景 | 处理 |
|---|---|
| 单词不在 pronounce.json | 不生成任何文件，统计入 "无 URL" |
| 该词没有任何 uk 标记 URL | 不生成 `audio/uk/...`，统计入 "无 URL" |
| 该词没有任何 us 标记 URL | 不生成 `audio/us/...`，统计入 "无 URL" |
| 该区域所有 URL 都下载/校验失败 | 不生成对应文件，统计入 "失败" |
| HTTP 4xx/5xx、超时、连接错误 | 重试 3 次（指数退避），仍失败换下一 URL |
| 校验失败（非 MP3、超 500KB） | 立即换下一 URL，不重试 |
| 目标文件已存在 | 跳过，统计入 "已存在" |

---

## 7. 验收标准

1. `python scripts/download_pronunciation.py` 可独立运行
2. 运行前自动创建 `audio/uk/` 和 `audio/us/` 目录
3. 运行结束后，每个有可用源的 word 在对应区域目录下有 `{sanitized}.mp3` 文件，且都是合法 MP3
4. 脚本可重跑：再次运行时已存在的文件跳过，不重复下载
5. `words.db`、Rust 代码、TS 代码、前端代码全部不变
6. `.gitignore` 包含 `audio/`
7. `cargo build` 仍通过（后端代码无改动）
8. 末尾统计输出清晰反映各区域成功率与失败原因分布

---

## 8. 后续可选工作（不在本次范围）

- 若决定入库：可将 `audio/` 文件读为 BLOB 写入 `words.audio_uk/audio_us` 列（即原 commit `dfaefc7` 方案）
- 或 DB 新增 `audio_uk_path`/`audio_us_path` TEXT 列存相对路径
- 音频服务端点：`GET /api/words/{id}/audio/{uk|us}` 返回 `audio/mpeg`
- 前端播放器 UI（英/美切换按钮）
- 缺失覆盖率统计 → 决定是否引入第二数据源（如 Free Dictionary API）补 UK

---

## 9. 决策记录

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 数据存储 | DB BLOB / 本地文件 + DB 路径 / 仅本地文件 | **仅本地文件** | 用户改主意：先看下载质量再谈后续集成 |
| 数据源 | 参考仓库 / Free Dictionary API / 两者 | **仅 pronounce.json** | 用户指定参考仓库 |
| 无标记 URL | 默认 us / 丢弃 | **丢弃** | 用户选择严格匹配 |
| 目录结构 | 子目录 / 全平 / 按 id | **区域子目录 audio/uk/、audio/us/** | 人读友好，便于按区域整体备份/删除 |
| 文件命名 | word / id | **word（净化后）** | 与子目录方案配套，便于人工查找 |
| 并发数 | 16 / 8 | **8** | 用户选择，更礼貌 |
| 重试次数 | 1 / 3 | **3** | 用户选择，网络更鲁棒 |
| 文件名净化 | 严格安全字符 / 仅去斜杠 | **非 `[a-zA-Z0-9-]` 替换为 `_`** | 跨平台安全，可读性好 |
