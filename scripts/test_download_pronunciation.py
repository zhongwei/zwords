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
