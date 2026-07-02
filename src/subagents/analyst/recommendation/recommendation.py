"""Recommendation functionality — evidence-tied, human-approval draft recommendations."""

from pathlib import Path

PROMPT: str = (Path(__file__).parent / "recommendation.md").read_text(encoding="utf-8")

TOOLS: list = []
SKILLS: list = []
