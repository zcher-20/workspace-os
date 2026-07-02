"""Fact extraction functionality — atomic fact table across the sources."""

from pathlib import Path

PROMPT: str = (Path(__file__).parent / "fact_extraction.md").read_text(encoding="utf-8")

TOOLS: list = []
SKILLS: list = []
