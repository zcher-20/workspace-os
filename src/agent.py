"""Entry point — builds and exports ``agent`` for LangGraph (configured by src/config.yaml)."""

from __future__ import annotations

from pathlib import Path

import yaml
from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend, StateBackend
from deepagents.backends.protocol import BackendProtocol
from dotenv import load_dotenv
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph

from src.models import build_chat_model
from src.orchestrator.orchestrator import ORCHESTRATOR
from src.scripts.trace_logger import TraceLogger
from src.subagents.framework import load_subagent

_PKG_DIR = Path(__file__).resolve().parent
load_dotenv(_PKG_DIR / ".env")  # secrets: OPENAI/ANTHROPIC/GOOGLE keys, optional GMAIL_* paths

#: Global configuration only (backend, subagent list, run limits) — see src/config.yaml. Each
#: agent's model + prompt + tools live in its own folder (src/orchestrator/, src/subagents/<n>/).
CONFIG: dict = yaml.safe_load((_PKG_DIR / "config.yaml").read_text(encoding="utf-8"))


def _build_backend() -> BackendProtocol:
    """Build the filesystem/execution backend from config.yaml's `backend:` section.

    Rooted at the workspace (which holds ``skills/`` plus ``input``/``work``/``output``), so
    the agent only sees its workspace — not the project source. **UNSANDBOXED** for
    ``kind: local``; use ``e2b`` / ``langsmith`` for stronger isolation.
    """
    b = CONFIG["backend"]
    root = (_PKG_DIR / b.get("root_dir", "workspace")).resolve()
    kind = str(b.get("kind", "local")).lower()

    if kind == "local":
        for sub in ("input", "work", "output"):
            (root / sub).mkdir(parents=True, exist_ok=True)
        return LocalShellBackend(
            root_dir=str(root),
            # virtual_mode=True roots the file tools at the workspace (paths like /input, /work
            # resolve INSIDE it), so the agent can't roam the real FS, the conversation-history
            # offload can write under the workspace, and the orchestrator's `read_file work/...`
            # fact-check resolves correctly. The `execute` shell still runs with cwd=workspace,
            # so shell commands must use RELATIVE paths (enforced in the prompts).
            virtual_mode=bool(b.get("virtual_mode", True)),
            timeout=int(b.get("execute_timeout", 300)),
            inherit_env=bool(b.get("inherit_env", True)),
        )
    if kind == "state":
        return StateBackend()
    if kind == "e2b":
        from e2b import Sandbox  # type: ignore[import-not-found]
        from langchain_e2b import E2BSandbox  # type: ignore[import-not-found]

        return E2BSandbox(sandbox=Sandbox.create())
    if kind == "langsmith":
        from deepagents.backends import LangSmithSandbox
        from langgraph_sandbox import get_client  # type: ignore[import-not-found]

        return LangSmithSandbox(sandbox=get_client().create_sandbox())

    raise ValueError(f"Unknown backend.kind={kind!r}. Use one of: local, e2b, langsmith, state.")


def _build_subagents() -> list[dict]:
    """Load each enabled subagent from its own self-contained folder under ``src/subagents/``.

    The top-level ``config.yaml`` ``subagents:`` list holds folder names (optionally with
    ``enabled:``). Each folder (``config.yaml`` + ``common_prompt.md`` + ``<name>.py`` + one
    folder per functionality) is assembled by ``src/subagents/framework.py`` — that's where the
    prompt composition, tool union, and skills live. Fine-grained functionality toggles are in
    each subagent's own ``config.yaml``.
    """
    subagents: list[dict] = []
    for entry in CONFIG.get("subagents", []) or []:
        name = entry["name"] if isinstance(entry, dict) else entry
        enabled = entry.get("enabled", True) if isinstance(entry, dict) else True
        if not enabled:
            continue
        subagents.append(load_subagent(_PKG_DIR / "subagents" / name))
    return subagents


def make_agent(
    *,
    checkpointer: BaseCheckpointSaver | bool | None = None,
) -> CompiledStateGraph:
    """Build the Executive Assistant agent.

    Global wiring (model, backend, subagent list, run limits) comes from ``src/config.yaml``;
    the orchestrator's prompt/tools/skills/gate come from ``src/orchestrator/`` (``ORCHESTRATOR``)
    and each subagent from its own folder. Pass a ``MemorySaver`` checkpointer for standalone
    ``invoke`` use (e.g. tests); leave it ``None`` under ``langgraph dev`` (the runtime provides
    persistence for the approval gate).
    """
    model = build_chat_model(ORCHESTRATOR["model"])  # the orchestrator's own model
    backend = _build_backend()
    subagents = _build_subagents()

    graph = create_deep_agent(
        model=model,
        system_prompt=ORCHESTRATOR["system_prompt"],
        tools=ORCHESTRATOR["tools"] or None,
        subagents=subagents or None,
        skills=ORCHESTRATOR["skills"] or None,
        backend=backend,
        interrupt_on=ORCHESTRATOR["interrupt_on"] or None,
        checkpointer=checkpointer,
    )

    run_config: dict = {"recursion_limit": CONFIG["recursion_limit"]}
    if CONFIG.get("trace_logs", True):
        run_config["callbacks"] = [TraceLogger()]
    return graph.with_config(run_config)


agent: CompiledStateGraph = make_agent()
