# Pronunciation Audio Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Python script `scripts/download_pronunciation.py` that reads `words.db` and `pronounce.json`, downloads British/American MP3 pronunciation for every word into `audio/uk/` and `audio/us/`.

**Architecture:** Single-file Python script with pure-function core (parser, classifier, sanitizer, validator) wrapped by I/O functions (HTTP download, file write, DB read). Pure functions get unit tests via Python stdlib `unittest`. Impure functions verified by smoke test.

**Tech Stack:** Python 3.14 stdlib + `requests` + `tqdm` (both already installed). Tests use stdlib `unittest` — no new deps.

**Spec:** `docs/superpowers/specs/2026-06-15-pronunciation-audio-download-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/download_pronunciation.py` | Main script — all parsing, classification, download, orchestration logic |
| `scripts/test_download_pronunciation.py` | Unit tests for pure functions (sanitize, classify, parse_pronounce_json, is_mp3) |
| `.gitignore` | Add `audio/` entry to keep downloaded MP3s out of git |

**Import strategy:** Tests live next to the script and import via `sys.path` manipulation (no package init files needed). Run with: `python scripts/test_download_pronunciation.py` (uses `unittest.main()`).

---

## Task 1: Create script and test skeletons

**Files:**
- Create: `scripts/download_pronunciation.py`
- Create: `scripts/test_download_pronunciation.py`

- [ ] **Step 1: Create script skeleton**

Write `scripts/download_pronunciation.py`:

```python
#!/usr/bin/env python3
"""Download British/American MP3 pronunciation for every word in words.db.

Source data: pronounce.json (a dict[str, list[str]] mapping each word to MP3 URLs).
Output: audio/uk/{word}.mp3 and audio/us/{word}.mp3 under the project root.

Usage:
    python scripts/download_pronunciation.py
    python scripts/download_pronunciation.py --workers 4     # smaller concurrency
    python scripts/download_pronunciation.py --limit 20     # smoke test on 20 words

Dependencies: requests, tqdm  (pip install requests tqdm)

See docs/superpowers/specs/2026-06-15-pronunciation-audio-download-design.md
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

import requests
from tqdm import tqdm

# --- Paths ---------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DB_PATH = PROJECT_DIR / "words.db"
PRONOUNCE_PATH = PROJECT_DIR / "pronounce.json"
AUDIO_ROOT = PROJECT_DIR / "audio"
UK_DIR = AUDIO_ROOT / "uk"
US_DIR = AUDIO_ROOT / "us"

# --- HTTP ----------------------------------------------------------------
HTTP_TIMEOUT = 15            # seconds
MAX_RETRIES = 3              # attempts per URL
BACKOFF_BASE = 1.0           # seconds; exponential: 1, 2, 4
MAX_BYTES = 500 * 1024       # 500 KB cap; normal word MP3 is 10-50 KB
USER_AGENT = "mywords-pronunciation-downloader/1.0"
HEADERS = {"User-Agent": USER_AGENT}

# MP3 magic byte prefixes (frame sync or ID3 tag)
MP3_MAGIC = (b"\xff\xfb", b"\xff\xf3", b"\xff\xfa", b"\xff\xf2", b"\xff\xf4", b"ID3")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=8, help="Concurrent download workers (default 8)")
    parser.add_argument("--limit", type=int, default=None, help="Process only first N words (smoke test)")
    args = parser.parse_args()
    print(f"[plan] DB={DB_PATH}  pronounce={PRONOUNCE_PATH}  workers={args.workers}  limit={args.limit}")
    print("[plan] skeleton only — implement in later tasks")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Create test skeleton**

Write `scripts/test_download_pronunciation.py`:

```python
#!/usr/bin/env python3
"""Unit tests for pure functions in download_pronunciation.py.

Run:  python scripts/test_download_pronunciation.py
"""
import sys
import unittest
from pathlib import Path

# Allow importing the script by path (no package structure)
sys.path.insert(0, str(Path(__file__).resolve().parent))

import download_pronunciation as dp  # noqa: E402


if __name__ == "__main__":
    unittest.main(verbosity=2)
