import json
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "summaries.db"


def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS automations (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                key         TEXT UNIQUE NOT NULL,
                name        TEXT NOT NULL,
                description TEXT DEFAULT '',
                enabled     INTEGER DEFAULT 0,
                hour        INTEGER DEFAULT 19,
                minute      INTEGER DEFAULT 0,
                last_run    TEXT DEFAULT NULL,
                last_status TEXT DEFAULT NULL
            )
        """)
        conn.execute("""
            INSERT OR IGNORE INTO automations (key, name, description, enabled, hour, minute)
            VALUES ('daily_summary', 'Daily Summary', 'Reads your inbox and generates an AI summary of emails, action items, and priorities.', 1, 19, 0)
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_summaries (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                date        TEXT NOT NULL,
                summary_json TEXT NOT NULL,
                email_count INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS agents (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT NOT NULL,
                description   TEXT DEFAULT '',
                tools         TEXT DEFAULT '[]',
                system_prompt TEXT DEFAULT '',
                is_active     INTEGER DEFAULT 0,
                created_at    TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS contacts (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                name         TEXT NOT NULL DEFAULT '',
                organization TEXT DEFAULT '',
                role         TEXT DEFAULT '',
                email        TEXT DEFAULT '',
                linkedin     TEXT DEFAULT '',
                last_contact TEXT DEFAULT '',
                notes        TEXT DEFAULT '',
                app_count    INTEGER DEFAULT 0,
                email_count  INTEGER DEFAULT 1,
                created_at   TEXT NOT NULL
            )
        """)
        # Migrate: add new columns if missing
        for col_def in [
            "photo TEXT DEFAULT ''",
            "tags TEXT DEFAULT '[]'",
            "twitter TEXT DEFAULT ''",
            "github TEXT DEFAULT ''",
            "website TEXT DEFAULT ''",
        ]:
            try:
                conn.execute(f"ALTER TABLE contacts ADD COLUMN {col_def}")
            except Exception:
                pass
        conn.commit()


# ── automations ──

def list_automations() -> list:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT key, name, description, enabled, hour, minute, last_run, last_status FROM automations ORDER BY id"
        ).fetchall()
    return [
        {"key": r[0], "name": r[1], "description": r[2], "enabled": bool(r[3]),
         "hour": r[4], "minute": r[5], "last_run": r[6], "last_status": r[7]}
        for r in rows
    ]


def get_automation(key: str) -> dict | None:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT key, name, description, enabled, hour, minute, last_run, last_status FROM automations WHERE key=?", (key,)
        ).fetchone()
    if not row:
        return None
    return {"key": row[0], "name": row[1], "description": row[2], "enabled": bool(row[3]),
            "hour": row[4], "minute": row[5], "last_run": row[6], "last_status": row[7]}


def update_automation(key: str, enabled: bool | None = None, hour: int | None = None, minute: int | None = None):
    fields, vals = [], []
    if enabled is not None: fields.append("enabled = ?"); vals.append(1 if enabled else 0)
    if hour is not None:    fields.append("hour = ?");    vals.append(hour)
    if minute is not None:  fields.append("minute = ?");  vals.append(minute)
    if not fields:
        return
    vals.append(key)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(f"UPDATE automations SET {', '.join(fields)} WHERE key=?", vals)
        conn.commit()


def record_automation_run(key: str, status: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "UPDATE automations SET last_run=?, last_status=? WHERE key=?",
            (datetime.utcnow().isoformat(), status, key)
        )
        conn.commit()


# ── daily summaries ──

def save_summary(date: str, summary: dict, email_count: int):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO daily_summaries (date, summary_json, email_count, created_at) VALUES (?, ?, ?, ?)",
            (date, json.dumps(summary), email_count, datetime.utcnow().isoformat()),
        )
        conn.commit()


def get_latest_summary() -> dict | None:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT date, summary_json, email_count, created_at FROM daily_summaries ORDER BY id DESC LIMIT 1"
        ).fetchone()
    if not row:
        return None
    return {
        "date": row[0],
        "summary": json.loads(row[1]),
        "email_count": row[2],
        "created_at": row[3],
    }


# ── agents ──

def _row_to_agent(row) -> dict:
    return {
        "id": row[0],
        "name": row[1],
        "description": row[2],
        "tools": json.loads(row[3]),
        "system_prompt": row[4],
        "is_active": bool(row[5]),
        "created_at": row[6],
    }


def create_agent(name: str, description: str, tools: list, system_prompt: str) -> dict:
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute(
            "INSERT INTO agents (name, description, tools, system_prompt, is_active, created_at) VALUES (?, ?, ?, ?, 0, ?)",
            (name, description, json.dumps(tools), system_prompt, now),
        )
        conn.commit()
        agent_id = cur.lastrowid
    return get_agent(agent_id)


def list_agents() -> list:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT id, name, description, tools, system_prompt, is_active, created_at FROM agents ORDER BY is_active DESC, created_at DESC"
        ).fetchall()
    return [_row_to_agent(r) for r in rows]


def get_agent(agent_id: int) -> dict | None:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT id, name, description, tools, system_prompt, is_active, created_at FROM agents WHERE id = ?",
            (agent_id,),
        ).fetchone()
    return _row_to_agent(row) if row else None


def toggle_agent_status(agent_id: int, is_active: bool):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE agents SET is_active = ? WHERE id = ?", (1 if is_active else 0, agent_id))
        conn.commit()


def delete_agent(agent_id: int):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
        conn.commit()


# ── contacts ──

def _row_to_contact(row) -> dict:
    d = dict(row)
    try:
        d["tags"] = json.loads(d.get("tags") or "[]")
    except Exception:
        d["tags"] = []
    return d


def upsert_contact(name: str, organization: str, role: str, email: str, linkedin: str) -> int:
    """Insert or update a contact by email (or name+org if no email)."""
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(DB_PATH) as conn:
        if email:
            existing = conn.execute(
                "SELECT id FROM contacts WHERE email=?", (email,)
            ).fetchone()
        else:
            existing = conn.execute(
                "SELECT id FROM contacts WHERE lower(name)=lower(?) AND lower(organization)=lower(?)",
                (name, organization),
            ).fetchone()

        if existing:
            conn.execute(
                "UPDATE contacts SET organization=?, role=?, linkedin=?, last_contact=?, email_count=email_count+1 WHERE id=?",
                (organization, role, linkedin, now, existing[0]),
            )
            conn.commit()
            return existing[0]
        else:
            cur = conn.execute(
                "INSERT INTO contacts (name, organization, role, email, linkedin, last_contact, notes, app_count, email_count, created_at) VALUES (?,?,?,?,?,?,0,0,1,?)",
                (name, organization, role, email, linkedin, now, now),
            )
            conn.commit()
            return cur.lastrowid


def list_contacts() -> list:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM contacts ORDER BY name ASC").fetchall()
    return [_row_to_contact(r) for r in rows]


def create_contact(data: dict) -> int:
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute(
            """INSERT INTO contacts
               (name, email, role, organization, photo, tags, notes, linkedin, twitter, github, website, last_contact, app_count, email_count, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,?)""",
            (
                data.get("name", ""),
                data.get("email", ""),
                data.get("role", ""),
                data.get("organization", ""),
                data.get("photo", ""),
                json.dumps(data.get("tags", [])),
                data.get("notes", ""),
                data.get("linkedin", ""),
                data.get("twitter", ""),
                data.get("github", ""),
                data.get("website", ""),
                now, now,
            ),
        )
        conn.commit()
        return cur.lastrowid


def update_contact(contact_id: int, data: dict):
    allowed = ["name", "email", "role", "organization", "photo", "notes", "linkedin", "twitter", "github", "website"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if "tags" in data:
        fields["tags"] = json.dumps(data["tags"])
    if not fields:
        return
    with sqlite3.connect(DB_PATH) as conn:
        set_clause = ", ".join(f"{k}=?" for k in fields)
        conn.execute(f"UPDATE contacts SET {set_clause} WHERE id=?", [*fields.values(), contact_id])
        conn.commit()


def delete_contact(contact_id: int):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM contacts WHERE id=?", (contact_id,))
        conn.commit()


def update_contact_notes(contact_id: int, notes: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE contacts SET notes=? WHERE id=?", (notes, contact_id))
        conn.commit()
