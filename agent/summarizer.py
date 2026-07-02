from dataclasses import dataclass

from openai import OpenAI

from agent.config import OPENAI_API_KEY, OPENAI_MODEL
from agent.document_parser import ParsedDocument


@dataclass
class SummaryResult:
    content: str
    model_used: str
    draft_notice: str = "This output is a draft and requires human review."


@dataclass
class AnswerResult:
    question: str
    content: str
    model_used: str
    draft_notice: str = "This output is a draft and requires human review."


def _is_email(doc: ParsedDocument) -> bool:
    return doc.filename.startswith("email_") and doc.filename.endswith("_body.txt")


_DOC_SYSTEM_SUMMARY = (
    "You are a document analyst for an enterprise. "
    "Summarize the document clearly and concisely. "
    "Your output MUST be formatted in clean Markdown. Use:\n"
    "- **Bold** for key terms and important phrases\n"
    "- Bullet points for lists\n"
    "- ## Headings for sections\n"
    "- > Blockquotes for direct quotes from the document\n"
    "- `highlights` for specific data points, numbers, or metrics\n\n"
    "Cite specific locations using **[Page X, Para Y]** format.\n\n"
    "Structure your response as:\n"
    "## Summary\n(2-4 paragraph summary with citations)\n\n"
    "## Key Points\n- point with **[Page X, Para Y]** citation\n\n"
    "## Notable Citations\n> quoted text — **[Page X, Para Y]**"
)

_DOC_SYSTEM_ASK = (
    "You are a document analyst for an enterprise. "
    "Answer the user's question based ONLY on the provided document. "
    "Your output MUST be formatted in clean Markdown. Use:\n"
    "- **Bold** for key terms and important phrases\n"
    "- Bullet points for lists\n"
    "- ## Headings for sections\n"
    "- > Blockquotes for direct quotes from the document\n"
    "- `highlights` for specific data points, numbers, or metrics\n\n"
    "Cite specific locations using **[Page X, Para Y]** format.\n"
    "If the document does not contain enough information, say so clearly.\n\n"
    "Structure your response as:\n"
    "## Answer\n(your answer with inline citations)\n\n"
    "## Sources\n- **[Page X, Para Y]**: brief quote or relevance"
)

_EMAIL_SYSTEM_SUMMARY = (
    "You are an email analyst for an enterprise. "
    "You are reading an email thread. Summarize it clearly and concisely. "
    "Your output MUST be formatted in clean Markdown. Use:\n"
    "- **Bold** for key terms, names, and important phrases\n"
    "- Bullet points for lists\n"
    "- ## Headings for sections\n"
    "- > Blockquotes for direct quotes from the emails\n\n"
    "When citing, quote the exact words and attribute to the sender's name. "
    "Do NOT use paragraph numbers or page numbers. "
    "Use this format: > \"quoted text\" — **Sender Name**\n\n"
    "Structure your response as:\n"
    "## Summary\n(concise summary of the email thread)\n\n"
    "## Key Points\n- point attributed to sender\n\n"
    "## Action Items\n- any requested actions or next steps"
)

_EMAIL_SYSTEM_ASK = (
    "You are an email analyst for an enterprise. "
    "You are reading an email thread. Answer the user's question based ONLY on the emails. "
    "Your output MUST be formatted in clean Markdown. Use:\n"
    "- **Bold** for key terms, names, and important phrases\n"
    "- Bullet points for lists\n"
    "- > Blockquotes for direct quotes\n\n"
    "When citing, quote the exact words and attribute to the sender's name. "
    "Do NOT use paragraph numbers or page numbers. "
    "Use this format: > \"quoted text\" — **Sender Name**\n"
    "If the emails do not contain enough information, say so clearly.\n\n"
    "Structure your response as:\n"
    "## Answer\n(your answer with inline quotes attributed to senders)\n\n"
    "## Sources\n> direct quote — **Sender Name**"
)