```

- [ ] **Step 3: Verify both files are syntactically valid**

Run: `python -c "import scripts.download_pronunciation"` from `C:\Dev\zwords`
Expected: no output, exit 0

Run: `python scripts/test_download_pronunciation.py`
Expected: `OK` (no test cases yet, but the module imports successfully)

Run: `python scripts/download_pronunciation.py`
Expected: prints `[plan] DB=... ...` and `[plan] skeleton only — implement in later tasks`

- [ ] **Step 4: Commit**

```bash
git add scripts/download_pronunciation.py scripts/test_download_pronunciation.py
git commit -m "feat(scripts): scaffold pronunciation download script and tests"
```

---

## Task 2: TDD `sanitize(word)` — filename sanitizer

**Files:**
- Modify: `scripts/download_pronunciation.py` (add `sanitize` function)
- Modify: `scripts/test_download_pronunciation.py` (add test class)

**Spec ref:** §2.3 — replace any char not in `[a-zA-Z0-9-]` with `_`, strip leading/trailing `_` and `.`.

- [ ] **Step 1: Write the failing test**

In `scripts/test_download_pronunciation.py`, **replace** the body (everything after the `import download_pronunciation as dp` line, before `if __name__ == "__main__":`) with:

```python
class TestSanitize(unittest.TestCase):
    def test_plain_word(self):
        self.assertEqual(dp.sanitize("accomplishment"), "accomplishment")

    def test_spaces_become_underscores(self):
        self.assertEqual(dp.sanitize("faux pas"), "faux_pas")

    def test_leading_dot_stripped(self):
        # ".22 caliber" -> "22_caliber" (leading dot stripped, space -> _)
        self.assertEqual(dp.sanitize(".22 caliber"), "22_caliber")

    def test_hyphen_preserved(self):
        self.assertEqual(dp.sanitize("knee-high"), "knee-high")

    def test_slash_replaced(self):
        self.assertEqual(dp.sanitize("and/or"), "and_or")

    def test_empty_or_all_invalid(self):
        self.assertEqual(dp.sanitize("..."), "_")

    def test_trailing_underscore_stripped(self):
        self.assertEqual(dp.sanitize("word!"), "word")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python scripts/test_download_pronunciation.py`
Expected: `AttributeError: module 'download_pronunciation' has no attribute 'sanitize'` (or similar), tests FAIL

- [ ] **Step 3: Implement `sanitize`**

In `scripts/download_pronunciation.py`, add this function **above** `def main()`:

```python
def sanitize(word: str) -> str:
    """Make a word safe to use as a filename.

    Any char not in [a-zA-Z0-9-] becomes '_'; leading/trailing '_' and '.' are stripped.
    If the result is empty, returns '_' (never empty, so always a valid filename).
    """
    s = re.sub(r"[^a-zA-Z0-9-]", "_", word).strip("_.")
    return s or "_"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/test_download_pronunciation.py`
Expected: `OK` (all 7 `TestSanitize` tests pass)

- [ ] **Step 5: Commit**

```bash
git add scripts/download_pronunciation.py scripts/test_download_pronunciation.py
git commit -m "feat(scripts): add filename sanitizer with unit tests"
```

---

## Task 3: TDD `classify(url)` — UK/US strict classifier

**Files:**
- Modify: `scripts/download_pronunciation.py`
- Modify: `scripts/test_download_pronunciation.py`

**Spec ref:** §4.1 — strict matching; only URLs with explicit `uk_pron` / `/en/uk/` / `uk_` markers are UK; only URLs with `us_pron` / `/en/us/` / `/1.0/us/` / `us_` markers are US; everything else returns `None`.

- [ ] **Step 1: Write the failing test**

In `scripts/test_download_pronunciation.py`, **add this class** below `TestSanitize`:

```python
class TestClassify(unittest.TestCase):
    def test_tfd_uk(self):
        url = "http://img2.tfd.com/pron/mp3/en/UK/d3/d3slsodysjht.mp3"
        self.assertEqual(dp.classify(url), "uk")

    def test_tfd_us(self):
        url = "http://img2.tfd.com/pron/mp3/en/US/d3/d3slsodysjht.mp3"
        self.assertEqual(dp.classify(url), "us")

    def test_oxford_uk_pron(self):
        url = "http://www.oxforddictionaries.com/media/english/uk_pron/a/abe/abele/abele__gb_2_8.mp3"
        self.assertEqual(dp.classify(url), "uk")

    def test_vocabulary_us(self):
        url = "http://s3.amazonaws.com/audio.vocabulary.com/1.0/us/A/1IFDVKNEVQTHP.mp3"
        self.assertEqual(dp.classify(url), "us")

    def test_uk_underscore_marker(self):
        url = "http://example.com/audio/uk_somefile.mp3"
        self.assertEqual(dp.classify(url), "uk")

    def test_us_underscore_marker(self):
        url = "http://example.com/audio/us_somefile.mp3"
        self.assertEqual(dp.classify(url), "us")

    def test_case_insensitive(self):
        url = "http://example.com/AUDIO/US_FILE.MP3"
        self.assertEqual(dp.classify(url), "us")

    def test_unmarked_discarded(self):
        # sfdict (Dictionary.com) - no region marker
        url = "http://static.sfdict.com/staticrep/dictaudio/A00/A0015900.mp3"
        self.assertIsNone(dp.classify(url))

    def test_yourdictionary_discarded(self):
        url = "http://www.yourdictionary.com/audio/a/ab/abele.mp3"
        self.assertIsNone(dp.classify(url))

    def test_random_unmarked_discarded(self):
        url = "http://example.com/audio/abele.mp3"
        self.assertIsNone(dp.classify(url))

    def test_uk_takes_precedence_over_us_in_path(self):
        # If both markers appear, UK wins (check order matters).
        # This is an edge case unlikely in real data; pick deterministic behavior.
        url = "http://example.com/uk_pron/us/file.mp3"
        self.assertEqual(dp.classify(url), "uk")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python scripts/test_download_pronunciation.py`
Expected: `AttributeError: module 'download_pronunciation' has no attribute 'classify'`

- [ ] **Step 3: Implement `classify`**

In `scripts/download_pronunciation.py`, add this function below `sanitize`:

```python
def classify(url: str) -> str | None:
    """Classify a pronunciation URL as 'uk', 'us', or None (discard).

    Strict matching: only URLs containing an explicit region marker are accepted.
    UK markers: 'uk_pron', '/en/uk/', 'uk_'
    US markers: 'us_pron', '/en/us/', '/1.0/us/', 'us_'
    UK is checked first; if both match (unlikely), UK wins.
    """
    low = url.lower()
    if "uk_pron" in low or "/en/uk/" in low or "uk_" in low:
        return "uk"
    if "us_pron" in low or "/en/us/" in low or "/1.0/us/" in low or "us_" in low:
        return "us"
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/test_download_pronunciation.py`
Expected: `OK` (all 11 new tests + 7 from Task 2 pass)

- [ ] **Step 5: Commit**

```bash
git add scripts/download_pronunciation.py scripts/test_download_pronunciation.py
git commit -m "feat(scripts): add strict UK/US URL classifier with unit tests"
```

---

## Task 4: TDD `parse_pronounce_json(path)` — tolerant line-based parser

**Files:**
- Modify: `scripts/download_pronunciation.py`
- Modify: `scripts/test_download_pronunciation.py`

**Spec ref:** §3.2 — file has trailing commas and orphan URLs that break `json.load`; use a line-by-line state machine.

- [ ] **Step 1: Write the failing test**

In `scripts/test_download_pronunciation.py`, **add** `import tempfile` and `import os` at the top, and add this class below `TestClassify`:

```python
class TestParsePronounceJson(unittest.TestCase):
    def _write(self, content: str) -> str:
        fd, path = tempfile.mkstemp(suffix=".json", text=True)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        self.addCleanup(os.remove, path)
        return path

    def test_basic_two_words(self):
        path = self._write(
            '{\n'
            '    "abel": [\n'
            '        "http://example.com/abel_us.mp3"\n'
            '    ],\n'
            '    "abele": [\n'
            '        "http://example.com/abele_uk.mp3",\n'
            '        "http://example.com/abele_us.mp3"\n'
            '    ]\n'
            '}'
        )
        result = dp.parse_pronounce_json(path)
        self.assertEqual(result, {
            "abel": ["http://example.com/abel_us.mp3"],
            "abele": ["http://example.com/abele_uk.mp3", "http://example.com/abele_us.mp3"],
        })

    def test_trailing_comma_tolerated(self):
        path = self._write(
            '{"abel": [\n'
            '    "http://example.com/abel.mp3",\n'   # trailing comma
            ']}'
        )
        result = dp.parse_pronounce_json(path)
        self.assertEqual(result, {"abel": ["http://example.com/abel.mp3"]})

    def test_keys_lowercased(self):
        path = self._write('{"Abel": ["http://x/y.mp3"]}')
        result = dp.parse_pronounce_json(path)
        self.assertEqual(result, {"abel": ["http://x/y.mp3"]})

    def test_empty_array(self):
        path = self._write('{"empty": []}')
        result = dp.parse_pronounce_json(path)
        self.assertEqual(result, {"empty": []})

    def test_orphan_urls_after_key_ignored(self):
        # Mirrors real file corruption: after "oxeye daisy" there are orphan URLs.
        path = self._write(
            '{\n'
            '    "oxeye daisy": [\n'
            '        "http://a/1.mp3"\n'
            '    ],\n'
            '        "http://orphan/2.mp3",\n'   # no key context after closing
            '        "http://orphan/3.mp3"\n'
            '}'
        )
        result = dp.parse_pronounce_json(path)
        # Orphan URLs (no preceding "key": [ on a recent line) are silently dropped
        self.assertEqual(result, {"oxeye daisy": ["http://a/1.mp3"]})

    def test_https_and_uppercase_scheme(self):
        path = self._write('{"x": ["https://example.com/a.mp3"]}')
        result = dp.parse_pronounce_json(path)
        self.assertEqual(result, {"x": ["https://example.com/a.mp3"]})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python scripts/test_download_pronunciation.py`
Expected: `AttributeError: module 'download_pronunciation' has no attribute 'parse_pronounce_json'`

- [ ] **Step 3: Implement `parse_pronounce_json`**

In `scripts/download_pronunciation.py`, add this function below `classify`:

```python
def parse_pronounce_json(path: str | Path) -> dict[str, list[str]]:
    """Parse the (malformed) pronounce.json into a dict[str, list[str]].

    The file has trailing commas and orphan URLs that break json.load, so we scan
    line-by-line: when a line contains "key": [, switch current key; when a line
    contains an MP3 URL, append it to current key's list. Orphan URLs (no current
    key or appearing after a key was closed and not reopened) get dropped.
    """
    url_re = re.compile(r'"(https?://[^"]+\.mp3)"', re.IGNORECASE)
    key_re = re.compile(r'"([^"]+)"\s*:\s*\[')
    result: dict[str, list[str]] = {}
    current_key: str | None = None

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            m = key_re.search(line)
            if m:
                current_key = m.group(1).lower()
                result.setdefault(current_key, [])
                continue
            mu = url_re.search(line)
            if mu and current_key is not None:
                result[current_key].append(mu.group(1))
    return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/test_download_pronunciation.py`
Expected: `OK` (all 6 new tests + previous pass)

- [ ] **Step 5: Verify parser handles the real pronounce.json**

Run: `python -c "import sys; sys.path.insert(0, 'scripts'); import download_pronunciation as dp; d = dp.parse_pronounce_json('pronounce.json'); print('entries:', len(d)); print('sample keys:', list(d.keys())[:3]); print('abel:', d.get('abel', 'NOT FOUND'))"`
Expected: prints a large entry count (around 100K+), a few sample keys like `abel`, `abele`, `abelia`, and a URL list for `abel`.

- [ ] **Step 6: Commit**

```bash
git add scripts/download_pronunciation.py scripts/test_download_pronunciation.py
git commit -m "feat(scripts): add tolerant line-based pronounce.json parser"
```

---

## Task 5: TDD `is_mp3(data)` — magic byte validator

**Files:**
- Modify: `scripts/download_pronunciation.py`
- Modify: `scripts/test_download_pronunciation.py`

**Spec ref:** §5.3 — first bytes must be one of MPEG frame sync (`FF FB`/`FF F3`/`FF FA`/`FF F2`/`FF F4`) or `ID3` tag.

- [ ] **Step 1: Write the failing test**

In `scripts/test_download_pronunciation.py`, **add this class** below `TestParsePronounceJson`:

```python
class TestIsMp3(unittest.TestCase):
    def test_mpeg_frame_sync_fffb(self):
        self.assertTrue(dp.is_mp3(b"\xff\xfb\x90\x00" + b"\x00" * 100))

    def test_mpeg_frame_sync_fff3(self):
        self.assertTrue(dp.is_mp3(b"\xff\xf3" + b"\x00" * 100))

    def test_id3_tag(self):
        self.assertTrue(dp.is_mp3(b"ID3\x03\x00\x00\x00" + b"\x00" * 100))

    def test_html_not_mp3(self):
        self.assertFalse(dp.is_mp3(b"<html><body>404</body></html>"))

    def test_json_error_not_mp3(self):
        self.assertFalse(dp.is_mp3(b'{"error": "not found"}'))

    def test_empty(self):
        self.assertFalse(dp.is_mp3(b""))

    def test_too_short(self):
        self.assertFalse(dp.is_mp3(b"\xff"))

    def test_png_signature_not_mp3(self):
        self.assertFalse(dp.is_mp3(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python scripts/test_download_pronunciation.py`
Expected: `AttributeError: module 'download_pronunciation' has no attribute 'is_mp3'`

- [ ] **Step 3: Implement `is_mp3`**

In `scripts/download_pronunciation.py`, add this function below `parse_pronounce_json`:

```python
def is_mp3(data: bytes) -> bool:
    """Return True iff data starts with a valid MP3 magic-byte prefix."""
    if len(data) < 2:
        return False
    return data.startswith(MP3_MAGIC)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/test_download_pronunciation.py`
Expected: `OK` (all 8 new tests + previous pass)

- [ ] **Step 5: Commit**

```bash
git add scripts/download_pronunciation.py scripts/test_download_pronunciation.py
git commit -m "feat(scripts): add MP3 magic-byte validator with unit tests"
```

---

## Task 6: Implement `download_url(url)` — HTTP GET with retries + validation

**Files:**
- Modify: `scripts/download_pronunciation.py`

**Spec ref:** §5.2, §5.3 — GET with timeout, User-Agent; 3 attempts with exponential backoff (1s/2s/4s); validate status 200 + MP3 magic bytes + size cap.

This function makes real HTTP calls — verified by smoke test (Task 10), not unit tests.

- [ ] **Step 1: Implement `download_url`**

In `scripts/download_pronunciation.py`, add this function below `is_mp3`:

```python
def download_url(url: str) -> bytes | None:
    """Download a URL and return validated MP3 bytes, or None on failure.

    Tries up to MAX_RETRIES times with exponential backoff. Returns None if:
    - HTTP status is not 200 after retries
    - Body fails MP3 magic-byte check (no retry — bad content rarely recovers)
    - Body exceeds MAX_BYTES
    - requests raises ConnectionError/Timeout after all retries
    """
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT, stream=True)
            if resp.status_code != 200:
                resp.close()
                last_exc = RuntimeError(f"HTTP {resp.status_code}")
            else:
                # Read up to MAX_BYTES + 1 (so we can detect oversize)
                data = resp.raw.read(MAX_BYTES + 1)
                resp.close()
                if len(data) > MAX_BYTES:
                    return None  # too big — don't retry, just fail
                if not is_mp3(data):
                    return None  # bad content — don't retry
                return data
        except (requests.ConnectionError, requests.Timeout, requests.ChunkedEncodingError) as e:
            last_exc = e
        # Only back off if we're going to retry
        if attempt < MAX_RETRIES - 1:
            time.sleep(BACKOFF_BASE * (2 ** attempt))
    # All retries exhausted
    return None
```

- [ ] **Step 2: Verify syntax + module loads**

Run: `python -c "import sys; sys.path.insert(0, 'scripts'); import download_pronunciation as dp; print('OK', dp.download_url.__name__)"`
Expected: prints `OK download_url`

- [ ] **Step 3: Quick manual probe against a known-good URL**

Run:
```
python -c "import sys; sys.path.insert(0, 'scripts'); import download_pronunciation as dp; b = dp.download_url('http://s3.amazonaws.com/audio.vocabulary.com/1.0/us/A/1IFDVKNEVQTHP.mp3'); print('bytes:', len(b) if b else None)"
```
Expected: prints `bytes:` followed by a number in the thousands to tens-of-thousands range. (This URL is for "abelia" from the spec sample.) If the URL is offline (returns None), try a few other URLs from `pronounce.json` until one works — the goal is just to confirm the function returns bytes for a reachable URL.

- [ ] **Step 4: Commit**

```bash
git add scripts/download_pronunciation.py
git commit -m "feat(scripts): add HTTP download with retries and MP3 validation"
```

---

## Task 7: Implement `download_first_success(urls)` — try URLs in order

**Files:**
- Modify: `scripts/download_pronunciation.py`

**Spec ref:** §5.4 — within a region, try URLs in listed order; return first that downloads + validates successfully.

- [ ] **Step 1: Implement `download_first_success`**

In `scripts/download_pronunciation.py`, add this function below `download_url`:

```python
def download_first_success(urls: list[str]) -> bytes | None:
    """Try each URL in order; return the first successfully downloaded MP3 bytes.

    Returns None if all URLs fail.
    """
    for url in urls:
        data = download_url(url)
        if data is not None:
            return data
    return None
```

- [ ] **Step 2: Verify load**

Run: `python -c "import sys; sys.path.insert(0, 'scripts'); import download_pronunciation as dp; print(dp.download_first_success([]))"`
Expected: prints `None`

- [ ] **Step 3: Commit**

```bash
git add scripts/download_pronunciation.py
git commit -m "feat(scripts): add download_first_success helper"
```

---

## Task 8: Implement `process_word(...)` — handle one word end-to-end

**Files:**
- Modify: `scripts/download_pronunciation.py`

**Spec ref:** §5.4 — per-word logic: check existing files (skip if present), classify URLs, download first success per region, write file.

- [ ] **Step 1: Implement `process_word`**

In `scripts/download_pronunciation.py`, add this function below `download_first_success`:

```python
def process_word(
    word: str,
    pronounce_urls: list[str],
) -> dict[str, str]:
    """Process a single word: classify URLs, download UK+US if not already on disk.

    Returns a dict with keys 'uk' and 'us', each one of:
      'ok'         — file written this run
      'exists'     — file already existed, skipped
      'no_url'     — no classified URL for this region
      'failed'     — had URLs but all downloads failed validation
    """
    fname = sanitize(word) + ".mp3"
    uk_path = UK_DIR / fname
    us_path = US_DIR / fname

    uk_urls: list[str] = []
    us_urls: list[str] = []
    for url in pronounce_urls:
        region = classify(url)
        if region == "uk":
            uk_urls.append(url)
        elif region == "us":
            us_urls.append(url)

    result: dict[str, str] = {}

    # UK
    if uk_path.exists():
        result["uk"] = "exists"
    elif not uk_urls:
        result["uk"] = "no_url"
    else:
        data = download_first_success(uk_urls)
        if data is None:
            result["uk"] = "failed"
        else:
            uk_path.write_bytes(data)
            result["uk"] = "ok"

    # US
    if us_path.exists():
        result["us"] = "exists"
    elif not us_urls:
        result["us"] = "no_url"
    else:
        data = download_first_success(us_urls)
        if data is None:
            result["us"] = "failed"
        else:
            us_path.write_bytes(data)
            result["us"] = "ok"

    return result
```

- [ ] **Step 2: Verify load**

Run: `python -c "import sys; sys.path.insert(0, 'scripts'); import download_pronunciation as dp; print(dp.process_word.__name__)"`
Expected: prints `process_word`

- [ ] **Step 3: Commit**

```bash
git add scripts/download_pronunciation.py
git commit -m "feat(scripts): add per-word processing logic"
```

---

## Task 9: Implement `main()` — full orchestration

**Files:**
- Modify: `scripts/download_pronunciation.py`

**Spec ref:** §5.1, §5.5, §5.6 — load pronounce.json once, read all words from DB, run concurrently with N workers, tqdm progress, idempotent (skip existing), final stats summary.

- [ ] **Step 1: Replace the skeleton `main()` with the full implementation**

In `scripts/download_pronunciation.py`, **replace** the existing `main` function (the one that prints `[plan] ...`) with:

```python
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download British/American MP3 pronunciation for every word in words.db.",
    )
    parser.add_argument("--workers", type=int, default=8, help="Concurrent download workers (default 8)")
    parser.add_argument("--limit", type=int, default=None, help="Process only first N words (smoke test)")
    args = parser.parse_args()

    # --- Sanity checks on inputs ----------------------------------------
    if not DB_PATH.exists():
        print(f"ERROR: database not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)
    if not PRONOUNCE_PATH.exists():
        print(f"ERROR: pronounce.json not found at {PRONOUNCE_PATH}", file=sys.stderr)
        sys.exit(1)

    # --- Create output directories --------------------------------------
    UK_DIR.mkdir(parents=True, exist_ok=True)
    US_DIR.mkdir(parents=True, exist_ok=True)

    # --- Load pronounce.json (tolerant parser) --------------------------
    print(f"Loading {PRONOUNCE_PATH.name} ...")
    pronounce = parse_pronounce_json(PRONOUNCE_PATH)
    print(f"  {len(pronounce):,} entries loaded")

    # --- Read all words from DB -----------------------------------------
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT word FROM words ORDER BY id").fetchall()
    conn.close()
    words = [r[0] for r in rows]
    if args.limit is not None:
        words = words[: args.limit]
    print(f"  {len(words):,} words to process")

    # --- Build work items: (word, urls_or_empty_list) -------------------
    work: list[tuple[str, list[str]]] = []
    missing_in_json = 0
    for w in words:
        urls = pronounce.get(w.strip().lower(), [])
        if not urls:
            missing_in_json += 1
        work.append((w, urls))

    # --- Run concurrently ------------------------------------------------
    stats = {
        "uk": {"ok": 0, "exists": 0, "no_url": 0, "failed": 0},
        "us": {"ok": 0, "exists": 0, "no_url": 0, "failed": 0},
    }

    with cf.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process_word, w, urls): w for w, urls in work}
        for fut in tqdm(cf.as_completed(futures), total=len(futures), desc="words", unit="word"):
            word = futures[fut]
            try:
                result = fut.result()
            except Exception as e:
                print(f"\n[warn] {word!r} raised {type(e).__name__}: {e}", file=sys.stderr)
                continue
            for region in ("uk", "us"):
                stats[region][result[region]] += 1

    # --- Summary ---------------------------------------------------------
    print("\n=== Summary ===")
    print(f"Total words processed: {len(work):,}")
    print(f"Words missing from pronounce.json: {missing_in_json:,}")
    for region, label in [("uk", "UK (British)"), ("us", "US (American)")]:
        s = stats[region]
        total = sum(s.values())
        print(f"\n{label}:")
        print(f"  downloaded this run : {s['ok']:>6,}")
        print(f"  already existed     : {s['exists']:>6,}")
        print(f"  no classified URL   : {s['no_url']:>6,}")
        print(f"  all downloads failed: {s['failed']:>6,}")
        if total:
            coverage = (s['ok'] + s['exists']) / total * 100
            print(f"  coverage            : {coverage:>5.1f}%  ({s['ok'] + s['exists']:,}/{total:,})")

    print(f"\nOutput: {AUDIO_ROOT}")
