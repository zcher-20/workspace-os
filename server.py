"""
Minimal FastAPI server for the Enterprise Document Agent.
"""

import asyncio
import json
import shutil
import uuid as _uuid
from datetime import datetime
from pathlib import Path
from queue import Queue
from threading import Thread

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.types import Command
from pydantic import BaseModel

from agent.config import TEMP_DIR

WORKSPACE_DIR = Path(__file__).parent / "agent" / "workspace"
WORKSPACE_INPUT = WORKSPACE_DIR / "input"
WORKSPACE_OUTPUT = WORKSPACE_DIR / "output"
from agent.document_parser import SUPPORTED_EXTENSIONS
from agent.gmail_client import GmailClient
from agent.orchestrator import AgentOrchestrator
from agent.outlook_client import OutlookClient
from agent.chat_agent import create_enterprise_graph, create_configured_agent
from agent.daily_summary import fetch_emails_last_24h, generate_daily_summary
from agent.deep_agent import make_deep_agent
from agent.database import (
    init_db, save_summary, get_latest_summary,
    create_agent, list_agents, get_agent, toggle_agent_status, delete_agent,
    upsert_contact, list_contacts, update_contact_notes, create_contact, update_contact, delete_contact,
    list_automations, get_automation, update_automation, record_automation_run,
)

app = FastAPI()
agent = AgentOrchestrator()
gmail = GmailClient()
outlook = OutlookClient()

enterprise_graph = create_enterprise_graph(gmail, outlook)
deep_agent_graph = make_deep_agent(gmail)
scheduler = AsyncIOScheduler()

DAILY_SUMMARY_JOB_ID = "daily_summary"


async def _run_daily_summary():
    client = gmail if gmail.is_connected else (outlook if outlook.is_connected else None)
    if not client:
        await asyncio.to_thread(record_automation_run, DAILY_SUMMARY_JOB_ID, "skipped — no email connected")
        return
    try:
        emails = await asyncio.to_thread(fetch_emails_last_24h, client)
        summary = await asyncio.to_thread(generate_daily_summary, emails)
        await asyncio.to_thread(save_summary, datetime.utcnow().strftime("%Y-%m-%d"), summary, len(emails))
        await asyncio.to_thread(record_automation_run, DAILY_SUMMARY_JOB_ID, "success")
    except Exception as e:
        await asyncio.to_thread(record_automation_run, DAILY_SUMMARY_JOB_ID, f"error: {e}")


def _reschedule_daily_summary(hour: int, minute: int):
    if scheduler.get_job(DAILY_SUMMARY_JOB_ID):
        scheduler.remove_job(DAILY_SUMMARY_JOB_ID)
    scheduler.add_job(_run_daily_summary, CronTrigger(hour=hour, minute=minute), id=DAILY_SUMMARY_JOB_ID)


@app.on_event("startup")
async def startup():
    init_db()
    auto = get_automation(DAILY_SUMMARY_JOB_ID)
    if auto and auto["enabled"]:
        _reschedule_daily_summary(auto["hour"], auto["minute"])
    scheduler.start()


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()

STATIC_DIR = Path(__file__).parent / "static"


class QuestionRequest(BaseModel):
    question: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class AgentCreateRequest(BaseModel):
    name: str
    description: str = ""
    tools: list[str] = []
    system_prompt: str = ""


class AgentToggleRequest(BaseModel):
    is_active: bool


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/favicon.svg")
async def favicon():
    p = STATIC_DIR / "favicon.svg"
    return FileResponse(p) if p.exists() else FileResponse(STATIC_DIR / "vite.svg") if (STATIC_DIR / "vite.svg").exists() else Response(status_code=404)


# --- File upload ---

@app.post("/api/upload")
async def upload(file: UploadFile):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return {"ok": False, "error": f"Unsupported file type: {ext}"}

    dest = TEMP_DIR / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    doc = agent.load_local_document(dest)
    if not doc:
        return {"ok": False, "error": "Failed to parse document."}

    return {
        "ok": True,
        "parsed": {
            "filename": doc.filename,
            "file_type": doc.file_type,
            "word_count": doc.word_count,
            "page_count": doc.page_count,
        },
    }


# --- Google OAuth ---

@app.get("/api/email/google/auth")
async def google_auth():
    try:
        url = gmail.get_auth_url()
        return {"ok": True, "url": url}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/email/google/callback")
