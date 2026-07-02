import email
import imaplib
from dataclasses import dataclass, field
from email.header import decode_header
from pathlib import Path

from agent.config import (
    EMAIL_ADDRESS,
    EMAIL_IMAP_HOST,
    EMAIL_IMAP_PORT,
    EMAIL_PASSWORD,
    TEMP_DIR,
)


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


LONG_BODY_THRESHOLD = 500


class EmailClient:
    def __init__(self):
        self._conn: imaplib.IMAP4_SSL | None = None

    @property
    def is_connected(self) -> bool:
        return self._conn is not None

    def connect(self, host: str = "", address: str = "", password: str = "", port: int = 0):
        h = host or EMAIL_IMAP_HOST
        p = port or EMAIL_IMAP_PORT
        a = address or EMAIL_ADDRESS
        pw = password or EMAIL_PASSWORD
        self._conn = imaplib.IMAP4_SSL(h, p)
        self._conn.login(a, pw)
        self._conn.select("INBOX")

    def disconnect(self):
        if self._conn:
            try:
                self._conn.logout()
            except Exception:
                pass
            self._conn = None

    def _decode_header_value(self, raw: str) -> str:
        parts = decode_header(raw)
        decoded = []
        for content, charset in parts:
            if isinstance(content, bytes):
                decoded.append(content.decode(charset or "utf-8", errors="replace"))
            else:
                decoded.append(content)
        return "".join(decoded)

    def search(self, criteria: str = "ALL", limit: int = 10) -> list[str]:
        if not self._conn:
            raise RuntimeError("Not connected. Call connect() first.")
        _, data = self._conn.search(None, criteria)
        uids = data[0].split()
        return [uid.decode() for uid in uids[-limit:]]

    def fetch_preview(self, uid: str) -> EmailMessage:
        if not self._conn:
            raise RuntimeError("Not connected.")

        _, data = self._conn.fetch(uid.encode(), "(RFC822)")
        raw = data[0][1]
        msg = email.message_from_bytes(raw)

        subject = self._decode_header_value(msg.get("Subject", ""))
        sender = self._decode_header_value(msg.get("From", ""))
        date = msg.get("Date", "")

        body = ""
        attachment_names: list[str] = []

        for part in msg.walk():
            content_type = part.get_content_type()
            disposition = str(part.get("Content-Disposition", ""))

            if "attachment" in disposition:
                filename = part.get_filename()
                if filename:
                    attachment_names.append(self._decode_header_value(filename))
            elif content_type == "text/plain" and "attachment" not in disposition:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    body += payload.decode(charset, errors="replace")

        return EmailMessage(
            uid=uid,
            subject=subject,
            sender=sender,
            date=date,
            body=body,
            attachment_names=attachment_names,
            has_long_body=len(body) > LONG_BODY_THRESHOLD,
        )

    def fetch_and_download(self, uid: str) -> EmailMessage:
        if not self._conn:
            raise RuntimeError("Not connected.")

        _, data = self._conn.fetch(uid.encode(), "(RFC822)")
        raw = data[0][1]
        msg = email.message_from_bytes(raw)

        subject = self._decode_header_value(msg.get("Subject", ""))
        sender = self._decode_header_value(msg.get("From", ""))
        date = msg.get("Date", "")

        body = ""
        attachment_names: list[str] = []
        attachments: list[Path] = []

        for part in msg.walk():
            content_type = part.get_content_type()
            disposition = str(part.get("Content-Disposition", ""))

            if "attachment" in disposition:
                filename = part.get_filename()
                if filename:
                    filename = self._decode_header_value(filename)
                    attachment_names.append(filename)
                    filepath = TEMP_DIR / filename
                    filepath.write_bytes(part.get_payload(decode=True))
                    attachments.append(filepath)
            elif content_type == "text/plain" and "attachment" not in disposition:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    body += payload.decode(charset, errors="replace")

        if len(body) > LONG_BODY_THRESHOLD and not attachments:
            body_path = TEMP_DIR / f"email_{uid}_body.txt"
            body_path.write_text(body, encoding="utf-8")
            attachments.append(body_path)
            attachment_names.append(body_path.name)

        return EmailMessage(
            uid=uid,
            subject=subject,
            sender=sender,
            date=date,
            body=body,
            attachment_names=attachment_names,
            attachments=attachments,
            has_long_body=len(body) > LONG_BODY_THRESHOLD,
        )

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *args):
        self.disconnect()
