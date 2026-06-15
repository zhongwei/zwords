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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=8, help="Concurrent download workers (default 8)")
    parser.add_argument("--limit", type=int, default=None, help="Process only first N words (smoke test)")
    args = parser.parse_args()
    print(f"[plan] DB={DB_PATH}  pronounce={PRONOUNCE_PATH}  workers={args.workers}  limit={args.limit}")
    print("[plan] skeleton only — implement in later tasks")


if __name__ == "__main__":
    main()
