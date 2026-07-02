"""Email (Gmail) tools — a themed list of LangChain ``@tool`` functions.

Enable tools by listing their names in ``config.yaml``'s ``tools:``; gate ``send_email`` via
``config.yaml``'s ``interrupt_on:`` (sending is irreversible). The module-level
:data:`TOOLS` collects every tool defined here.

Auth uses Google OAuth (``credentials.json`` + ``token.json`` — see the README and
``scripts/gmail_auth.py``). The Gmail service is built lazily and cached; if email is not
installed/authorized, the tools return a clear message rather than crashing the agent.
"""

from __future__ import annotations

import base64
import mimetypes
import os
from email.message import EmailMessage
from functools import lru_cache
from pathlib import Path
from typing import Any

from langchain_core.tools import tool

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_WORKSPACE = Path(__file__).resolve().parent.parent / "workspace"  # backend root (input/output/…)
_SCOPES = ["https://mail.google.com/"]


def _resolve_attachment(path: str) -> Path:
    """Resolve an attachment path under the workspace (e.g. ``output/answers.docx``).

    Must stay inside the workspace — the agent can only attach files it produced/downloaded.
    """
    p = Path(path)
    full = (p if p.is_absolute() else _WORKSPACE / p).resolve()
    root = _WORKSPACE.resolve()
    if full != root and root not in full.parents:
        raise ValueError(f"Attachment must be inside the workspace: {path!r}")
    if not full.is_file():
        raise FileNotFoundError(f"Attachment not found: {path!r}")
    return full


class _GmailNotConfigured(RuntimeError):
    """Raised (and caught in the tools) when Gmail is not installed/authorized."""


def _credentials_paths() -> tuple[Path, Path]:
    """Resolve the (client-secrets, token) file paths from env or defaults."""
    creds = Path(os.environ.get("GMAIL_CREDENTIALS_FILE", str(_PROJECT_ROOT / "credentials.json")))
    token = Path(os.environ.get("GMAIL_TOKEN_FILE", str(_PROJECT_ROOT / "token.json")))
    return creds, token


@lru_cache(maxsize=1)
def _service() -> Any:
    """Build and cache the Gmail API resource. Raises :class:`_GmailNotConfigured` if unset."""
    creds_file, token_file = _credentials_paths()
    if not creds_file.is_file():
        raise _GmailNotConfigured(
            f"Gmail is not configured: no client secrets at {creds_file}. See the README."
        )
    try:
        from langchain_google_community.gmail.utils import (
            build_resource_service,
            get_gmail_credentials,
        )
    except ImportError as exc:  # pragma: no cover - depends on optional extra
        raise _GmailNotConfigured("Email extra not installed: pip install '.[email]'.") from exc

    # NOTE: `client_sercret_file` is misspelled in langchain-google-community's API — keep it.
    credentials = get_gmail_credentials(
        token_file=str(token_file), scopes=_SCOPES, client_sercret_file=str(creds_file)
    )
    return build_resource_service(credentials=credentials)


def _raw(to: str, subject: str, body: str, attachments: list[str] | None = None) -> str:
    """Build a base64url-encoded RFC-822 message (with optional file attachments)."""
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    for path in attachments or []:
        f = _resolve_attachment(path)
        ctype, _ = mimetypes.guess_type(f.name)
        maintype, subtype = (ctype or "application/octet-stream").split("/", 1)
        msg.add_attachment(f.read_bytes(), maintype=maintype, subtype=subtype, filename=f.name)
    return base64.urlsafe_b64encode(msg.as_bytes()).decode()


def _b64url_decode(data: str) -> bytes:
    """Decode Gmail's base64url payload, tolerating missing padding."""
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _walk_parts(payload: dict):
    """Yield every MIME part of a message payload, recursing into nested parts."""
    stack = [payload]
    while stack:
        part = stack.pop()
        yield part
        stack.extend(part.get("parts", []) or [])