```

- [ ] **Step 2: Smoke-run on 5 words to verify the full pipeline**

Run: `python scripts/download_pronunciation.py --limit 5 --workers 4`
Expected:
- prints "Loading pronounce.json ..." then "X entries loaded"
- prints "5 words to process"
- a `tqdm` progress bar going from 0 to 5
- a `=== Summary ===` block with non-zero counts in some categories
- creates files under `audio/uk/` and/or `audio/us/` (depending on coverage)

- [ ] **Step 3: Verify idempotency by re-running**

Run: `python scripts/download_pronunciation.py --limit 5 --workers 4`
Expected: identical to step 2, BUT in the summary, `already existed` is now ≥ the previous `downloaded this run` count, and `downloaded this run` is 0 (because files already exist).

- [ ] **Step 4: Spot-check a downloaded file is a real MP3**

Run from `C:\Dev\zwords`: `ls -la audio/uk/ audio/us/ 2>/dev/null` to see what files exist.
Then for any existing file (substitute actual name), check its first bytes:
`python -c "p='audio/uk/FILENAME.mp3'; d=open(p,'rb').read(4); print(p, d.hex(), d[:3])"`
Expected: hex starts with `fffb`, `fff3`, `fff2`, `fff4`, or `494433` (ID3), confirming MP3.

- [ ] **Step 5: Commit**

```bash
git add scripts/download_pronunciation.py
git commit -m "feat(scripts): wire up main pipeline with concurrency and stats"
```

---

## Task 10: Update `.gitignore` to exclude `audio/`

**Files:**
- Modify: `.gitignore`

**Spec ref:** §2.4 — downloaded MP3s (~600 MB) must not be tracked by git.

- [ ] **Step 1: Read current `.gitignore` to find a good insertion point**

Run: read `C:\Dev\zwords\.gitignore` (already known from spec phase). The relevant block at the bottom is the "SQLite runtime files" section.

- [ ] **Step 2: Append the audio rule**

Edit `.gitignore` — find this block (near the SQLite section):

```
# SQLite runtime files (regenerate on every server run with WAL mode)
words.db-shm
words.db-wal
```

Append immediately after the `words.db-wal` line:

```