async def google_callback(request: Request):
    code = request.query_params.get("code", "")
    try:
        await asyncio.to_thread(gmail.handle_callback, code)
        return HTMLResponse(
            "<html><body><script>window.opener.postMessage('google_connected','*');window.close();</script>"
            "<p>Connected. You can close this window.</p></body></html>"
        )
    except Exception as e:
        return HTMLResponse(f"<html><body><p>Error: {e}</p></body></html>")


# --- Microsoft OAuth ---

@app.get("/api/email/microsoft/auth")
async def microsoft_auth():
    try:
        url = outlook.get_auth_url()
        return {"ok": True, "url": url}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/email/microsoft/callback")
async def microsoft_callback(request: Request):
    code = request.query_params.get("code", "")
    try:
        await asyncio.to_thread(outlook.handle_callback, code)
        return HTMLResponse(
            "<html><body><script>window.opener.postMessage('microsoft_connected','*');window.close();</script>"
            "<p>Connected. You can close this window.</p></body></html>"
        )
    except Exception as e:
        return HTMLResponse(f"<html><body><p>Error: {e}</p></body></html>")


# --- Email (unified) ---

def _active_email_client():
    if gmail.is_connected:
        return gmail
    if outlook.is_connected:
        return outlook
    return None


@app.get("/api/email/status")
async def email_status():
    client = _active_email_client()
    if client:
        return {
            "connected": True,
            "provider": "google" if client is gmail else "microsoft",
            "email": client.user_email,
            "name": getattr(client, "user_name", ""),
        }
    return {"connected": False}


@app.post("/api/email/disconnect")
async def email_disconnect():
    gmail.disconnect()
    outlook.disconnect()
    return {"ok": True}


@app.get("/api/email/list")
async def email_list(limit: int = 15):
    client = _active_email_client()
    if not client:
        return {"ok": False, "error": "Not connected."}

    try:
        messages = await asyncio.to_thread(client.list_messages, limit)
        return {
            "ok": True,
            "messages": [
                {
                    "uid": m.uid,
                    "subject": m.subject,
                    "sender": m.sender,
                    "date": m.date,
                    "attachment_names": m.attachment_names,
                    "has_attachments": len(m.attachment_names) > 0,
                    "has_long_body": m.has_long_body,
                }
                for m in messages
            ],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/email/fetch/{uid:path}")
async def email_fetch(uid: str):
    client = _active_email_client()
    if not client:
        return {"ok": False, "error": "Not connected."}

    try:
        msg = await asyncio.to_thread(client.fetch_and_download, uid)

        parsed_docs = []
        for att_path in msg.attachments:
            doc = agent.load_local_document(att_path)
            if doc:
                parsed_docs.append({
                    "filename": doc.filename,
                    "file_type": doc.file_type,
                    "word_count": doc.word_count,
                    "page_count": doc.page_count,
                })

        return {
            "ok": True,
            "subject": msg.subject,
            "sender": msg.sender,
            "date": msg.date,
            "body": msg.body,
            "attachments_downloaded": len(msg.attachments),
            "parsed_docs": parsed_docs,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


# --- Streaming ---

def _stream_from_generator(gen_func, *args):
    q: Queue = Queue()

    def run():
        try:
            for chunk in gen_func(*args):
                q.put(chunk)
        except Exception as e:
            q.put(f"\n\n**Error:** {e}")
        q.put(None)

    Thread(target=run, daemon=True).start()

    def event_stream():
        while True:
            chunk = q.get()
            if chunk is None:
                yield f"data: {json.dumps({'done': True})}\n\n"
                break
            yield f"data: {json.dumps({'text': chunk})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/summarize")
async def summarize():
    doc = agent._resolve_doc(None)
    if not doc:
        return {"error": "No document loaded."}
    if not agent.permissions.enforce("summarize_document"):
        return {"error": "Action not permitted."}
    return _stream_from_generator(agent.summarizer.summarize_stream, doc)


@app.post("/api/ask")
async def ask(req: QuestionRequest):
    doc = agent._resolve_doc(None)
    if not doc:
        return {"error": "No document loaded."}
    if not agent.permissions.enforce("generate_cited_answer"):
        return {"error": "Action not permitted."}
    return _stream_from_generator(agent.summarizer.ask_stream, doc, req.question)


@app.post("/api/compare")
async def compare():
    result = agent.compare_documents()
    if not result:
        return {"error": "Need at least 2 documents loaded."}
    return {"content": result}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    lc_messages = []
    for m in req.messages:
        if m.role == "user":
            lc_messages.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            lc_messages.append(AIMessage(content=m.content))

    async def generate():
        try:
            async for event in enterprise_graph.astream_events(
                {"messages": lc_messages}, version="v2"
            ):
                kind = event["event"]
                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    if chunk.content:
                        yield f"data: {json.dumps({'text': chunk.content})}\n\n"
                elif kind == "on_tool_start":
                    yield f"data: {json.dumps({'tool': event['name']})}\n\n"
                elif kind == "on_tool_end" and event.get("name") == "add_contact":
                    yield f"data: {json.dumps({'contact_created': True})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


class DeepChatRequest(BaseModel):
    messages: list[ChatMessage]
    attachments: list[str] = []
    thread_id: str = ""


class ResumeRequest(BaseModel):
    thread_id: str
    approved: bool


_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}


