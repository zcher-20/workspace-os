"""Summarization functionality — executive summary + cited highlights of one document."""

from pathlib import Path

PROMPT: str = (Path(__file__).parent / "summarization.md").read_text(encoding="utf-8")

TOOLS: list = []
SKILLS: list = []