# Pronunciation audio (large, externally sourced)
audio/
```

- [ ] **Step 3: Verify audio/ is ignored**

Run: `git check-ignore -v audio/uk/somefile.mp3` (substitute any file that exists, or just check the directory)
Expected: prints a line showing `.gitignore:N:audio/` matching.

Run: `git status`
Expected: `audio/` does NOT appear in untracked files.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore downloaded audio directory"
```

---

## Task 11: Full run + final verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full download (10,096 words, 8 workers)**

Run: `python scripts/download_pronunciation.py`
Expected duration: 15-40 minutes depending on network and how many URLs fail/retry. tqdm shows progress; expect 50-70% US coverage and 30-50% UK coverage per spec estimate.

If interrupted: just re-run the same command — it skips files that already exist (idempotent).

- [ ] **Step 2: Check final stats and coverage numbers**

When the run completes, the summary block reports per-region coverage. Sanity check:
- US coverage should be ≥ 40% (vocabulary.com is a major source)
- UK coverage should be ≥ 20% (TFD + Oxford)
- "all downloads failed" counts should be small (< 10% of words that had URLs)

If coverage is wildly off (e.g., 0%), inspect failures: try `python scripts/download_pronunciation.py --limit 10 --workers 2` and watch stderr for warnings, check that pronounce.json parsing returned ~100K+ entries.

