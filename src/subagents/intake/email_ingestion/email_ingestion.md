## Functionality — Email ingestion

Locate and read the source email. Tools: `search_inbox`, `read_email` (read-only).

1. **Locate the message.** If you were given a message id, use it. Otherwise use `search_inbox`
   with a precise Gmail query (sender, subject, `newer_than:7d`, etc.) and pick the right
   message. Then `read_email` to get the full body and headers.
2. **Capture the body.** If the email has **no attachment**, the email body itself is the
   document — save it to `work/email_body.txt` so downstream agents can cite it.
