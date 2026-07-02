"""LangChain email tools for the DeepAgent — wraps the enterprise GmailClient.

Adapted from deepagent/src/tools/email.py so the DeepAgent can read, draft, and send
email using the same Gmail OAuth credentials already set up in GmailClient.
Call `init(gmail_client, workspace)` at startup before building the agent.
"""
from __future__ import annotations

import base64
import mimetypes
from email.message import EmailMessage
from pathlib import Path
from typing import TYPE_CHECKING, Any

from langchain_core.tools import tool

if TYPE_CHECKING:
    from agent.gmail_client import GmailClient

_gmail: "GmailClient | None" = None
_workspace: Path | None = None  # agent/workspace/ root


def init(gmail_client: "GmailClient", workspace: Path) -> None:
    global _gmail, _workspace
    _gmail = gmail_client
    _workspace = workspace


def _svc() -> Any:
    if _gmail is None or not _gmail.is_connected:
        raise RuntimeError(
            "Gmail is not connected. Ask the user to connect Gmail in the Email Inbox tab first."
        )
    return _gmail.service


def _resolve_attachment(path: str) -> Path:
    p = Path(path)
    full = (p if p.is_absolute() else _workspace / p).resolve()
    root = _workspace.resolve()
    if full != root and root not in full.parents:
        raise ValueError(f"Attachment must be inside the workspace: {path!r}")
    if not full.is_file():
        raise FileNotFoundError(f"Attachment not found: {path!r}")
    return full


def _raw(to: str, subject: str, body: str, attachments: list[str] | None = None) -> str:
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
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _walk_parts(payload: dict):
    stack = [payload]
    while stack:
        part = stack.pop()
        yield part
        stack.extend(part.get("parts", []) or [])


def _attachment_parts(payload: dict) -> list[dict]:
    return [p for p in _walk_parts(payload) if p.get("filename")]


def _plain_text(payload: dict) -> str:
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
        svc = _svc()
    except RuntimeError as exc:
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
        svc = _svc()
    except RuntimeError as exc:
        return str(exc)
    msg = svc.users().messages().get(userId="me", id=message_id, format="full").execute()
    payload = msg.get("payload", {})
    headers = {h["name"]: h["value"] for h in payload.get("headers", [])}
    body = _plain_text(payload).strip()
    attachments = _attachment_parts(payload)
    att_note = (
        f"\n\n{len(attachments)} attachment(s): "
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
def list_attachments(message_id: str) -> str:
    """List a Gmail message's attachments: filename, type, size, and attachment_id.

    Pass the attachment_id (with the message_id and filename) to download_attachment.
    """
    try:
        svc = _svc()
    except RuntimeError as exc:
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
    """Download a Gmail attachment into the workspace input/ folder.

    Get message_id/attachment_id/filename from list_attachments first. The file lands in
    input/ so you can process it with the document skills (e.g. an emailed PDF → pdf skill).
    """
    try:
        svc = _svc()
    except RuntimeError as exc:
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
    safe = Path(filename).name or "attachment"
    dest = (_workspace / "input").resolve()
    dest.mkdir(parents=True, exist_ok=True)
    (dest / safe).write_bytes(raw)
    return f"Saved to input/{safe} ({len(raw)} bytes). Process it with the document skills."


@tool
def draft_email(to: str, subject: str, body: str, attachments: list[str] | None = None) -> str:
    """Create a Gmail draft (does NOT send). Returns the draft id.

    attachments: optional list of workspace-relative file paths (e.g. ["output/report.docx"]).
    """
    try:
        svc = _svc()
    except RuntimeError as exc:
        return str(exc)
    try:
        raw = _raw(to, subject, body, attachments)
    except (ValueError, FileNotFoundError) as exc:
        return f"Attachment error: {exc}"
    draft = svc.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
    return f"Draft created (id={draft['id']}) to {to}."


@tool
def send_email(to: str, subject: str, body: str, attachments: list[str] | None = None) -> str:
    """Send an email via Gmail. THIS IS IRREVERSIBLE — the user must approve before this runs.

    attachments: optional list of workspace-relative file paths (e.g. ["output/report.docx"]).
    """
    try:
        svc = _svc()
    except RuntimeError as exc:
        return str(exc)
    try:
        raw = _raw(to, subject, body, attachments)
    except (ValueError, FileNotFoundError) as exc:
        return f"Attachment error: {exc}"
    sent = svc.users().messages().send(userId="me", body={"raw": raw}).execute()
    note = f" with {len(attachments)} attachment(s)" if attachments else ""
    return f"Email sent to {to}{note} (id={sent['id']})."


EMAIL_TOOLS = [search_inbox, read_email, list_attachments, download_attachment, draft_email, send_email]
