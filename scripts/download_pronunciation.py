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


def sanitize(word: str) -> str:
    """Make a word safe to use as a filename.

    Any char not in [a-zA-Z0-9-] becomes '_'; leading/trailing '_' and '.' are stripped.
    If the result is empty, returns '_' (never empty, so always a valid filename).
    """
    s = re.sub(r"[^a-zA-Z0-9-]", "_", word).strip("_.")
    return s or "_"


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
            if current_key is not None:
                for url in url_re.findall(line):
                    result[current_key].append(url)
            if "]" in line:
                current_key = None
    return result


def is_mp3(data: bytes) -> bool:
    """Return True iff data starts with a valid MP3 magic-byte prefix."""
    if len(data) < 2:
        return False
    return data.startswith(MP3_MAGIC)


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
                data = resp.raw.read(MAX_BYTES + 1)
                resp.close()
                if len(data) > MAX_BYTES:
                    return None
                if not is_mp3(data):
                    return None
                return data
        except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError) as e:
            last_exc = e
        if attempt < MAX_RETRIES - 1:
            time.sleep(BACKOFF_BASE * (2 ** attempt))
    return None


def download_first_success(urls: list[str]) -> bytes | None:
    """Try each URL in order; return the first successfully downloaded MP3 bytes.

    Returns None if all URLs fail.
    """
    for url in urls:
        data = download_url(url)
        if data is not None:
            return data
    return None


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


if __name__ == "__main__":
    main()
