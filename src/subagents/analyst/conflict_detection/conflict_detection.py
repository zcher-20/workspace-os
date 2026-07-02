"""Conflict detection functionality — compare facts, flag contradictions, weigh reliability."""

from pathlib import Path

PROMPT: str = (Path(__file__).parent / "conflict_detection.md").read_text(encoding="utf-8")

TOOLS: list = []
SKILLS: list = []
