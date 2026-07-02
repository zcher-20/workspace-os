import json
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

from openai import OpenAI

from agent.config import OPENAI_API_KEY, OPENAI_MODEL

SUMMARY_PROMPT = """You are an email summary agent for an enterprise professional.

Analyze the emails from the past 24 hours and return a JSON object with exactly these keys:

{
  "overview": "2-3 sentence overview of the day's email activity",
  "important_emails": [{"subject": "...", "from": "...", "reason": "why it matters"}],
  "action_items": ["specific thing to do 1", "specific thing to do 2"],
  "deadlines": ["deadline or meeting description 1"],
  "needs_reply": [{"subject": "...", "from": "...", "why": "why a reply is needed"}]
}

Be concise and practical. Empty arrays are fine if nothing fits that category."""


def _parse_date(date_str: str) -> datetime | None:
    try:
        return parsedate_to_datetime(date_str)
    except Exception:
        return None


def fetch_emails_last_24h(email_client) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    msgs = email_client.list_messages(50)
    recent = []
    for msg in msgs:
        dt = _parse_date(msg.date)
        if dt and dt.astimezone(timezone.utc) >= cutoff:
            recent.append({
                "subject": msg.subject,
                "sender": msg.sender,
                "date": msg.date,
            })
    return recent


def generate_daily_summary(emails: list[dict]) -> dict:
    if not emails:
        return {
            "overview": "No emails received in the past 24 hours.",
            "important_emails": [],
            "action_items": [],
            "deadlines": [],
            "needs_reply": [],
        }

    email_text = "\n\n".join(
        f"From: {e['sender']}\nSubject: {e['subject']}\nDate: {e['date']}"
        for e in emails
    )

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SUMMARY_PROMPT},
            {"role": "user", "content": f"Emails from the past 24 hours:\n\n{email_text}"},
        ],
        temperature=0.3,
    )
    return json.loads(response.choices[0].message.content)