def _attachment_parts(payload: dict) -> list[dict]:
    """Return the parts that are attachments (have a filename)."""
    return [p for p in _walk_parts(payload) if p.get("filename")]


def _plain_text(payload: dict) -> str:
    """Extract the plain-text body from a Gmail message payload (recursing into parts)."""
    if payload.get("mimeType", "").startswith("text/plain"):
        data = payload.get("body", {}).get("data")
        if data:
            return _b64url_decode(data).decode("utf-8", "replace")
    for part in payload.get("parts", []) or []:
        text = _plain_text(part)
        if text:
            return text
    return ""


@tool
def search_inbox(query: str = "is:unread", max_results: int = 10) -> str:
    """Search Gmail and list matching messages (id, from, subject, snippet).

    `query` uses Gmail search syntax, e.g. 'is:unread', 'from:alice@example.com',
    'subject:invoice newer_than:7d'.
    """
    try:
        svc = _service()
    except _GmailNotConfigured as exc:
        return str(exc)
    found = svc.users().messages().list(userId="me", q=query, maxResults=max_results).execute()
    messages = found.get("messages", [])
    if not messages:
        return f"No messages match: {query!r}"
    lines = []
    for m in messages:
        meta = (
            svc.users()
            .messages()
            .get(userId="me", id=m["id"], format="metadata", metadataHeaders=["From", "Subject"])
            .execute()
        )
        headers = {h["name"]: h["value"] for h in meta.get("payload", {}).get("headers", [])}
        lines.append(
            f"- id={m['id']} | from={headers.get('From', '?')} | "
            f"subject={headers.get('Subject', '(no subject)')} | {meta.get('snippet', '')}"
        )
    return "\n".join(lines)


@tool
def read_email(message_id: str) -> str:
    """Read one Gmail message by id: From/To/Subject/Date and the plain-text body."""
    try:
        svc = _service()
    except _GmailNotConfigured as exc:
        return str(exc)
    msg = svc.users().messages().get(userId="me", id=message_id, format="full").execute()
    payload = msg.get("payload", {})
    headers = {h["name"]: h["value"] for h in payload.get("headers", [])}
    body = _plain_text(payload).strip()
    attachments = _attachment_parts(payload)
    att_note = (
        f"\n\n📎 {len(attachments)} attachment(s): "
        + ", ".join(p.get("filename", "?") for p in attachments)
        + " — use list_attachments / download_attachment to access them."
        if attachments
        else ""
    )
    return (
        f"From: {headers.get('From', '?')}\n"
        f"To: {headers.get('To', '?')}\n"
        f"Subject: {headers.get('Subject', '(no subject)')}\n"
        f"Date: {headers.get('Date', '?')}\n\n{body}{att_note}"
    )


@tool
def draft_email(to: str, subject: str, body: str, attachments: list[str] | None = None) -> str:
    """Create a Gmail draft (does NOT send). Returns the draft id.

    `attachments`: optional list of workspace file paths to attach (e.g.
    ``["output/answers.docx"]``). The files must live inside the workspace.
    """
    try:
        svc = _service()
    except _GmailNotConfigured as exc:
        return str(exc)
    try:
        raw = _raw(to, subject, body, attachments)
    except (ValueError, FileNotFoundError) as exc:
        return f"Attachment error: {exc}"
    draft = svc.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
    return f"Draft created (id={draft['id']}) to {to}."


@tool
def send_email(to: str, subject: str, body: str, attachments: list[str] | None = None) -> str:
    """Send an email via Gmail. Sending is irreversible — gate this tool for approval.

    `attachments`: optional list of workspace file paths to attach (e.g.
    ``["output/answers.docx"]``). The files must live inside the workspace.
    """
    try:
        svc = _service()
    except _GmailNotConfigured as exc:
        return str(exc)
    try:
        raw = _raw(to, subject, body, attachments)
    except (ValueError, FileNotFoundError) as exc:
        return f"Attachment error: {exc}"
    sent = svc.users().messages().send(userId="me", body={"raw": raw}).execute()
    note = f" with {len(attachments)} attachment(s)" if attachments else ""
    return f"Email sent to {to}{note} (id={sent['id']})."


