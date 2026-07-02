"""One-time Gmail authorization for the Executive Assistant.

Prerequisite: a Google OAuth *Desktop* client JSON saved as ``credentials.json`` in the
project root (or pointed to by ``GMAIL_CREDENTIALS_FILE``). See the README.

Run once (opens a browser to grant access), which writes ``token.json``::

    wsl ../cowork_venv/bin/python scripts/gmail_auth.py

After this, start the server normally — the Gmail tools load from the cached token with no
interactive prompt.
"""

from __future__ import annotations

from src.tools.email import authorize_gmail

if __name__ == "__main__":
    token = authorize_gmail()
    print(f"Authorized. Token cached at: {token}")