def _build_lc_messages(req: DeepChatRequest) -> list:
    lc_messages = []
    for i, m in enumerate(req.messages):
        if m.role == "user":
            is_last = i == len(req.messages) - 1
            if is_last and req.attachments:
                images = []
                docs = []
                for fname in req.attachments:
                    ext = Path(fname).suffix.lower()
                    if ext in _IMAGE_EXTS:
                        images.append(fname)
                    else:
                        docs.append(fname)

                # Build multimodal content list
                content: list = []

                # Prepend file context note
                if docs:
                    file_list = "\n".join(f"- {f}" for f in docs)
                    context = f"[Files uploaded to your workspace input/ directory:\n{file_list}]\n\n"
                    content.append({"type": "text", "text": context + m.content})
                else:
                    content.append({"type": "text", "text": m.content})

                # Embed images inline as vision content
                for fname in images:
                    path = WORKSPACE_INPUT / fname
                    if path.exists():
                        import base64
                        ext = path.suffix.lower().lstrip(".")
                        mime = "jpeg" if ext in ("jpg", "jpeg") else ext
                        b64 = base64.b64encode(path.read_bytes()).decode()
                        content.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/{mime};base64,{b64}"},
                        })

                lc_messages.append(HumanMessage(content=content))
            else:
                lc_messages.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            lc_messages.append(AIMessage(content=m.content))
    return lc_messages


def _stream_chunk(chunk_content) -> str | None:
    if isinstance(chunk_content, list):
        parts = [b["text"] for b in chunk_content if isinstance(b, dict) and b.get("type") == "text"]
        return "".join(parts) or None
    return chunk_content or None


def _tool_detail(name: str, inp: object) -> str:
    """Extract a short human-readable detail from a tool's input dict."""
    if not isinstance(inp, dict):
        return ""
    if name == "execute":
        cmd = str(inp.get("command") or inp.get("cmd") or "")
        return cmd[:120] + ("…" if len(cmd) > 120 else "")
    if name in ("read_file", "write_file", "edit_file"):
        return str(inp.get("path") or "")
    if name in ("ls", "glob"):
        return str(inp.get("path") or inp.get("pattern") or "")
    if name == "grep":
        pat = str(inp.get("pattern") or inp.get("query") or "")
        path = str(inp.get("path") or "")
        return f"{pat} in {path}" if path else pat
    if name == "write_todos":
        todos = inp.get("todos") or []
        items = []
        for t in (todos if isinstance(todos, list) else [])[:3]:
            items.append(t.get("content") if isinstance(t, dict) else str(t))
        return " · ".join(i for i in items if i)
    if name == "task":
        raw = str(inp.get("prompt") or inp.get("description") or inp.get("task") or "")
        return raw[:120] + ("…" if len(raw) > 120 else "")
    return ""