- [ ] **Step 3: Check disk usage**

Run from `C:\Dev\zwords`: `du -sh audio/` (Linux/macOS) or check folder properties in Windows Explorer.
Expected: between 100 MB and 800 MB depending on coverage.

- [ ] **Step 4: Verify no DB / Rust / TS / frontend changes leaked in**

Run: `git status`
Expected: clean (all changes committed in earlier tasks).

Run: `git diff main -- src/ web/ scripts/import_yaml_to_sqlite.py 2>/dev/null | head` (use the appropriate base branch name if `main` is wrong)
Expected: empty (no changes to Rust source, frontend, or the existing YAML import script).

- [ ] **Step 5: Run Rust build sanity check**

Run: `cargo build`
Expected: compiles successfully (no code changes were made to Rust, so this confirms nothing was accidentally broken).

- [ ] **Step 6: Final commit (if any cleanup needed)**

If everything is clean and committed, no commit needed. If any docs were touched during verification:

```bash
git add -A
git commit -m "docs: note pronunciation audio download completion"
```

---

## Self-Review Checklist (already applied during plan writing)

- **Spec coverage:** All 9 spec sections have at least one implementing task.
  - §1 (Background) — N/A (context)
  - §2 (Files & dirs) — Task 1 (script), Task 10 (gitignore), Task 9 (mkdir)
  - §2.3 (Filename sanitization) — Task 2
  - §3 (Parser) — Task 4
  - §4 (URL classification) — Task 3
  - §5 (Download strategy) — Tasks 6, 7, 8, 9
  - §6 (Failure handling) — encoded in `download_url`, `process_word`, and stats
  - §7 (Acceptance) — Tasks 9, 10, 11 verify each criterion
  - §8 (Followups) — out of scope, noted in spec
  - §9 (Decisions) — encoded in constants and function behavior
- **Placeholder scan:** All code blocks are complete; no TBD/TODO.
- **Type consistency:** `sanitize(word: str) -> str`, `classify(url: str) -> str | None`, `parse_pronounce_json(path) -> dict[str, list[str]]`, `is_mp3(data: bytes) -> bool`, `download_url(url: str) -> bytes | None`, `download_first_success(urls: list[str]) -> bytes | None`, `process_word(word, urls) -> dict[str, str]` — all signatures consistent across tasks.
