# AI Workspace

A full-stack enterprise AI assistant that reads and produces real office documents, manages email, and runs autonomous background tasks — all through a web UI and REST API.

## Overview

AI Workspace is a LangGraph-powered agent system with a FastAPI backend and a React/TypeScript frontend. The agent can work with your email inbox (Gmail or Outlook), parse and generate documents (PDF, Word, Excel, PowerPoint), manage contacts, and run scheduled daily summaries — with a human-in-the-loop gate before any irreversible action like sending an email.

A deeper "research mode" agent can also run multi-step web searches and synthesize findings into structured documents.

## Features

- **Document skills** — read and produce `.pdf`, `.docx`, `.xlsx`, and `.pptx` files via a sandboxed workspace (`input/` → `work/` → `output/`)
- **Email integration** — OAuth sign-in for Gmail and Outlook; reads inbox, drafts replies, and sends only after user approval
- **Contact management** — SQLite-backed contacts with tags, notes, and social links; add contacts by just asking the agent
- **Daily summary** — scheduled APScheduler job that digests the last 24 hours of email into a structured summary
- **Deep research agent** — web search (DuckDuckGo) + LangGraph ReAct loop to answer complex questions and write reports
- **Agent permission system** — YAML-based permission gates so you can restrict which actions agents are allowed to take
- **Streaming chat** — FastAPI `StreamingResponse` so the UI updates token-by-token
- **File upload** — drag-and-drop attachments through the web UI; files land in the agent's workspace `input/`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI / orchestration | LangGraph, LangChain, OpenAI API (GPT-4o-mini default) |
| Backend | Python 3.11+, FastAPI, Uvicorn, APScheduler |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Document parsing | pdfplumber, python-docx, openpyxl, pptxgenjs |
| Email | Google API Python Client (Gmail), MSAL (Outlook) |
| Database | SQLite (via built-in `sqlite3`) |
| Auth | Google OAuth 2.0, Microsoft OAuth 2.0 |

## Project Structure

```
ai-workspace/
├── agent/
│   ├── chat_agent.py        # LangGraph enterprise graph + tool definitions
│   ├── deep_agent.py        # Multi-step research agent
│   ├── orchestrator/        # Agent orchestrator + system prompt
│   ├── document_parser.py   # PDF / DOCX / XLSX / PPTX parsing
│   ├── gmail_client.py      # Gmail OAuth client
│   ├── outlook_client.py    # Outlook/MSAL client
│   ├── email_tools.py       # LangChain tools for email actions
│   ├── database.py          # SQLite helpers (contacts, summaries, agents)
│   ├── daily_summary.py     # Scheduled email digest logic
│   ├── permissions.py       # YAML-based permission gates
│   └── workspace/           # Agent filesystem (input / work / output / skills)
├── frontend/                # React + TypeScript + Vite UI
├── server.py                # FastAPI app — REST API + streaming endpoints
├── main.py                  # Interactive CLI entrypoint
├── agent_permissions.yaml   # Permission configuration
├── requirements.txt         # Python dependencies
└── .env.example             # Required environment variables
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- An OpenAI API key
- (Optional) Google OAuth credentials for Gmail
- (Optional) Microsoft Azure app registration for Outlook

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .

cp .env.example .env
# Fill in OPENAI_API_KEY and any OAuth credentials

uvicorn server:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI will be available at `http://localhost:5173` and proxies API calls to the FastAPI server at `http://localhost:8000`.

### CLI Mode

```bash
python main.py                      # Interactive prompt
python main.py --file report.pdf    # Load and summarize a document
python main.py --email              # Connect to email inbox
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Required. Your OpenAI API key. |
| `OPENAI_MODEL` | Model to use (default: `gpt-4o-mini`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for Gmail |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `MICROSOFT_CLIENT_ID` | Azure app registration client ID |
| `MICROSOFT_CLIENT_SECRET` | Azure app registration secret |
| `MICROSOFT_TENANT_ID` | Azure tenant ID (default: `common`) |

See `.env.example` for the full list.

## How the Agent Works

The agent follows a workspace model:

1. Files are uploaded or fetched into `agent/workspace/input/`
2. The agent reads the appropriate skill guide (`SKILL.md`) for the target format
3. Work-in-progress artifacts are written to `work/`
4. Final deliverables land in `output/` and are available for download
5. Email sends are gated — the agent drafts and shows you the message before `send_email` executes

The permission system (`agent_permissions.yaml`) lets you restrict which tools agents can invoke — useful for deploying the assistant to other users with controlled access.
