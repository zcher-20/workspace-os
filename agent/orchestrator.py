from pathlib import Path

from agent.config import PERMISSIONS_FILE
from agent.document_parser import ParsedDocument, parse_document
from agent.email_client import EmailClient, EmailMessage
from agent.permissions import PermissionManager
from agent.summarizer import AnswerResult, Summarizer, SummaryResult


class AgentOrchestrator:
    """
    Level 2 (Copilot) / Level 3 (Agent) orchestrator.
    Read -> Reason -> Draft -> Human Approval -> Act.
    """

    def __init__(self):
        self.permissions = PermissionManager(PERMISSIONS_FILE)
        self.email_client = EmailClient()
        self.summarizer = Summarizer()
        self._loaded_docs: dict[str, ParsedDocument] = {}
        self._current_doc: ParsedDocument | None = None

    def connect_email(self):
        if not self.permissions.enforce("read_email_metadata"):
            return
        self.email_client.connect()
        print("Connected to email inbox.")

    def disconnect_email(self):
        self.email_client.disconnect()
        print("Disconnected from email.")

    def list_recent_emails(self, limit: int = 10) -> list[EmailMessage]:
        if not self.permissions.enforce("read_email_metadata"):
            return []

        uids = self.email_client.search(limit=limit)
        messages = []
        for uid in uids:
            msg = self.email_client.fetch_message(uid, download_attachments=False)
            messages.append(msg)
        return messages

    def fetch_and_process_email(self, uid: str) -> EmailMessage | None:
        if not self.permissions.enforce("read_email_metadata"):
            return None
        if not self.permissions.enforce("download_attachment"):
            return None

        msg = self.email_client.fetch_message(uid, download_attachments=True)
        for att in msg.attachments:
            self._load_document(att)
        return msg

    def load_local_document(self, filepath: str | Path) -> ParsedDocument | None:
        if not self.permissions.enforce("parse_document"):
            return None
        return self._load_document(Path(filepath))

    def _load_document(self, filepath: Path) -> ParsedDocument | None:
        if not self.permissions.enforce("parse_document"):
            return None

        try:
            doc = parse_document(filepath)
            self._loaded_docs[doc.filename] = doc
            self._current_doc = doc
            print(f"Parsed: {doc.filename} ({doc.word_count} words, {doc.page_count} pages)")
            return doc
        except ValueError as e:
            print(f"Error parsing {filepath.name}: {e}")
            return None

    def summarize(self, filename: str | None = None) -> SummaryResult | None:
        if not self.permissions.enforce("summarize_document"):
            return None

        doc = self._resolve_doc(filename)
        if not doc:
            return None

        return self.summarizer.summarize(doc)

    def ask_question(self, question: str, filename: str | None = None) -> AnswerResult | None:
        if not self.permissions.enforce("generate_cited_answer"):
            return None

        doc = self._resolve_doc(filename)
        if not doc:
            return None

        return self.summarizer.ask(doc, question)

    def compare_documents(self) -> str | None:
        if not self.permissions.enforce("compare_documents"):
            return None

        if len(self._loaded_docs) < 2:
            return None

        docs = list(self._loaded_docs.values())
        return self.summarizer.compare(docs)

    def draft_email_response(self, doc: ParsedDocument, prompt: str) -> str | None:
        if not self.permissions.enforce("draft_email"):
            return None

        system = (
            "You are drafting a professional email response. "
            "Base your response on the provided document content. "
            "Keep it concise and professional."
        )
        user_msg = (
            f"Document: {doc.filename}\n"
            f"Content summary: {doc.full_text[:5000]}\n\n"
            f"Draft request: {prompt}"
        )

        return self.summarizer._generate(system, user_msg, temperature=0.4)

    def _resolve_doc(self, filename: str | None) -> ParsedDocument | None:
        if filename and filename in self._loaded_docs:
            return self._loaded_docs[filename]
        if self._current_doc:
            return self._current_doc
        return None
