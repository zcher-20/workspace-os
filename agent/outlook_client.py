import base64
from dataclasses import dataclass, field
from pathlib import Path

import msal
import requests

from agent.config import (
    MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET,
    MICROSOFT_TENANT_ID,
    OAUTH_REDIRECT_BASE,
    TEMP_DIR,
)

SCOPES = ["Mail.Read"]
GRAPH_URL = "https://graph.microsoft.com/v1.0"

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


class OutlookClient:
    def __init__(self):
        self._token: str = ""
        self._user_email: str = ""
        self._app: msal.ConfidentialClientApplication | None = None

    @property
    def is_connected(self) -> bool:
        return bool(self._token)

    @property
    def user_email(self) -> str:
        return self._user_email

    def get_auth_url(self) -> str:
        authority = f"https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}"
        self._app = msal.ConfidentialClientApplication(
            MICROSOFT_CLIENT_ID,
            authority=authority,
            client_credential=MICROSOFT_CLIENT_SECRET,
        )
        return self._app.get_authorization_request_url(
            scopes=SCOPES,
            redirect_uri=f"{OAUTH_REDIRECT_BASE}/api/email/microsoft/callback",
        )

    def handle_callback(self, code: str):
        if not self._app:
            raise RuntimeError("Auth flow not started.")
        result = self._app.acquire_token_by_authorization_code(
            code,
            scopes=SCOPES,
            redirect_uri=f"{OAUTH_REDIRECT_BASE}/api/email/microsoft/callback",
        )
        if "error" in result:
            raise RuntimeError(result.get("error_description", result["error"]))
        self._token = result["access_token"]

        me = self._graph_get("/me")
        self._user_email = me.get("mail") or me.get("userPrincipalName", "")

    def disconnect(self):
        self._token = ""
        self._user_email = ""
        self._app = None

    def _graph_get(self, path: str, params: dict | None = None) -> dict:
        r = requests.get(
            f"{GRAPH_URL}{path}",
            headers={"Authorization": f"Bearer {self._token}"},
            params=params,
        )
        r.raise_for_status()
        return r.json()

    def list_messages(self, limit: int = 15) -> list[EmailMessage]:
        data = self._graph_get("/me/messages", {
            "$top": limit,
            "$select": "id,subject,from,receivedDateTime,body,hasAttachments",
            "$orderby": "receivedDateTime desc",
        })

        messages = []
        for item in data.get("value", []):
            sender = ""
            if item.get("from", {}).get("emailAddress"):
                ea = item["from"]["emailAddress"]
                sender = f"{ea.get('name', '')} <{ea.get('address', '')}>"

            body_text = item.get("body", {}).get("content", "")
            att_names = []
            if item.get("hasAttachments"):
                atts = self._graph_get(f"/me/messages/{item['id']}/attachments", {
                    "$select": "name"
                })
                att_names = [a["name"] for a in atts.get("value", []) if a.get("name")]

            messages.append(EmailMessage(
                uid=item["id"],
                subject=item.get("subject", ""),
                sender=sender,
                date=item.get("receivedDateTime", ""),
                body=body_text[:200],
                attachment_names=att_names,
                has_long_body=len(body_text) > LONG_BODY_THRESHOLD,
            ))
        return messages

    def fetch_and_download(self, msg_id: str) -> EmailMessage:
        msg = self._graph_get(f"/me/messages/{msg_id}", {
            "$select": "id,subject,from,receivedDateTime,body,hasAttachments",
        })

        sender = ""
        if msg.get("from", {}).get("emailAddress"):
            ea = msg["from"]["emailAddress"]
            sender = f"{ea.get('name', '')} <{ea.get('address', '')}>"

        body_text = msg.get("body", {}).get("content", "")
        attachment_names: list[str] = []
        attachments: list[Path] = []

        if msg.get("hasAttachments"):
            atts = self._graph_get(f"/me/messages/{msg_id}/attachments")
            for att in atts.get("value", []):
                name = att.get("name", "")
                if not name or att.get("@odata.type") != "#microsoft.graph.fileAttachment":
                    continue
                data = base64.b64decode(att["contentBytes"])
                filepath = TEMP_DIR / name
                filepath.write_bytes(data)
                attachment_names.append(name)
                attachments.append(filepath)

        if body_text:
            body_path = TEMP_DIR / f"email_{msg_id[:12]}_body.txt"
            body_path.write_text(body_text, encoding="utf-8")
            attachments.append(body_path)
            attachment_names.append(body_path.name)

        return EmailMessage(
            uid=msg_id,
            subject=msg.get("subject", ""),
            sender=sender,
            date=msg.get("receivedDateTime", ""),
            body=body_text,
            attachment_names=attachment_names,
            attachments=attachments,
            has_long_body=len(body_text) > LONG_BODY_THRESHOLD,
        )