@tool
def list_attachments(message_id: str) -> str:
    """List a Gmail message's attachments: filename, type, size, and attachment_id.

    Pass the attachment_id (with the message_id and filename) to ``download_attachment``.
    """
    try:
        svc = _service()
    except _GmailNotConfigured as exc:
        return str(exc)
    msg = svc.users().messages().get(userId="me", id=message_id, format="full").execute()
    parts = _attachment_parts(msg.get("payload", {}))
    if not parts:
        return f"No attachments on message {message_id}."
    lines = []
    for p in parts:
        body = p.get("body", {})
        lines.append(
            f"- filename={p.get('filename', '?')} | type={p.get('mimeType', '?')} | "
            f"size={body.get('size', 0)}B | attachment_id={body.get('attachmentId')}"
        )
    return "\n".join(lines)


@tool
def download_attachment(message_id: str, attachment_id: str, filename: str) -> str:
    """Download a Gmail attachment into the workspace ``input/`` folder.

    Get ``message_id``/``attachment_id``/``filename`` from ``list_attachments`` first. The file
    lands in ``input/`` so you can then process it with the document skills (e.g. an emailed
    PDF → the ``pdf`` skill). Returns the saved relative path.
    """
    try:
        svc = _service()
    except _GmailNotConfigured as exc:
        return str(exc)
    att = (
        svc.users()
        .messages()
        .attachments()
        .get(userId="me", messageId=message_id, id=attachment_id)
        .execute()
    )
    data = att.get("data")
    if not data:
        return f"Attachment {attachment_id} returned no data."
    raw = _b64url_decode(data)
    safe = Path(filename).name or "attachment"  # strip any path components
    dest_dir = Path(__file__).resolve().parent.parent / "workspace" / "input"
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / safe).write_bytes(raw)
    return f"Saved attachment to input/{safe} ({len(raw)} bytes). Read it via the document skills."


#: Every tool defined in this theme module (indexed by name in ``src/tools/__init__.py``).
TOOLS = [
    search_inbox,
    read_email,
    list_attachments,
    download_attachment,
    draft_email,
    send_email,
]


def authorize_gmail(port: int = 8765, timeout_seconds: int = 600) -> Path:
    """Run the one-time Google OAuth flow and cache the token (used by scripts/gmail_auth.py).

    Uses a **fixed loopback port** and a generous timeout, and prints the auth URL instead of
    trying to auto-open a browser — robust for a WSL server + a Windows browser. The redirect
    lands on ``http://localhost:<port>/`` (WSL2 forwards localhost), completing the flow.

    Args:
        port: Fixed loopback port for the redirect server (Desktop clients allow any loopback).
        timeout_seconds: How long to wait for you to finish in the browser.

    Returns:
        The path to the written token file.

    Raises:
        FileNotFoundError: If the client-secrets file is missing.
    """
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds_file, token_file = _credentials_paths()
    if not creds_file.is_file():
        raise FileNotFoundError(
            f"Missing Gmail client secrets at {creds_file}. Download an OAuth *Desktop* client "
            "JSON from Google Cloud and save it there (or set GMAIL_CREDENTIALS_FILE)."
        )
    flow = InstalledAppFlow.from_client_secrets_file(str(creds_file), _SCOPES)
    creds = flow.run_local_server(
        host="localhost",
        port=port,
        open_browser=False,
        timeout_seconds=timeout_seconds,
        authorization_prompt_message="Open this URL in your browser to authorize:\n\n{url}\n",
    )
    token_file.write_text(creds.to_json(), encoding="utf-8")
    return token_file
