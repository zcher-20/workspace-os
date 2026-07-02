"""DeepAgent integration — builds the Executive Assistant agent from deepagents."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import yaml
from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.state import CompiledStateGraph

from agent.config import OPENAI_MODEL
import agent.email_tools as email_tools_module

if TYPE_CHECKING:
    from agent.gmail_client import GmailClient

_AGENT_DIR = Path(__file__).resolve().parent
_CONFIG_PATH = _AGENT_DIR / "deep_config.yaml"
_WORKSPACE = _AGENT_DIR / "workspace"

_SYSTEM_PROMPT = (_AGENT_DIR / "orchestrator" / "system_prompt.md").read_text(encoding="utf-8").rstrip() \
    if (_AGENT_DIR / "orchestrator" / "system_prompt.md").exists() else """You are an Executive Assistant — a powerful autonomous agent.

You work in a real workspace filesystem:
- `input/` — source files uploaded by the user
- `work/` — scratch space for intermediate work
- `output/` — final deliverables
- `skills/` — document skill scripts (READ SKILL.md before using any skill)

Document skills available: pdf, docx, pptx, xlsx.
Always plan before acting with write_todos. Read the relevant SKILL.md before touching any document.
Report what files you produced in output/ when finished.

Email tools (when Gmail is connected): search_inbox, read_email, list_attachments,
download_attachment, draft_email, send_email.
NEVER send email without calling draft_email first and showing the user the draft.
send_email is gated — it requires user approval before it actually runs."""


def make_deep_agent(gmail_client: "GmailClient | None" = None) -> CompiledStateGraph:
    """Build the DeepAgent. Pass a GmailClient to enable email tools."""
    config: dict = yaml.safe_load(_CONFIG_PATH.read_text(encoding="utf-8"))
    m_cfg = config.get("model", {})

    # ── Model ──────────────────────────────────────────────────────────────────
    raw_name = m_cfg.get("name", OPENAI_MODEL)
    model_name = raw_name if ":" in raw_name else f"openai:{raw_name}"
    model_kwargs: dict = {"disable_streaming": bool(m_cfg.get("disable_streaming", False))}
    if model_name.startswith("openai:") and m_cfg.get("use_responses_api", True):
        try:
            model = init_chat_model(model_name, use_responses_api=True, **model_kwargs)
        except TypeError:
            model = init_chat_model(model_name, **model_kwargs)
    else:
        model = init_chat_model(model_name, **model_kwargs)

    # ── Workspace dirs ─────────────────────────────────────────────────────────
    for sub in ("input", "work", "output"):
        (_WORKSPACE / sub).mkdir(parents=True, exist_ok=True)

    # ── Backend ────────────────────────────────────────────────────────────────
    b_cfg = config.get("backend", {})
    backend = LocalShellBackend(
        root_dir=str(_WORKSPACE),
        virtual_mode=False,
        timeout=int(b_cfg.get("execute_timeout", 300)),
        inherit_env=bool(b_cfg.get("inherit_env", True)),
    )

    # ── Email tools ────────────────────────────────────────────────────────────
    tools = None
    interrupt_on = None
    if gmail_client is not None:
        email_tools_module.init(gmail_client, _WORKSPACE)
        tools = email_tools_module.EMAIL_TOOLS
        interrupt_on = {"send_email": True}

    # ── Checkpointer (required for interrupt/resume) ───────────────────────────
    checkpointer = MemorySaver()

    # ── Build graph ────────────────────────────────────────────────────────────
    graph = create_deep_agent(
        model=model,
        system_prompt=_SYSTEM_PROMPT,
        tools=tools,
        skills=config.get("skills", ["skills"]),
        backend=backend,
        interrupt_on=interrupt_on,
        checkpointer=checkpointer,
    )

    return graph.with_config({"recursion_limit": config.get("recursion_limit", 1000)})
