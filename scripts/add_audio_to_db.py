#!/usr/bin/env python3
"""Idempotently backfill words.audio_uk / audio_us from audio/{uk,us}/*.opus.

Non-destructive: preserves learning_status and all existing data. Safe to re-run.
Adds the BLOB columns via ALTER TABLE if missing, then UPDATEs each word whose
sanitized name matches a file. Supports --dry-run to report matches without writing.
"""
import argparse
import os
import re
import sqlite3
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_DIR, "words.db")
AUDIO_DIR = os.path.join(PROJECT_DIR, "audio")
VARIANTS = [("audio_uk", "uk"), ("audio_us", "us")]


def sanitize(word: str) -> str:
    """Match the rule in scripts/download_pronunciation.py exactly."""
    s = re.sub(r"[^a-zA-Z0-9-]", "_", word).strip("_.")
    return s or "_"


def column_exists(conn: sqlite3.Connection, column: str) -> bool:
    rows = conn.execute("PRAGMA table_info(words)").fetchall()
    return any(r[1] == column for r in rows)


def ensure_columns(conn: sqlite3.Connection) -> list[str]:
    added = []
    for col, _ in VARIANTS:
        if not column_exists(conn, col):
            conn.execute(f"ALTER TABLE words ADD COLUMN {col} BLOB")
            added.append(col)
    conn.commit()
    return added


def build_file_map(subdir: str) -> dict[str, str]:
    """Map sanitized stem -> absolute path for audio/<subdir>/*.opus."""
    folder = os.path.join(AUDIO_DIR, subdir)
    result: dict[str, str] = {}
    if not os.path.isdir(folder):
        return result
    for name in os.listdir(folder):
        if name.endswith(".opus"):
            stem = name[:-len(".opus")]
            result[stem] = os.path.join(folder, name)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report only, do not write")
    args = parser.parse_args()

    if not os.path.exists(DB_PATH):
        print(f"ERROR: {DB_PATH} not found", file=sys.stderr)
        return 1

    conn = sqlite3.connect(DB_PATH)

    added = ensure_columns(conn)
    if added:
        print(f"Added columns: {', '.join(added)}")
    else:
        print("Columns already present (no ALTER needed).")

    maps = {sub: build_file_map(sub) for _, sub in VARIANTS}
    for _, sub in VARIANTS:
        print(f"  audio/{sub}/*.opus files found: {len(maps[sub])}")

    rows = conn.execute("SELECT id, word FROM words").fetchall()
    total = len(rows)
    print(f"DB words: {total}")

    matched = {"audio_uk": 0, "audio_us": 0}
    orphan_uk = set(maps["uk"]) - {sanitize(w) for _, w in rows}
    orphan_us = set(maps["us"]) - {sanitize(w) for _, w in rows}

    if args.dry_run:
        for word_id, word in rows:
            stem = sanitize(word)
            for col, sub in VARIANTS:
                if stem in maps[sub]:
                    matched[col] += 1
        print("\n[DRY RUN] No changes written.")
        for col, sub in VARIANTS:
            print(f"  would set {col}: {matched[col]} / {total}")
        print(f"  orphan files (no matching DB word) uk: {len(orphan_uk)}, us: {len(orphan_us)}")
        conn.close()
        return 0

    batch = 0
    for word_id, word in rows:
        stem = sanitize(word)
        uk_path = maps["uk"].get(stem)
        us_path = maps["us"].get(stem)
        uk_bytes = open(uk_path, "rb").read() if uk_path else None
        us_bytes = open(us_path, "rb").read() if us_path else None
        if uk_bytes is None and us_bytes is None:
            continue
        conn.execute(
            "UPDATE words SET audio_uk = ?, audio_us = ? WHERE id = ?",
            (uk_bytes, us_bytes, word_id),
        )
        if uk_bytes is not None:
            matched["audio_uk"] += 1
        if us_bytes is not None:
            matched["audio_us"] += 1
        batch += 1
        if batch % 500 == 0:
            conn.commit()
    conn.commit()

    print("\nDone.")
    for col, sub in VARIANTS:
        print(f"  {col} set: {matched[col]} / {total}")
    print(f"  orphan files (no matching DB word) uk: {len(orphan_uk)}, us: {len(orphan_us)}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
