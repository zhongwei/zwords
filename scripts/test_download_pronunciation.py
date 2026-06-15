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


if __name__ == "__main__":
    unittest.main(verbosity=2)
