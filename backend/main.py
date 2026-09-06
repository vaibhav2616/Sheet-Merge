"""
SheetMerge FastAPI Tracking Backend
=====================================
Handles open-tracking pixels, click redirects, and status API calls.
Data is stored in a local SQLite database.

Run:  uvicorn main:app --reload --port 8000

Open in browser for API docs:  http://localhost:8000/docs
"""

from __future__ import annotations

import base64
import hashlib
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel


# ── Config ────────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent / "data" / "tracking.db"

# 1×1 transparent GIF bytes
TRANSPARENT_GIF = base64.b64decode(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)


# ── Database ──────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    with conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id    TEXT    NOT NULL,
                event_type  TEXT    NOT NULL,   -- 'open' | 'click' | 'bounce' | 'reply' | 'block'
                url         TEXT,               -- for click events
                ip          TEXT,
                user_agent  TEXT,
                created_at  TEXT    NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_events_track_id  ON events(track_id);
            CREATE INDEX IF NOT EXISTS idx_events_type      ON events(event_type);
            CREATE INDEX IF NOT EXISTS idx_events_created   ON events(created_at);

            CREATE TABLE IF NOT EXISTS campaigns (
                track_id    TEXT PRIMARY KEY,
                email       TEXT NOT NULL,
                subject     TEXT,
                sent_at     TEXT NOT NULL,
                row_index   INTEGER
            );
            """
        )
    conn.close()


# ── Lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


# ── App ───────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SheetMerge Tracking API",
    description="Open-source email tracking backend for SheetMerge.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────

def _record_event(
    track_id: str,
    event_type: str,
    url: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    conn = get_db()
    with conn:
        conn.execute(
            """
            INSERT INTO events (track_id, event_type, url, ip, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                track_id,
                event_type,
                url,
                ip,
                user_agent,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
    conn.close()


def _get_client_info(request: Request) -> tuple[str, str]:
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")
    return ip, ua


# ── Tracking endpoints ────────────────────────────────────────────────────

@app.get(
    "/track/open/{track_id}",
    summary="Open tracking pixel",
    tags=["Tracking"],
    response_class=Response,
)
async def track_open(track_id: str, request: Request) -> Response:
    """
    Serve a 1×1 transparent GIF and record an 'open' event.
    Embed the URL of this endpoint as an `<img>` tag in your HTML emails.
    """
    ip, ua = _get_client_info(request)
    _record_event(track_id, "open", ip=ip, user_agent=ua)
    return Response(
        content=TRANSPARENT_GIF,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get(
    "/track/click/{track_id}",
    summary="Click tracking redirect",
    tags=["Tracking"],
)
async def track_click(
    track_id: str,
    request: Request,
    url: str = Query(..., description="URL-encoded destination URL"),
) -> RedirectResponse:
    """
    Record a 'click' event and redirect the user to the original URL.
    Wrap links in your emails with this endpoint URL.
    """
    ip, ua = _get_client_info(request)
    destination = unquote(url)
    _record_event(track_id, "click", url=destination, ip=ip, user_agent=ua)
    return RedirectResponse(url=destination, status_code=302)


# ── Status / analytics API ────────────────────────────────────────────────

class EmailStatus(BaseModel):
    track_id: str
    opened: bool
    clicked: bool
    bounced: bool
    replied: bool
    positive: bool
    blocked: bool
    open_count: int
    click_count: int
    first_open_at: Optional[str]
    last_open_at: Optional[str]


@app.get(
    "/api/status/{track_id}",
    response_model=EmailStatus,
    summary="Get status for a single email",
    tags=["API"],
)
async def get_status(track_id: str) -> EmailStatus:
    """
    Returns aggregated open/click/bounce/reply/block/positive status for a given
    tracking ID. Called by Apps Script to sync back to the sheet.
    """
    conn = get_db()
    rows = conn.execute(
        "SELECT event_type, created_at FROM events WHERE track_id = ? ORDER BY created_at",
        (track_id,),
    ).fetchall()
    conn.close()

    opens     = [r for r in rows if r["event_type"] == "open"]
    clicks    = [r for r in rows if r["event_type"] == "click"]
    bounces   = [r for r in rows if r["event_type"] == "bounce"]
    replies   = [r for r in rows if r["event_type"] in ("reply", "positive")]
    positives = [r for r in rows if r["event_type"] == "positive"]
    blocks    = [r for r in rows if r["event_type"] == "block"]

    return EmailStatus(
        track_id      = track_id,
        opened        = len(opens)     > 0,
        clicked       = len(clicks)    > 0,
        bounced       = len(bounces)   > 0,
        replied       = len(replies)   > 0,
        positive      = len(positives) > 0,
        blocked       = len(blocks)    > 0,
        open_count    = len(opens),
        click_count   = len(clicks),
        first_open_at = opens[0]["created_at"]  if opens else None,
        last_open_at  = opens[-1]["created_at"] if opens else None,
    )


class CampaignSummary(BaseModel):
    total_tracked: int
    opened: int
    clicked: int
    bounced: int
    replied: int
    blocked: int
    open_rate: float
    click_rate: float
    bounce_rate: float


@app.get(
    "/api/summary",
    response_model=CampaignSummary,
    summary="Overall campaign summary",
    tags=["API"],
)
async def get_summary() -> CampaignSummary:
    """Returns aggregate metrics across all tracked emails."""
    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(DISTINCT track_id) as cnt FROM events"
    ).fetchone()["cnt"]

    def _count(event_type: str) -> int:
        return conn.execute(
            "SELECT COUNT(DISTINCT track_id) as cnt FROM events WHERE event_type = ?",
            (event_type,),
        ).fetchone()["cnt"]

    opened  = _count("open")
    clicked = _count("click")
    bounced = _count("bounce")
    replied = _count("reply")
    blocked = _count("block")
    conn.close()

    def rate(n: int) -> float:
        return round(n / total * 100, 2) if total else 0.0

    return CampaignSummary(
        total_tracked = total,
        opened        = opened,
        clicked       = clicked,
        bounced       = bounced,
        replied       = replied,
        blocked       = blocked,
        open_rate     = rate(opened),
        click_rate    = rate(clicked),
        bounce_rate   = rate(bounced),
    )


@app.get(
    "/api/events",
    summary="Raw events log",
    tags=["API"],
)
async def get_events(
    track_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 200,
):
    """Returns raw event rows, optionally filtered."""
    conn = get_db()
    query = "SELECT * FROM events WHERE 1=1"
    args: list = []
    if track_id:
        query += " AND track_id = ?"
        args.append(track_id)
    if event_type:
        query += " AND event_type = ?"
        args.append(event_type)
    query += " ORDER BY created_at DESC LIMIT ?"
    args.append(limit)

    rows = [dict(r) for r in conn.execute(query, args).fetchall()]
    conn.close()
    return {"events": rows, "count": len(rows)}


# ── Webhook endpoints (for ESP callbacks) ─────────────────────────────────

class WebhookEvent(BaseModel):
    track_id: str
    event_type: str   # bounce | reply | block | spam
    detail: Optional[str] = None


@app.post(
    "/webhook/event",
    summary="Receive ESP webhook events (bounce, reply, block)",
    tags=["Webhooks"],
)
async def receive_webhook(event: WebhookEvent) -> dict:
    """
    Endpoint for Email Service Providers (ESPs) or your own scripts to
    push bounce / reply / block events into SheetMerge.

    Call this from a cron script that reads Gmail bounce emails, for example.
    """
    allowed = {"bounce", "reply", "block", "spam", "unsubscribe"}
    if event.event_type not in allowed:
        raise HTTPException(400, f"event_type must be one of {allowed}")
    _record_event(event.track_id, event.event_type, url=event.detail)
    return {"status": "recorded", "track_id": event.track_id, "event": event.event_type}


# ── Health check ──────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health() -> dict:
    return {"status": "ok", "version": "1.0.0", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/", tags=["System"])
async def root() -> dict:
    return {
        "name": "SheetMerge Tracking Backend",
        "docs": "/docs",
        "health": "/health",
}

