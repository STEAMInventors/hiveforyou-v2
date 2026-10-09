"""Guardrails for reproducible production dependency pins (T3.7)."""

from __future__ import annotations

import re
from pathlib import Path


AGENTS_DIR = Path(__file__).resolve().parents[1]
LOCK_PATH = AGENTS_DIR / "uv.lock"


def _package_version(lock_text: str, name: str) -> str:
    pattern = rf'\[\[package\]\]\nname = "{re.escape(name)}"\nversion = "([^"]+)"'
    match = re.search(pattern, lock_text)
    assert match, f"{name} not found in uv.lock"
    return match.group(1)


def test_uv_lock_pins_tested_runtime_versions() -> None:
    assert LOCK_PATH.is_file(), "Run `uv lock` in agents/ to generate uv.lock"
    text = LOCK_PATH.read_text(encoding="utf-8")
    assert _package_version(text, "dspy") == "3.4.0"
    assert _package_version(text, "litellm") == "1.104.2"


def test_uv_lock_includes_linux_arm64_wheels() -> None:
    text = LOCK_PATH.read_text(encoding="utf-8")
    assert "manylinux2014_aarch64" in text or "aarch64" in text


def test_pyproject_requires_python_312_plus() -> None:
    pyproject = (AGENTS_DIR / "pyproject.toml").read_text(encoding="utf-8")
    assert ">=3.12" in pyproject