class Summarizer:
    def __init__(self):
        self._model_name = OPENAI_MODEL
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            self._client = OpenAI(api_key=OPENAI_API_KEY)
        return self._client

    def _generate(self, system: str, user: str, temperature: float = 0.3) -> str:
        response = self.client.chat.completions.create(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
        )
        return response.choices[0].message.content or ""

    def _generate_stream(self, system: str, user: str, temperature: float = 0.3):
        stream = self.client.chat.completions.create(
            model=self._model_name,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            stream=True,
        )
        for chunk in stream:
            content = chunk.choices[0].delta.content
            if content:
                yield content

    def _build_document_context(self, doc: ParsedDocument) -> str:
        lines = []
        for i, para in enumerate(doc.paragraphs):
            lines.append(f"[Page {para.page}, Paragraph {i + 1}] {para.text}")
        return "\n\n".join(lines)

    def _build_email_context(self, doc: ParsedDocument) -> str:
        return doc.full_text

    def _truncate_context(self, context: str, max_chars: int = 80_000) -> str:
        if len(context) <= max_chars:
            return context
        return context[:max_chars] + "\n\n[... truncated ...]"

    def summarize(self, doc: ParsedDocument) -> SummaryResult:
        email = _is_email(doc)
        context = self._truncate_context(
            self._build_email_context(doc) if email else self._build_document_context(doc)
        )
        system = _EMAIL_SYSTEM_SUMMARY if email else _DOC_SYSTEM_SUMMARY
        label = "Email thread" if email else f"Document: {doc.filename}"

        user = f"{label}\nWords: {doc.word_count}\n\n{context}"
        raw = self._generate(system, user, temperature=0.3)
        return SummaryResult(content=raw, model_used=self._model_name)

    def summarize_stream(self, doc: ParsedDocument):
        email = _is_email(doc)
        context = self._truncate_context(
            self._build_email_context(doc) if email else self._build_document_context(doc)
        )
        system = _EMAIL_SYSTEM_SUMMARY if email else _DOC_SYSTEM_SUMMARY
        label = "Email thread" if email else f"Document: {doc.filename}"

        user = f"{label}\nWords: {doc.word_count}\n\n{context}"
        yield from self._generate_stream(system, user, temperature=0.3)

    def ask(self, doc: ParsedDocument, question: str) -> AnswerResult:
        email = _is_email(doc)
        context = self._truncate_context(
            self._build_email_context(doc) if email else self._build_document_context(doc)
        )
        system = _EMAIL_SYSTEM_ASK if email else _DOC_SYSTEM_ASK

        user = f"{context}\n\nQuestion: {question}"
        raw = self._generate(system, user, temperature=0.2)
        return AnswerResult(question=question, content=raw, model_used=self._model_name)

    def ask_stream(self, doc: ParsedDocument, question: str):
        email = _is_email(doc)
        context = self._truncate_context(
            self._build_email_context(doc) if email else self._build_document_context(doc)
        )
        system = _EMAIL_SYSTEM_ASK if email else _DOC_SYSTEM_ASK

        user = f"{context}\n\nQuestion: {question}"
        yield from self._generate_stream(system, user, temperature=0.2)

    def compare(self, docs: list[ParsedDocument]) -> str:
        contexts = []
        for doc in docs:
            ctx = self._truncate_context(
                self._build_document_context(doc), max_chars=40_000
            )
            contexts.append(f"=== DOCUMENT: {doc.filename} ===\n{ctx}")

        combined = "\n\n".join(contexts)

        system = (
            "You are a document analyst for an enterprise. "
            "Compare the provided documents using clean Markdown formatting. "
            "Use **bold**, bullets, > blockquotes, and `highlights`.\n"
            "Cite using **[DocName, Page X, Para Y]** format.\n\n"
            "Structure as:\n"
            "## Common Themes\n"
            "## Contradictions\n"
            "## Information Gaps\n"
            "## Recommendations"
        )

        return self._generate(system, combined, temperature=0.3)
