import base64
from dataclasses import dataclass, field
from pathlib import Path

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from agent.config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_REDIRECT_BASE,
    TEMP_DIR,
)

SCOPES = [
    "https://mail.google.com/",            # read + send + compose (full mailbox)
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
]

LONG_BODY_THRESHOLD = 500


@dataclass
class EmailMessage:
    uid: str
    subject: str
    sender: str
    date: str
    body: str = ""
    attachment_names: list[str] = field(default_factory=list)
    attachments: list[Path] = field(default_factory=list)
    has_long_body: bool = False


class GmailClient:
    def __init__(self):
        self._creds: Credentials | None = None
        self._service = None
        self._flow: Flow | None = None
        self._user_email: str = ""
        self._user_name: str = ""

    @property
    def is_connected(self) -> bool:
        return self._service is not None

    @property
    def service(self):
        return self._service

    @property
    def user_email(self) -> str:
        return self._user_email

    @property
    def user_name(self) -> str:
        return self._user_name

    def get_auth_url(self) -> str:
        client_config = {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }
        self._flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=f"{OAUTH_REDIRECT_BASE}/api/email/google/callback",
        )
        url, _ = self._flow.authorization_url(
            access_type="offline",
            prompt="consent",
        )
        return url

    def handle_callback(self, code: str):
        if not self._flow:
            raise RuntimeError("Auth flow not started.")
        self._flow.fetch_token(code=code)
        self._creds = self._flow.credentials
        self._service = build("gmail", "v1", credentials=self._creds)
        profile = self._service.users().getProfile(userId="me").execute()
        self._user_email = profile.get("emailAddress", "")
        try:
            import requests
            info = requests.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {self._creds.token}"},
                timeout=5,
            ).json()
            self._user_name = info.get("given_name", "")
        except Exception:
            self._user_name = ""

    def disconnect(self):
        self._creds = None
        self._service = None
        self._flow = None
        self._user_email = ""
        self._user_name = ""

    def list_messages(self, limit: int = 15) -> list[EmailMessage]:
        if not self._service:
            raise RuntimeError("Not connected.")

        result = self._service.users().messages().list(
            userId="me", maxResults=limit, q="category:primary"
        ).execute()

        messages = []
        for item in result.get("messages", []):
            msg = self._get_message_preview(item["id"])
            messages.append(msg)
        return messages

    def list_messages_full(self, limit: int = 50, body_limit: int = 3000) -> list[EmailMessage]:
        """Like list_messages but returns more body content for career analysis."""
        if not self._service:
            raise RuntimeError("Not connected.")
        result = self._service.users().messages().list(
            userId="me", maxResults=limit
        ).execute()
        messages = []
        for item in result.get("messages", []):
            msg = self._service.users().messages().get(
                userId="me", id=item["id"], format="full"
            ).execute()
            headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
            body = self._extract_body(msg["payload"])
            attachment_names = self._list_attachment_names(msg["payload"])
            messages.append(EmailMessage(
                uid=item["id"],
                subject=headers.get("subject", ""),
                sender=headers.get("from", ""),
                date=headers.get("date", ""),
                body=body[:body_limit],
                attachment_names=attachment_names,
                has_long_body=len(body) > LONG_BODY_THRESHOLD,
            ))
        return messages

    def fetch_and_download(self, msg_id: str) -> EmailMessage:
        if not self._service:
            raise RuntimeError("Not connected.")

        msg = self._service.users().messages().get(
            userId="me", id=msg_id, format="full"
        ).execute()

        headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
        subject = headers.get("subject", "")
        sender = headers.get("from", "")
        date = headers.get("date", "")

        body = self._extract_body(msg["payload"])
        attachment_names: list[str] = []
        attachments: list[Path] = []

        self._collect_attachments(msg["payload"], msg["id"], attachment_names, attachments)

        if body:
            body_path = TEMP_DIR / f"email_{msg_id}_body.txt"
            body_path.write_text(body, encoding="utf-8")
            attachments.insert(0, body_path)
            attachment_names.insert(0, body_path.name)

        return EmailMessage(
            uid=msg_id,
            subject=subject,
            sender=sender,
            date=date,
            body=body,
            attachment_names=attachment_names,
            attachments=attachments,
            has_long_body=len(body) > LONG_BODY_THRESHOLD,
        )

    def _get_message_preview(self, msg_id: str) -> EmailMessage:
        msg = self._service.users().messages().get(
            userId="me", id=msg_id, format="full"
        ).execute()

        headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
        subject = headers.get("subject", "")
        sender = headers.get("from", "")
        date = headers.get("date", "")

        body = self._extract_body(msg["payload"])
        attachment_names = self._list_attachment_names(msg["payload"])

        return EmailMessage(
            uid=msg_id,
            subject=subject,
            sender=sender,
            date=date,
            body=body[:200],
            attachment_names=attachment_names,
            has_long_body=len(body) > LONG_BODY_THRESHOLD,
        )

    def _extract_body(self, payload: dict) -> str:
        if payload.get("mimeType") == "text/plain" and "body" in payload:
            data = payload["body"].get("data", "")
            if data:
                return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

        for part in payload.get("parts", []):
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data", "")
                if data:
                    return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
            if part.get("mimeType", "").startswith("multipart/"):
                result = self._extract_body(part)
                if result:
                    return result
        return ""

    def _list_attachment_names(self, payload: dict) -> list[str]:
        names = []
        for part in payload.get("parts", []):
            filename = part.get("filename", "")
            if filename:
                names.append(filename)
            if part.get("parts"):
                names.extend(self._list_attachment_names(part))
        return names

    def _collect_attachments(self, payload: dict, msg_id: str,
                              names: list[str], paths: list[Path]):
        for part in payload.get("parts", []):
            filename = part.get("filename", "")
            if filename and part.get("body", {}).get("attachmentId"):
                att_id = part["body"]["attachmentId"]
                att = self._service.users().messages().attachments().get(
                    userId="me", messageId=msg_id, id=att_id
                ).execute()
                data = base64.urlsafe_b64decode(att["data"])
                filepath = TEMP_DIR / filename
                filepath.write_bytes(data)
                names.append(filename)
                paths.append(filepath)
            if part.get("parts"):
                self._collect_attachments(part, msg_id, names, paths)
