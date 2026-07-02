"""Verbatim, step-by-step run tracing for Deep Agents.

``TraceLogger`` is a LangChain callback handler that records, verbatim, every step of every
agent run — the exact prompt sent to the model and its raw output, plus every tool call and
result — for the **main agent and all subagents**. LangChain callbacks are inheritable down
the run tree, so attaching one instance to the compiled graph (via
``.with_config({"callbacks": [TraceLogger()]})`` in ``agent.py``) captures subagent prompts
automatically, without changing agent behavior.

Output layout — **one directory per top-level run** (subagents included)::

    logs/YYYY/MM/DD/trace_HHMMSS/
        0001_chat_start.txt   # verbatim prompt: each message in order (role/content/tool_calls)
        0002_chat_end.txt     # model output for that call (text + tool_calls)
        0003_tool_start.txt   # tool name + arguments
        0004_tool_end.txt     # tool output (or *_tool_error on failure)
        ...                   # zero-padded, globally incrementing per run
        transcript.md         # all steps concatenated, human-readable in one pass
        index.jsonl           # one line per step: {step, kind, time, node, run_id}

**One folder per run** is achieved by reconstructing the run tree: ``on_chain_start`` records
``parent_run_id`` for *every* run id (without writing a step), and each event walks parents up
to the root run (the one whose parent is ``None``) and writes into that root's folder. The
folder is created lazily the first time a root produces a step.

Logging never affects the agent: all file I/O is wrapped in ``try/except`` and errors are
swallowed. Secrets are never written — only messages, tool arguments, and tool outputs.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler

# src/logging/trace_logger.py → parents: logging → src → project root → root/logs
_LOGS_ROOT = Path(__file__).resolve().parent.parent.parent / "logs"


def _to_str(run_id: Any) -> str | None:
    """Normalize a run id (UUID or str or None) to a string or None."""
    return None if run_id is None else str(run_id)


def _render_message(msg: Any) -> str:
    """Render a single message verbatim: role, name, content, and any tool calls.

    Multimodal/list content is pretty-printed as JSON so nothing is lost.
    """
    role = getattr(msg, "type", msg.__class__.__name__)
    name = getattr(msg, "name", None)
    header = f"[{role}]" + (f" name={name}" if name else "")
    parts = [header]

    content = getattr(msg, "content", msg)
    if isinstance(content, str):
        parts.append(content)
    else:
        try:
            parts.append(json.dumps(content, indent=2, default=str, ensure_ascii=False))
        except Exception:  # noqa: BLE001
            parts.append(repr(content))

    tool_calls = getattr(msg, "tool_calls", None)
    if tool_calls:
        try:
            parts.append("tool_calls:\n" + json.dumps(list(tool_calls), indent=2,
                                                       default=str, ensure_ascii=False))
        except Exception:  # noqa: BLE001
            parts.append(f"tool_calls: {tool_calls!r}")

    # tool_call_id present on ToolMessages — useful for correlating.
    tcid = getattr(msg, "tool_call_id", None)
    if tcid:
        parts.append(f"tool_call_id: {tcid}")
    return "\n".join(parts)


class _Root:
    """Per-root run bookkeeping: its trace directory and a step counter."""

    __slots__ = ("dir", "counter")

    def __init__(self, directory: Path) -> None:
        self.dir = directory
        self.counter = 0


class TraceLogger(BaseCallbackHandler):
    """Callback handler that writes a verbatim, ordered trace per top-level run."""

    def __init__(self) -> None:
        """Initialize empty run-tree state. Trace directories are created lazily."""
        # run_id -> parent_run_id (recorded for EVERY run, including chains).
        self._parents: dict[str, str | None] = {}
        # root_run_id -> _Root (created lazily on the root's first written step).
        self._roots: dict[str, _Root] = {}
        # run_id -> human-readable node/agent label, captured when available.
        self._nodes: dict[str, str] = {}
        self._lock = threading.Lock()

    # --- run-tree bookkeeping ----------------------------------------------------------
    def _record_parent(self, run_id: Any, parent_run_id: Any) -> None:
        """Remember a run's parent (first writer wins) so roots can be found later."""
        rid = _to_str(run_id)
        if rid is None:
            return
        self._parents.setdefault(rid, _to_str(parent_run_id))

    def _find_root(self, run_id: Any) -> str | None:
        """Walk parent links up to the root run (parent ``None`` or unknown)."""
        cur = _to_str(run_id)
        seen: set[str] = set()
        while cur is not None and cur not in seen:
            seen.add(cur)
            parent = self._parents.get(cur)
            if parent is None:  # cur is the root (explicit None, or not-yet-recorded)
                return cur
            cur = parent
        return cur

    def _root_for(self, run_id: Any) -> _Root | None:
        """Resolve (creating lazily) the ``_Root`` that owns ``run_id``."""
        root_id = self._find_root(run_id)
        if root_id is None:
            return None
        root = self._roots.get(root_id)
        if root is None:
            root = _Root(self._new_trace_dir())
            self._roots[root_id] = root
        return root

    def _new_trace_dir(self) -> Path:
        """Create a unique ``logs/YYYY/MM/DD/trace_HHMMSS`` directory."""
        now = datetime.now()
        base = _LOGS_ROOT / now.strftime("%Y") / now.strftime("%m") / now.strftime("%d")
        name = f"trace_{now.strftime('%H%M%S')}"
        directory = base / name
        suffix = 1
        # Disambiguate two roots that start within the same second.
        while directory.exists():
            directory = base / f"{name}_{suffix}"
            suffix += 1
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    # --- step writing ------------------------------------------------------------------
    def _write_step(self, run_id: Any, kind: str, body: str, node: str | None) -> None:
        """Write one numbered step file + transcript + index entry. Never raises."""
        try:
            with self._lock:
                root = self._root_for(run_id)
                if root is None:
                    return
                root.counter += 1
                step = root.counter
                directory = root.dir

            stamp = datetime.now().isoformat(timespec="seconds")
            rid = _to_str(run_id)
            label = node or self._nodes.get(rid or "", "")
            fname = f"{step:04d}_{kind}.txt"
            tags = f"step={step} kind={kind} node={label} run_id={rid} time={stamp}"
            (directory / fname).write_text(f"{tags}\n\n{body}\n", encoding="utf-8")

            with (directory / "transcript.md").open("a", encoding="utf-8") as fh:
                fh.write(f"## {step:04d} · {kind}"
                         + (f" · {label}" if label else "")
                         + f"\n\n```\n{body}\n```\n\n")

            with (directory / "index.jsonl").open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(
                    {"step": step, "kind": kind, "time": stamp, "node": label, "run_id": rid},
                    ensure_ascii=False) + "\n")
        except Exception:  # noqa: BLE001 - tracing must never break the run
            pass

    @staticmethod
    def _node_label(metadata: dict[str, Any] | None) -> str:
        """Pick a readable node/agent label from run metadata, if any."""
        md = metadata or {}
        return str(md.get("langgraph_node") or md.get("lc_agent_name") or "")

    # --- chain hooks (tree only; no step file) -----------------------------------------
    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: UUID | None = None,
        parent_run_id: UUID | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Record this run's parent for EVERY chain run (critical for one-folder-per-run)."""
        self._record_parent(run_id, parent_run_id)
        label = self._node_label(metadata)
        if label and (rid := _to_str(run_id)):
            self._nodes.setdefault(rid, label)

    # --- model hooks -------------------------------------------------------------------
    def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[Any]],
        *,
        run_id: UUID | None = None,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Write the verbatim prompt (all messages, in order) sent to the model."""
        self._record_parent(run_id, parent_run_id)
        label = self._node_label(metadata)
        if label and (rid := _to_str(run_id)):
            self._nodes.setdefault(rid, label)
        flat = [m for batch in messages for m in batch]
        body = (
            f"tags: {tags or []}\n"
            f"messages: {len(flat)}\n"
            "----------------------------------------\n"
            + "\n\n".join(_render_message(m) for m in flat)
        )
        self._write_step(run_id, "chat_start", body, label)

    def on_llm_end(self, response: Any, *, run_id: UUID | None = None, **kwargs: Any) -> None:
        """Write the model's raw output (text + tool calls) for the call."""
        body = ""
        try:
            gen = response.generations[0][0]
            msg = getattr(gen, "message", None)
            body = _render_message(msg) if msg is not None else (gen.text or "")
        except Exception:  # noqa: BLE001
            body = repr(response)
        self._write_step(run_id, "chat_end", body, None)

    # --- tool hooks --------------------------------------------------------------------
    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: UUID | None = None,
        parent_run_id: UUID | None = None,
        inputs: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Write the tool name and arguments (preferring the structured ``inputs``)."""
        self._record_parent(run_id, parent_run_id)
        name = (serialized or {}).get("name", "<tool>")
        if inputs is not None:
            try:
                args = json.dumps(inputs, indent=2, default=str, ensure_ascii=False)
            except Exception:  # noqa: BLE001
                args = repr(inputs)
        else:
            args = input_str
        self._write_step(run_id, "tool_start", f"tool: {name}\nargs:\n{args}",
                         self._node_label(metadata))

    def on_tool_end(self, output: Any, *, run_id: UUID | None = None, **kwargs: Any) -> None:
        """Write the tool's result."""
        text = getattr(output, "content", output)
        self._write_step(run_id, "tool_end", str(text), None)

    def on_tool_error(
        self, error: BaseException, *, run_id: UUID | None = None, **kwargs: Any
    ) -> None:
        """Write a tool error."""
        self._write_step(run_id, "tool_error", repr(error), None)
