"""Email ingestion functionality — find and read the source Gmail message."""

from pathlib import Path

from src.tools.email import read_email, search_inbox

PROMPT: str = (Path(__file__).parent / "email_ingestion.md").read_text(encoding="utf-8")

#: Tools this functionality contributes to the subagent (read-only mail).
TOOLS: list = [search_inbox, read_email]

#: Extra skill directories this functionality needs (none — extraction owns the skills).
SKILLS: list = []
