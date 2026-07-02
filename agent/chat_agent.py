from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from duckduckgo_search import DDGS

from agent.config import OPENAI_API_KEY, OPENAI_MODEL
from agent.document_parser import parse_document
from agent.database import create_contact

SYSTEM_PROMPT = (
    "You are an enterprise AI assistant. You can access the user's email inbox, "
    "search the internet, and manage contacts. Be proactive: when asked about emails, "
    "fetch them first. When asked to add someone to contacts, use add_contact immediately "
    "— don't ask for confirmation. Always cite sources for web searches."
)


@tool
def add_contact(
    name: str,
    email: str = "",
    role: str = "",
    organization: str = "",
    notes: str = "",
    tags: list[str] = [],
    linkedin: str = "",
    twitter: str = "",
    github: str = "",
    website: str = "",
) -> str:
    """Add a person to the user's contacts. Use this whenever the user asks to save, add, or remember a contact."""
    try:
        contact_id = create_contact({
            "name": name, "email": email, "role": role,
            "organization": organization, "notes": notes, "tags": tags,
            "linkedin": linkedin, "twitter": twitter,
            "github": github, "website": website,
        })
        return f"Added {name} to contacts (id={contact_id})."
    except Exception as e:
        return f"Failed to add contact: {e}"


@tool
def search_web(query: str) -> str:
    """Search the internet for current information on any topic."""
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=5))
    if not results:
        return "No results found."
    return "\n\n".join(
        f"Title: {r['title']}\nSummary: {r['body']}\nURL: {r['href']}"
        for r in results
    )


def create_enterprise_graph(gmail_client, outlook_client):
    def _active_client():
        if gmail_client.is_connected:
            return gmail_client
        if outlook_client.is_connected:
            return outlook_client
        return None

    @tool
    def get_recent_emails(limit: int = 10) -> str:
        """Get recent emails from the user's connected inbox."""
        client = _active_client()
        if not client:
            return "No email account connected. Ask the user to connect their email in the Email Inbox tab."
        msgs = client.list_messages(min(limit, 20))
        if not msgs:
            return "Inbox is empty."
        return "\n\n---\n\n".join(
            f"UID: {m.uid}\nFrom: {m.sender}\nSubject: {m.subject}\nDate: {m.date}"
            for m in msgs
        )

    @tool
    def get_email_content(uid: str) -> str:
        """Fetch the full body and parsed text of any PDF/DOCX attachments for a specific email."""
        client = _active_client()
        if not client:
            return "No email account connected."
        msg = client.fetch_and_download(uid)
        parts = [f"Subject: {msg.subject}\nFrom: {msg.sender}\nDate: {msg.date}\n\n{msg.body}"]
        for att_path in msg.attachments:
            try:
                doc = parse_document(att_path)
                parts.append(
                    f"\n\n--- Attachment: {doc.filename} ({doc.file_type}, {doc.word_count} words) ---\n"
                    f"{doc.full_text[:15000]}"
                )
            except Exception as e:
                parts.append(f"\n\n--- Attachment: {att_path.name} (could not parse: {e}) ---")
        return "".join(parts)

    model = ChatOpenAI(model=OPENAI_MODEL, api_key=OPENAI_API_KEY, streaming=True)
    return create_react_agent(
        model,
        [search_web, get_recent_emails, get_email_content, add_contact],
        prompt=SYSTEM_PROMPT,
    )


def create_configured_agent(agent_config: dict, gmail_client, outlook_client):
    """Build a LangGraph agent from a user-defined agent config dict."""
    tool_names = set(agent_config.get("tools", []))

    def _active_client():
        if gmail_client.is_connected:
            return gmail_client
        if outlook_client.is_connected:
            return outlook_client
        return None

    tools = []

    if "web_search" in tool_names:
        tools.append(search_web)

    if "email" in tool_names:
        @tool
        def get_recent_emails_a(limit: int = 10) -> str:
            """Get recent emails from the user's connected inbox."""
            client = _active_client()
            if not client:
                return "No email account connected."
            msgs = client.list_messages(min(limit, 20))
            if not msgs:
                return "Inbox is empty."
            return "\n\n---\n\n".join(
                f"UID: {m.uid}\nFrom: {m.sender}\nSubject: {m.subject}\nDate: {m.date}"
                for m in msgs
            )

        @tool
        def get_email_content_a(uid: str) -> str:
            """Fetch the full body and any parsed attachments for a specific email."""
            client = _active_client()
            if not client:
                return "No email account connected."
            msg = client.fetch_and_download(uid)
            parts = [f"Subject: {msg.subject}\nFrom: {msg.sender}\nDate: {msg.date}\n\n{msg.body}"]
            for att_path in msg.attachments:
                try:
                    doc = parse_document(att_path)
                    parts.append(f"\n\n--- Attachment: {doc.filename} ---\n{doc.full_text[:15000]}")
                except Exception as e:
                    parts.append(f"\n\n--- Attachment: {att_path.name} (could not parse: {e}) ---")
            return "".join(parts)

        tools.extend([get_recent_emails_a, get_email_content_a])

    system_prompt = agent_config.get("system_prompt") or "You are a helpful AI assistant."
    model = ChatOpenAI(model=OPENAI_MODEL, api_key=OPENAI_API_KEY, streaming=True)
    return create_react_agent(model, tools, prompt=system_prompt)