async def _sse_events(graph, input_data, config: dict):
    """Yield SSE data strings from a graph run, handling interrupts."""
    async for event in graph.astream_events(input_data, config=config, version="v2"):
        kind = event["event"]
        if kind == "on_chat_model_stream":
            text = _stream_chunk(event["data"]["chunk"].content)
            if text:
                yield f"data: {json.dumps({'text': text})}\n\n"
        elif kind == "on_tool_start":
            name = event["name"]
            inp = event.get("data", {}).get("input")
            detail = _tool_detail(name, inp)
            payload: dict = {"tool": name}
            if detail:
                payload["detail"] = detail
            yield f"data: {json.dumps(payload)}\n\n"
        elif kind == "on_tool_end":
            yield f"data: {json.dumps({'tool_done': event['name']})}\n\n"
        elif kind == "on_interrupt":
            # Graph is paused waiting for send_email approval
            try:
                state = await graph.aget_state(config)
                msgs = state.values.get("messages", [])
                last_ai = next(
                    (m for m in reversed(msgs) if hasattr(m, "tool_calls") and m.tool_calls), None
                )
                send_call = next(
                    (tc for tc in (last_ai.tool_calls if last_ai else []) if tc["name"] == "send_email"),
                    None,
                )
            except Exception:
                send_call = None
            yield f"data: {json.dumps({'interrupt': 'send_email', 'draft': send_call or {}, 'thread_id': config['configurable']['thread_id']})}\n\n"
            return  # stream ends — client must resume via /api/deep-chat/resume
    yield f"data: {json.dumps({'done': True})}\n\n"


@app.post("/api/deep-chat")
async def deep_chat(req: DeepChatRequest):
    thread_id = req.thread_id or str(_uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    lc_messages = _build_lc_messages(req)

    async def generate():
        try:
            async for chunk in _sse_events(deep_agent_graph, {"messages": lc_messages}, config):
                yield chunk
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/deep-chat/resume")
async def deep_chat_resume(req: ResumeRequest):
    config = {"configurable": {"thread_id": req.thread_id}}

    async def generate():
        try:
            async for chunk in _sse_events(deep_agent_graph, Command(resume=req.approved), config):
                yield chunk
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Workspace file management ────────────────────────────────────

@app.post("/api/workspace/upload")
async def workspace_upload(file: UploadFile):
    WORKSPACE_INPUT.mkdir(parents=True, exist_ok=True)
    dest = WORKSPACE_INPUT / (file.filename or "upload")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"ok": True, "filename": dest.name, "size": dest.stat().st_size}


@app.get("/api/workspace/files")
async def workspace_files():
    def list_dir(p: Path) -> dict:
        if not p.exists():
            return {"files": [], "folders": {}}
        files, folders = [], {}
        for item in sorted(p.iterdir(), key=lambda x: (x.is_file(), x.name)):
            if item.is_file():
                files.append({"name": item.name, "size": item.stat().st_size, "modified": item.stat().st_mtime})
            elif item.is_dir() and not item.name.startswith("."):
                folders[item.name] = list_dir(item)
        return {"files": files, "folders": folders}
    return {"input": list_dir(WORKSPACE_INPUT), "output": list_dir(WORKSPACE_OUTPUT)}


@app.post("/api/workspace/folder")
async def workspace_create_folder(req: Request):
    body = await req.json()
    name = body.get("name", "").strip().strip("/")
    if not name or ".." in name:
        return {"ok": False, "error": "Invalid folder name"}
    (WORKSPACE_INPUT / name).mkdir(parents=True, exist_ok=True)
    return {"ok": True}


@app.get("/api/workspace/file/{directory}/{filename:path}")
async def workspace_file(directory: str, filename: str):
    if directory not in ("input", "output"):
        raise HTTPException(status_code=404)
    path = WORKSPACE_DIR / directory / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(str(path))


@app.delete("/api/workspace/file/input/{filename:path}")
async def workspace_delete_input(filename: str):
    path = WORKSPACE_INPUT / filename
    if path.exists():
        path.unlink()
    return {"ok": True}


@app.delete("/api/workspace/file/output/{filename:path}")
async def workspace_delete_output(filename: str):
    path = WORKSPACE_OUTPUT / filename
    if path.exists():
        path.unlink()
    return {"ok": True}


