"""Cited Q&A functionality — grounded, cited answers and follow-up Q&A on one document."""

from pathlib import Path

PROMPT: str = (Path(__file__).parent / "cited_qa.md").read_text(encoding="utf-8")

TOOLS: list = []
SKILLS: list = []
