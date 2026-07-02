"""Compose a subagent from a folder of togglable *functionalities*.

Each subagent lives in its own folder ``src/subagents/<name>/`` with this layout::

    <name>/
        config.yaml          # name, description, optional model/skills, ordered functionalities
        common_prompt.md     # the base role prompt shared by every functionality
        <name>.py            # SUBAGENT = assemble_subagent(Path(__file__).parent)
        <functionality>/
            <functionality>.md   # the prompt fragment this functionality adds
            <functionality>.py   # PROMPT / TOOLS / SKILLS it contributes

The subagent's final ``system_prompt`` is ``common_prompt.md`` followed by the ``.md`` of each
**enabled** functionality (in the order listed in ``config.yaml``). Its ``tools`` is the union
of the functionalities' ``TOOLS`` (so an empty union means the subagent has no custom tools and
cannot, e.g., send email). Its ``skills`` is the subagent's base ``skills`` plus any a
functionality contributes.

**Toggling**
- Disable a functionality: set ``enabled: false`` on it in the subagent's ``config.yaml``
  (or drop it from the list). Its prompt fragment *and* its tools disappear together.
- Disable a whole subagent: set ``enabled: false`` for it in the top-level ``src/config.yaml``
  ``subagents:`` list.

Modules under a functionality folder are loaded **by file path**, so functionality folders need
no ``__init__.py`` — only this ``subagents`` package does (for ``from src.subagents.framework``).
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

import yaml

from src.models import build_chat_model


def _load_py(path: Path) -> Any:
    """Import a single ``.py`` file by path (no package/``__init__`` required)."""
    mod_name = f"_dyn_{path.parent.name}_{path.stem}"
    spec = importlib.util.spec_from_file_location(mod_name, path)
    if spec is None or spec.loader is None:  # pragma: no cover - defensive
        raise ImportError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def assemble_subagent(subagent_dir: Path) -> dict:
    """Build one deepagents subagent dict from ``subagent_dir`` and its functionalities."""
    cfg = yaml.safe_load((subagent_dir / "config.yaml").read_text(encoding="utf-8"))

    prompt_parts: list[str] = [(subagent_dir / "common_prompt.md").read_text(encoding="utf-8").rstrip()]
    tools: list = []
    skills: list = list(cfg.get("skills") or [])

    for entry in cfg.get("functionalities", []) or []:
        name = entry["name"] if isinstance(entry, dict) else entry
        enabled = entry.get("enabled", True) if isinstance(entry, dict) else True
        if not enabled:
            continue
        mod = _load_py(subagent_dir / name / f"{name}.py")
        fragment = str(getattr(mod, "PROMPT", "")).rstrip()
        if fragment:
            prompt_parts.append(fragment)
        tools.extend(getattr(mod, "TOOLS", []) or [])
        for skill in getattr(mod, "SKILLS", []) or []:
            if skill not in skills:
                skills.append(skill)

    sub: dict = {
        "name": cfg["name"],
        "description": " ".join(cfg["description"].split()),  # collapse YAML folding/newlines
        "system_prompt": "\n\n".join(p for p in prompt_parts if p),
        # `tools` present (even []) REPLACES the inherited set entirely — an empty union means
        # the subagent keeps only the built-in filesystem/execute tools (e.g. cannot send email).
        "tools": tools,
    }
    if skills:
        sub["skills"] = skills
    if cfg.get("model"):  # omit to inherit the orchestrator's model
        # Build the model OBJECT here (not a string) so the `google:` alias is applied — deepagents
        # would otherwise pass the raw string to init_chat_model, which doesn't know `google`.
        sub["model"] = build_chat_model(cfg["model"])
    if cfg.get("interrupt_on"):
        sub["interrupt_on"] = {name: True for name in cfg["interrupt_on"]}
    return sub


def load_subagent(subagent_dir: Path) -> dict:
    """Load a subagent folder's ``<name>.py`` and return its ``SUBAGENT`` dict."""
    name = subagent_dir.name
    module = _load_py(subagent_dir / f"{name}.py")
    return module.SUBAGENT