@app.post("/api/summary/daily/generate")
async def generate_summary():
    client = gmail if gmail.is_connected else (outlook if outlook.is_connected else None)
    if not client:
        return {"ok": False, "error": "No email account connected."}
    try:
        emails = await asyncio.to_thread(fetch_emails_last_24h, client)
        summary = await asyncio.to_thread(generate_daily_summary, emails)
        date = datetime.utcnow().strftime("%Y-%m-%d")
        await asyncio.to_thread(save_summary, date, summary, len(emails))
        return {"ok": True, "date": date, "summary": summary, "email_count": len(emails),
                "created_at": datetime.utcnow().isoformat()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/summary/daily/latest")
async def latest_summary():
    result = await asyncio.to_thread(get_latest_summary)
    if not result:
        return {"ok": False}
    return {"ok": True, **result}


# --- Automations ---

@app.get("/api/automations")
async def api_list_automations():
    return {"ok": True, "automations": await asyncio.to_thread(list_automations)}


class AutomationUpdateRequest(BaseModel):
    enabled: bool | None = None
    hour: int | None = None
    minute: int | None = None


@app.post("/api/automations/{key}/update")
async def api_update_automation(key: str, req: AutomationUpdateRequest):
    await asyncio.to_thread(update_automation, key, req.enabled, req.hour, req.minute)
    auto = await asyncio.to_thread(get_automation, key)
    if key == DAILY_SUMMARY_JOB_ID:
        if auto and auto["enabled"]:
            _reschedule_daily_summary(auto["hour"], auto["minute"])
        elif scheduler.get_job(DAILY_SUMMARY_JOB_ID):
            scheduler.remove_job(DAILY_SUMMARY_JOB_ID)
    return {"ok": True, "automation": auto}


@app.post("/api/automations/{key}/run")
async def api_run_automation_now(key: str):
    if key == DAILY_SUMMARY_JOB_ID:
        asyncio.create_task(_run_daily_summary())
        return {"ok": True}
    return {"ok": False, "error": "Unknown automation"}


# --- Agents ---

@app.post("/api/agents/create")
async def api_create_agent(req: AgentCreateRequest):
    try:
        agent_data = await asyncio.to_thread(create_agent, req.name, req.description, req.tools, req.system_prompt)
        return {"ok": True, "agent": agent_data}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/agents/list")
async def api_list_agents():
    try:
        agents = await asyncio.to_thread(list_agents)
        return {"ok": True, "agents": agents}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/agents/{agent_id}/toggle")
async def api_toggle_agent(agent_id: int, req: AgentToggleRequest):
    try:
        await asyncio.to_thread(toggle_agent_status, agent_id, req.is_active)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.delete("/api/agents/{agent_id}")
async def api_delete_agent(agent_id: int):
    try:
        await asyncio.to_thread(delete_agent, agent_id)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/agents/{agent_id}/chat")
async def api_agent_chat(agent_id: int, req: ChatRequest):
    agent_data = await asyncio.to_thread(get_agent, agent_id)
    if not agent_data:
        return {"ok": False, "error": "Agent not found."}

    graph = create_configured_agent(agent_data, gmail, outlook)
    lc_messages = []
    for m in req.messages:
        if m.role == "user":
            lc_messages.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            lc_messages.append(AIMessage(content=m.content))

    async def generate():
        try:
            async for event in graph.astream_events({"messages": lc_messages}, version="v2"):
                kind = event["event"]
                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    if chunk.content:
                        yield f"data: {json.dumps({'text': chunk.content})}\n\n"
                elif kind == "on_tool_start":
                    yield f"data: {json.dumps({'tool': event['name']})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Contacts ────────────────────────────────────────────────────

class ContactNotesRequest(BaseModel):
    notes: str

@app.get("/api/contacts/list")
async def api_contacts_list():
    try:
        contacts = await asyncio.to_thread(list_contacts)
        return {"ok": True, "contacts": contacts}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.patch("/api/contacts/{contact_id}/notes")
async def api_contact_notes(contact_id: int, req: ContactNotesRequest):
    try:
        await asyncio.to_thread(update_contact_notes, contact_id, req.notes)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/contacts/create")
async def api_contacts_create(req: Request):
    try:
        body = await req.json()
        contact_id = await asyncio.to_thread(create_contact, body)
        return {"ok": True, "id": contact_id}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.put("/api/contacts/{contact_id}")
async def api_contacts_update(contact_id: int, req: Request):
    try:
        body = await req.json()
        await asyncio.to_thread(update_contact, contact_id, body)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.delete("/api/contacts/{contact_id}")
async def api_contacts_delete(contact_id: int):
    try:
        await asyncio.to_thread(delete_contact, contact_id)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
