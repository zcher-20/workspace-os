"""The Orchestrator (manager) definition — prompt + its own tools/skills/approval gate.

The orchestrator is the top-level Deep Agent: it routes each request to a subagent (`intake`,
`reader`, `analyst`) via the `task` tool, **fact-checks** their output, and **owns email**.

This module owns everything orchestrator-specific, symmetric with each subagent's ``<name>.py``:
it reads ``config.yaml`` (its tools, skills, approval gate) and ``system_prompt.md`` next to it,
and exposes :data:`ORCHESTRATOR` — the spec that ``agent.py`` plugs into ``create_deep_agent``
alongside the global model/backend/checkpointer.
"""

from pathlib import Path

import yaml

from src.tools.email import TOOLS as EMAIL_TOOLS

_DIR = Path(__file__).parent
_CFG: dict = yaml.safe_load((_DIR / "config.yaml").read_text(encoding="utf-8"))
_REGISTRY: dict = {tool.name: tool for tool in EMAIL_TOOLS}

#: The orchestrator's full system prompt (the manager's instructions).
SYSTEM_PROMPT: str = (_DIR / "system_prompt.md").read_text(encoding="utf-8").rstrip()

#: The orchestrator's spec (model + prompt + resolved tools + skills + gate) for agent.py.
ORCHESTRATOR: dict = {
    "model": _CFG["model"],  # spec ("provider:model" or {name, ...}); built in agent.py
    "system_prompt": SYSTEM_PROMPT,
    "tools": [_REGISTRY[name] for name in _CFG.get("tools", []) or []],
    "skills": list(_CFG.get("skills") or []),
    "interrupt_on": {name: True for name in _CFG.get("interrupt_on", []) or []},
}
