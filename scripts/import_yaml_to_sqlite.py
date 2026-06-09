#!/usr/bin/env python3
import sqlite3
import yaml
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_DIR, "words.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('toefl', 'gre')),
    stage INTEGER,
    phonetic TEXT,
    pos TEXT,
    meaning_cn TEXT,
    meaning_en TEXT,
    root TEXT,
    association TEXT,
    collocations TEXT,
    derivatives TEXT,
    "references" TEXT,
    UNIQUE(word, source) ON CONFLICT IGNORE
);

CREATE TABLE IF NOT EXISTS examples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER NOT NULL,
    sentence TEXT NOT NULL,
    translation TEXT,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS synonyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER NOT NULL,
    synonym TEXT NOT NULL,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);
CREATE INDEX IF NOT EXISTS idx_words_source ON words(source);
CREATE INDEX IF NOT EXISTS idx_examples_word_id ON examples(word_id);
CREATE INDEX IF NOT EXISTS idx_synonyms_word_id ON synonyms(word_id);
"""


def parse_word(word_text, data, source):
    association = data.get("A") or data.get("L") or data.get("RR") or None
    return {
        "word": word_text,
        "source": source,
        "stage": data.get("ST"),
        "phonetic": data.get("P"),
        "pos": data.get("S"),
        "meaning_cn": data.get("C"),
        "meaning_en": data.get("CC"),
        "root": data.get("R"),
        "association": association,
        "collocations": data.get("CO"),
        "derivatives": data.get("D"),
        "references": data.get("REF"),
    }


def insert_word(cursor, word_data):
    cursor.execute(
        """INSERT INTO words (word, source, stage, phonetic, pos, meaning_cn,
           meaning_en, root, association, collocations, derivatives, "references")
           VALUES (:word, :source, :stage, :phonetic, :pos, :meaning_cn,
                   :meaning_en, :root, :association, :collocations, :derivatives, :references)""",
        word_data,
    )
    return cursor.lastrowid


def insert_examples(cursor, word_id, examples, translations):
    if not examples:
        return
    if isinstance(examples, str):
        examples = [examples]
    translations = translations or []
    if isinstance(translations, str):
        translations = [translations]
    for i, sentence in enumerate(examples):
        sentence = sentence.strip()
        if not sentence:
            continue
        translation = translations[i].strip() if i < len(translations) else None
        cursor.execute(
            "INSERT INTO examples (word_id, sentence, translation) VALUES (?, ?, ?)",
            (word_id, sentence, translation),
        )


def insert_synonyms(cursor, word_id, synonyms_text):
    if not synonyms_text:
        return
    for syn in synonyms_text.split(","):
        syn = syn.strip()
        if syn:
            cursor.execute(
                "INSERT INTO synonyms (word_id, synonym) VALUES (?, ?)",
                (word_id, syn),
            )


def process_file(cursor, yaml_path, source):
    with open(yaml_path, "r", encoding="utf-8") as f:
        content = f.read().replace("\t", "  ")
    entries = yaml.safe_load(content)
    if not entries:
        return
    count = 0
    for entry in entries:
        words = entry.get("words")
        if not words:
            continue
        for word_text, data in words.items():
            if not word_text or not data:
                continue
            word_data = parse_word(word_text, data, source)
            word_id = insert_word(cursor, word_data)
            if word_id == 0:
                conn = cursor.connection
                row = conn.execute(
                    "SELECT id FROM words WHERE word = ? AND source = ?",
                    (word_text, source),
                ).fetchone()
                if row:
                    word_id = row[0]
                else:
                    continue
            insert_examples(cursor, word_id, data.get("E"), data.get("T"))
            insert_synonyms(cursor, word_id, data.get("M"))
            count += 1
    print(f"  {source}: {count} words imported")


def main():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"Removed existing {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    cursor = conn.cursor()

    toefl_path = os.path.join(PROJECT_DIR, "TOEFL_Word_List.yaml")
    gre_path = os.path.join(PROJECT_DIR, "GRE_Word_List.yaml")

    for path, source in [(toefl_path, "toefl"), (gre_path, "gre")]:
        if os.path.exists(path):
            print(f"Processing {source}...")
            process_file(cursor, path, source)
        else:
            print(f"Warning: {path} not found, skipping")

    conn.commit()

    for table in ["words", "examples", "synonyms"]:
        count = cursor.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count} rows")

    conn.close()
    print(f"Done. Database saved to {DB_PATH}")


if __name__ == "__main__":
    main()
