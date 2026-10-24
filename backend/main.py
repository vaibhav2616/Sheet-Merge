"""
SheetMerge FastAPI Multi-Account Manager & Automation Engine (v2 Enterprise)
============================================================================
Features:
- Multi-Account OAuth & Relay Rotation
- Socket Timeout Configuration (timeout=30s)
- 5xx Hard Bounce Interception & Permanent Suppression
- Randomized Throttling Jitter (2-5s human interval)
- DNS Security Checker (SPF, DKIM, DMARC, MX)
- Content Spam Trigger & Link Ratio Analyzer
- Pre-flight Recipient List Sanitizer
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
from typing import Any, Dict, List, Optional
from urllib.parse import unquote

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, EmailStr

from domain_security import check_domain_dns
from spam_analyzer import analyze_email_content, verify_email_address
from smtp_relay import SMTPRelayConfig, get_random_throttle_delay, send_via_smtp_relay


# ── Database Path & Transparent Pixel ─────────────────────────────────────

DATA_DIR = Path(os.environ.get("SHEETMERGE_DATA_DIR", Path(__file__).parent / "data"))
DB_PATH = Path(os.environ.get("SHEETMERGE_DB_PATH", DATA_DIR / "tracking_v2.db"))

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

            CREATE TABLE IF NOT EXISTS suppression_list (
                email          TEXT PRIMARY KEY,
                reason         TEXT NOT NULL, -- 'hard_bounce_5xx', 'spam_complaint', 'manual'
                suppressed_at  TEXT NOT NULL
            );

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


class DomainCheckRequest(BaseModel):
    domain: str
    dkim_selector: Optional[str] = "google"


class SpamCheckRequest(BaseModel):
    subject: str
    body_html: str


class ListCleanRequest(BaseModel):
    emails: List[str]
    check_mx: Optional[bool] = False


class SmtpSendRequest(BaseModel):
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    sender_email: EmailStr
    recipients: List[EmailStr]
    subject: str
    body_html: str
    body_text: Optional[str] = None
    min_delay_seconds: float = 2.0
    max_delay_seconds: float = 5.0
    socket_timeout: float = 30.0


# ── Lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


# ── FastAPI App ───────────────────────────────────────────────────────────

app = FastAPI(
    title="SheetMerge Enterprise V2 Backend",
    description="Anti-Spam Humanizer, SPF/DKIM/DMARC Inspector, 5xx Bounce Guard, and Multi-Account Engine",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


# ── Domain Security & DNS Authentication Endpoints ───────────────────────

@app.post("/api/security/check-domain")
def inspect_domain_security(req: DomainCheckRequest):
    """
    Checks SPF, DKIM, DMARC, and MX records for a domain to guarantee compliance
    with Microsoft 365, Google Workspace, and enterprise firewall standards.
    """
    return check_domain_dns(req.domain, req.dkim_selector or "google")


# ── Content Spam Analyzer ────────────────────────────────────────────────

@app.post("/api/security/analyze-content")
def analyze_content(req: SpamCheckRequest):
    """
    Analyzes subject and body against enterprise spam trigger patterns,
    caps ratios, link stuffing, and image-to-text ratios.
    """
    return analyze_email_content(req.subject, req.body_html)


# ── Recipient List Cleaning ──────────────────────────────────────────────

@app.post("/api/security/clean-list")
def clean_recipient_list(req: ListCleanRequest):
    """
    Sanitizes recipient emails before dispatch, rejecting syntax errors,
    disposable inboxes, and suppressed hard bounce addresses.
    """
    conn = get_db()
    suppressed_rows = conn.execute("SELECT email FROM suppression_list").fetchall()
    suppressed_set = {r["email"].lower() for r in suppressed_rows}
    conn.close()

    valid_leads: List[str] = []
    invalid_leads: List[Dict[str, str]] = []

    for email in req.emails:
        clean_email = email.strip().lower()
        if clean_email in suppressed_set:
            invalid_leads.append({"email": email, "reason": "Previously hard-bounced (Suppressed)"})
            continue

        ver_result = verify_email_address(clean_email, check_mx=req.check_mx or False)
        if ver_result["valid"]:
            valid_leads.append(clean_email)
        else:
            invalid_leads.append({"email": email, "reason": ver_result["reason"]})

    return {
        "total_analyzed": len(req.emails),
        "valid_count": len(valid_leads),
        "invalid_count": len(invalid_leads),
        "valid_emails": valid_leads,
        "invalid_details": invalid_leads
    }


# ── Enterprise SMTP Dispatch with 5xx Bounce Guard & Throttling ──────────

@app.post("/api/dispatch/smtp-batch")
def dispatch_via_smtp_relay(req: SmtpSendRequest):
    """
    Dispatches a batch of emails through an authenticated SMTP relay:
    - Sets explicit 30s socket timeout
    - Applies randomized 2-5s human throttling jitter
    - Intercepts 5xx hard bounces and permanently suppresses recipient
    """
    config = SMTPRelayConfig(
        host=req.smtp_host,
        port=req.smtp_port,
        username=req.smtp_user,
        password=req.smtp_password,
        timeout=req.socket_timeout
    )

    conn = get_db()
    results = []

    for email in req.recipients:
        # Check suppression
        supp = conn.execute("SELECT email FROM suppression_list WHERE email = ?", (email.lower(),)).fetchone()
        if supp:
            results.append({"recipient": email, "status": "skipped", "reason": "Address permanently suppressed (prior 5xx bounce)"})
            continue

        # Send via relay
        res = send_via_smtp_relay(
            config=config,
            sender=req.sender_email,
            recipient=email,
            subject=req.subject,
            body_html=req.body_html,
            body_text=req.body_text
        )

        if not res["success"] and res.get("permanent_suppress"):
            # Hard bounce encountered (550 / 5xx) -> Permanently suppress!
            now_str = datetime.now(timezone.utc).isoformat()
            with conn:
                conn.execute(
                    "INSERT OR IGNORE INTO suppression_list (email, reason, suppressed_at) VALUES (?, ?, ?)",
                    (email.lower(), res.get("error", "5xx Hard Bounce"), now_str)
                )

        results.append(res)

        # Humanized randomized throttle (2 - 5 seconds jitter)
        delay = get_random_throttle_delay(req.min_delay_seconds, req.max_delay_seconds)
        time.sleep(delay)

    conn.close()
    return {"dispatched_count": len(results), "details": results}


# ── Multi-Account Rotation Endpoints ─────────────────────────────────────

@app.get("/api/accounts", response_model=List[AccountResponse])
def list_accounts():
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
    conn = get_db()
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
        return {"available": False, "message": "All accounts have satisfied their daily limits."}

    return {
        "available": True,
        "id": row["id"],
        "email": row["email"],
        "remaining_today": row["daily_quota"] - row["sent_today"],
    }


# ── Campaign History & Anti-Duplicate Tracking ───────────────────────────

@app.post("/api/history/record")
def record_send_event(req: MergeRecordRequest):
    conn = get_db()
    now_str = datetime.now(timezone.utc).isoformat()

    # Resolve account_id if an account_email was provided
    account_id: Optional[int] = None
    if req.account_email:
        acct_row = conn.execute(
            "SELECT id FROM accounts WHERE email = ?", (req.account_email,)
        ).fetchone()
        if acct_row:
            account_id = acct_row["id"]

    with conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO send_history
            (email, account_id, status, subject, track_id, row_index, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (req.email.lower(), account_id, req.status, req.subject,
             req.track_id, req.row_index, now_str),
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
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    now_str = datetime.now(timezone.utc).isoformat()

    conn = get_db()
    with conn:
        conn.execute(
            "INSERT INTO events (track_id, event_type, ip, user_agent, created_at) VALUES (?, 'open', ?, ?, ?)",
            (track_id, ip, ua, now_str),
        )
        conn.execute(
            "UPDATE send_history SET status = 'opened' WHERE track_id = ? AND status = 'sent'",
            (track_id,),
        )
    conn.close()
    return Response(content=TRANSPARENT_GIF, media_type="image/gif")


@app.get("/track/click/{track_id}")
def track_click(track_id: str, url: str = Query(...), request: Request = None):
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


@app.get("/api/status/{track_id}")
def get_status(track_id: str):
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

    return {
        "track_id": track_id,
        "status": hist["status"] if hist else "unknown",
        "opened": any(e["event_type"] == "open" for e in events),
        "clicked": any(e["event_type"] == "click" for e in events),
        "bounced": any(e["event_type"] == "bounce" for e in events),
        "event_count": len(events),
    }


STATIC_INDEX = Path(__file__).parent / "static" / "index.html"

@app.get("/", response_class=HTMLResponse)
def index_docs():
    if STATIC_INDEX.exists():
        return FileResponse(STATIC_INDEX)
    return """
    <html>
      <head><title>SheetMerge V2 Enterprise Backend</title></head>
      <body style="font-family:sans-serif; padding:30px; background:#f8fafc; color:#0f172a;">
        <h2>⚡ SheetMerge V2 Enterprise Engine Active</h2>
        <p>Interactive OpenAPI Documentation: <a href="/docs">/docs</a></p>
        <p>Features: SPF/DKIM/DMARC Security Inspector, 5xx Hard Bounce Suppression, Anti-Spam Content Analyzer, and Multi-Account SMTP Relay.</p>
      </body>
    </html>
    """
