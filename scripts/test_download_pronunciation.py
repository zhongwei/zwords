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


if __name__ == "__main__":
    unittest.main(verbosity=2)
