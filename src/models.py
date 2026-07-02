"""Chat-model construction shared by the orchestrator and every subagent.

Accepts a *model spec* — either a ``"provider:model"`` string or a dict with ``name`` plus
options (``use_responses_api``, ``disable_streaming``) — and returns a LangChain chat model.

A small provider-alias map lets configs use the friendly ``google:`` prefix (mapped to the
``google_genai`` provider that ``init_chat_model`` expects). OpenAI's Responses API is enabled
for OpenAI models unless turned off.
"""

from __future__ import annotations

from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel

#: Friendly provider names (used in config) → the provider ids init_chat_model expects.
_PROVIDER_ALIASES = {"google": "google_genai"}


def build_chat_model(spec: str | dict) -> BaseChatModel:
    """Build a chat model from a ``"provider:model"`` string or a ``{"name": ...}`` dict."""
    if isinstance(spec, str):
        spec = {"name": spec}
    provider, sep, model = spec["name"].partition(":")
    provider = _PROVIDER_ALIASES.get(provider, provider)
    name = f"{provider}{sep}{model}" if sep else provider

    kwargs: dict = {"disable_streaming": bool(spec.get("disable_streaming", False))}
    # Responses API accepts `file` content blocks (PDFs) that chat-completions rejects; OpenAI-only.
    if provider == "openai" and spec.get("use_responses_api", True):
        kwargs["use_responses_api"] = True
    return init_chat_model(name, **kwargs)
