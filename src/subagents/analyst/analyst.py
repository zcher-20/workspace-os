"""Analyst subagent — assembled from common_prompt.md + its enabled functionalities."""

from pathlib import Path

from src.subagents.framework import assemble_subagent

#: The deepagents subagent definition.
SUBAGENT: dict = assemble_subagent(Path(__file__).parent)
