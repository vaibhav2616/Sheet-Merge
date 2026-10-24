"""
SheetMerge FastAPI Multi-Account Manager & Automation Engine (v2)
==================================================================
Manages multi-account OAuth rotation, automated daily dispatch,
real-time bounce and reply classification, and open/click tracking.
"""

from __future__ import annotations

import base64
import os
import random
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import unquote

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, EmailStr


# ── Database Path & Transparent Pixel ─────────────────────────────────────

DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "tracking_v2.db"

TRANSPARENT_GIF = base64.b64decode(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)


# ── SQLite Database Setup ─────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    with conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                email          TEXT UNIQUE NOT NULL,
                daily_quota    INTEGER DEFAULT 50,
                sent_today     INTEGER DEFAULT 0,
                last_reset     TEXT,
                is_active      INTEGER DEFAULT 1,
                created_at     TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS send_history (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                email          TEXT NOT NULL,
                account_id     INTEGER,
                status         TEXT NOT NULL, -- 'sent', 'opened', 'clicked', 'replied', 'positive', 'bounced', 'blocked'
                subject        TEXT,
                track_id       TEXT UNIQUE,
                row_index      INTEGER,
                timestamp      TEXT NOT NULL,
                meta_json      TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_history_email ON send_history(email);
            CREATE INDEX IF NOT EXISTS idx_history_track ON send_history(track_id);

            CREATE TABLE IF NOT EXISTS events (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id       TEXT NOT NULL,
                event_type     TEXT NOT NULL, -- 'open', 'click', 'bounce', 'reply'
                url            TEXT,
                ip             TEXT,
                user_agent     TEXT,
                created_at     TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_events_track ON events(track_id);
            """
        )
    conn.close()


# ── Models ────────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    email: EmailStr
    daily_quota: Optional[int] = 50


class AccountResponse(BaseModel):
    id: int
    email: str
    daily_quota: int
    sent_today: int
    is_active: bool


class MergeRecordRequest(BaseModel):
    email: EmailStr
    account_email: Optional[str] = None
    status: str
    track_id: str
    row_index: Optional[int] = None
    subject: Optional[str] = None


class BatchSendSimulationRequest(BaseModel):
    recipients: List[str]
    subject: str
    body_html: str
    daily_target: int = 50
    base_delay_seconds: float = 12.0
    use_jitter: bool = True


# ── Lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


# ── FastAPI App ───────────────────────────────────────────────────────────

app = FastAPI(
    title="SheetMerge V2 Backend & Multi-Account Engine",
    description="Anti-Spam Humanizer, Multi-Account Rotation, and Tracking Engine",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


# ── Multi-Account Rotation Endpoints ─────────────────────────────────────

@app.get("/api/accounts", response_model=List[AccountResponse])
def list_accounts():
    """Returns all configured sender accounts with current quota metrics."""
    conn = get_db()
    rows = conn.execute("SELECT id, email, daily_quota, sent_today, is_active FROM accounts").fetchall()
    conn.close()
    return [
        AccountResponse(
            id=r["id"],
            email=r["email"],
            daily_quota=r["daily_quota"],
            sent_today=r["sent_today"],
            is_active=bool(r["is_active"]),
        )
        for r in rows
    ]


@app.post("/api/accounts", response_model=AccountResponse)
def add_account(account: AccountCreate):
    """Registers a sender account for multi-account alternation."""
    conn = get_db()
    now_str = datetime.now(timezone.utc).isoformat()
    try:
        cur = conn.execute(
            """
            INSERT INTO accounts (email, daily_quota, sent_today, last_reset, is_active, created_at)
            VALUES (?, ?, 0, ?, 1, ?)
            """,
            (account.email, account.daily_quota or 50, now_str, now_str),
        )
        conn.commit()
        account_id = cur.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Account already registered.")
    conn.close()
    return AccountResponse(
        id=account_id,
        email=account.email,
        daily_quota=account.daily_quota or 50,
        sent_today=0,
        is_active=True,
    )


@app.get("/api/accounts/next-active")
def get_next_available_account():
    """
    Selects the next active sender account that hasn't hit its 50/day limit,
    enabling round-robin alternation across 2 or more accounts.
    """
    conn = get_db()
    # Find account with sent_today < daily_quota
    row = conn.execute(
        """
        SELECT id, email, daily_quota, sent_today
        FROM accounts
        WHERE is_active = 1 AND sent_today < daily_quota
        ORDER BY sent_today ASC, id ASC
        LIMIT 1
        """
    ).fetchone()
    conn.close()

    if not row:
        return {
            "available": False,
            "message": "All accounts have satisfied their daily limits.",
        }

    return {
        "available": True,
        "id": row["id"],
        "email": row["email"],
        "remaining_today": row["daily_quota"] - row["sent_today"],
    }


# ── Campaign History & Anti-Duplicate Tracking ───────────────────────────

@app.post("/api/history/record")
def record_send_event(req: MergeRecordRequest):
    """Stores send status in the persistent backend database."""
    conn = get_db()
    now_str = datetime.now(timezone.utc).isoformat()
    with conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO send_history
            (email, status, subject, track_id, row_index, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (req.email.lower(), req.status, req.subject, req.track_id, req.row_index, now_str),
        )
        if req.account_email:
            conn.execute(
                "UPDATE accounts SET sent_today = sent_today + 1 WHERE email = ?",
                (req.account_email,),
            )
    conn.close()
    return {"status": "ok", "email": req.email, "recorded_as": req.status}


@app.get("/api/history/check/{email}")
def check_email_history(email: str):
    """Verifies whether an email was already contacted in previous campaigns."""
    conn = get_db()
    row = conn.execute(
        "SELECT status, timestamp, subject FROM send_history WHERE email = ?",
        (email.lower().strip(),),
    ).fetchone()
    conn.close()
    if row:
        return {
            "already_contacted": True,
            "status": row["status"],
            "sent_at": row["timestamp"],
            "subject": row["subject"],
        }
    return {"already_contacted": False}


# ── Open & Click Tracking ────────────────────────────────────────────────

@app.get("/track/open/{track_id}")
def track_open(track_id: str, request: Request):
    """Returns 1x1 transparent GIF and logs open event."""
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    now_str = datetime.now(timezone.utc).isoformat()

    conn = get_db()
    with conn:
        conn.execute(
            "INSERT INTO events (track_id, event_type, ip, user_agent, created_at) VALUES (?, 'open', ?, ?, ?)",
            (track_id, ip, ua, now_str),
        )
        # Upgrade status in history if currently sent
        conn.execute(
            "UPDATE send_history SET status = 'opened' WHERE track_id = ? AND status = 'sent'",
            (track_id,),
        )
    conn.close()

    return Response(content=TRANSPARENT_GIF, media_type="image/gif")


@app.get("/track/click/{track_id}")
def track_click(track_id: str, url: str = Query(...), request: Request = None):
    """Logs link click and redirects recipient to target destination."""
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    now_str = datetime.now(timezone.utc).isoformat()
    target_url = unquote(url)

    conn = get_db()
    with conn:
        conn.execute(
            "INSERT INTO events (track_id, event_type, url, ip, user_agent, created_at) VALUES (?, 'click', ?, ?, ?, ?)",
            (track_id, target_url, ip, ua, now_str),
        )
        conn.execute(
            "UPDATE send_history SET status = 'clicked' WHERE track_id = ?",
            (track_id,),
        )
    conn.close()

    return RedirectResponse(url=target_url, status_code=302)


# ── Status Inspection API ────────────────────────────────────────────────

@app.get("/api/status/{track_id}")
def get_status(track_id: str):
    """Retrieves full interaction metrics for a given send."""
    conn = get_db()
    events = conn.execute(
        "SELECT event_type, created_at FROM events WHERE track_id = ?",
        (track_id,),
    ).fetchall()
    hist = conn.execute(
        "SELECT status, email FROM send_history WHERE track_id = ?",
        (track_id,),
    ).fetchone()
    conn.close()

    opened = any(e["event_type"] == "open" for e in events)
    clicked = any(e["event_type"] == "click" for e in events)
    bounced = any(e["event_type"] == "bounce" for e in events)

    return {
        "track_id": track_id,
        "status": hist["status"] if hist else "unknown",
        "opened": opened,
        "clicked": clicked,
        "bounced": bounced,
        "event_count": len(events),
    }


@app.get("/", response_class=HTMLResponse)
def index_docs():
    return """
    <html>
      <head><title>SheetMerge V2 Backend</title></head>
      <body style="font-family:sans-serif; padding:30px; background:#f8fafc; color:#0f172a;">
        <h2>⚡ SheetMerge V2 Backend & Multi-Account Engine Active</h2>
        <p>Interactive OpenAPI Documentation: <a href="/docs">/docs</a></p>
        <p>Open/Click Tracking & Multi-Account Alternation Endpoints Running.</p>
      </body>
    </html>
    """
