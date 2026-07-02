"""Document extraction functionality — extract each source to text via the document skills.

Uses the subagent's built-in ``execute`` + the ``skills`` (declared as the intake subagent's
base skills in config.yaml), so it contributes a prompt fragment but no extra tools.
"""

from pathlib import Path

PROMPT: str = (Path(__file__).parent / "document_extraction.md").read_text(encoding="utf-8")

TOOLS: list = []

#: Extraction relies on the document skills; they are the intake subagent's base skills.
SKILLS: list = []
