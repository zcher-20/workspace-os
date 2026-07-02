"""Attachment handling functionality — list and download email attachments into input/."""

from pathlib import Path

from src.tools.email import download_attachment, list_attachments

PROMPT: str = (Path(__file__).parent / "attachment_handling.md").read_text(encoding="utf-8")

#: Tools this functionality contributes to the subagent.
TOOLS: list = [list_attachments, download_attachment]

SKILLS: list = []
