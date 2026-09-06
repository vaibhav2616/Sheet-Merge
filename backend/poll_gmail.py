"""
Gmail Bounce & Reply Poller
============================
A standalone script that reads your Gmail inbox for bounce notifications
and reply emails, then POSTs webhook events to the SheetMerge backend.

Schedule with Windows Task Scheduler or a cron job:
  python poll_gmail.py

Requires:
  pip install google-auth google-auth-httplib2 google-api-python-client requests

Authentication:
  1. Go to https://console.cloud.google.com/
  2. Create OAuth 2.0 credentials (Desktop app)
  3. Download credentials.json into this folder
  4. On first run, a browser will open for consent — then token.json is saved.
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
from pathlib import Path

import requests

# Google API imports — install with: pip install google-auth-oauthlib google-api-python-client
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
except ImportError:
    print("Install: pip install google-auth-oauthlib google-api-python-client")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────

BACKEND_URL      = "http://localhost:8000"
CREDENTIALS_FILE = Path(__file__).parent / "credentials.json"
TOKEN_FILE       = Path(__file__).parent / "token.json"
SCOPES           = ["https://www.googleapis.com/auth/gmail.readonly"]

# ── Auth ──────────────────────────────────────────────────────────────────

def get_gmail_service():
    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_FILE.exists():
                print(f"ERROR: {CREDENTIALS_FILE} not found. Download OAuth credentials from Google Cloud Console.")
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds)


# ── Helpers ───────────────────────────────────────────────────────────────

def _post_event(track_id: str, event_type: str, detail: str = "") -> None:
    try:
        resp = requests.post(
            f"{BACKEND_URL}/webhook/event",
            json={"track_id": track_id, "event_type": event_type, "detail": detail},
            timeout=5,
        )
        if resp.status_code == 200:
            print(f"  ✅ Recorded {event_type} for {track_id}")
        else:
            print(f"  ⚠️  Backend returned {resp.status_code}")
    except requests.RequestException as e:
        print(f"  ❌ Could not reach backend: {e}")


def _extract_track_id(text: str) -> str | None:
    """Try to find a MM_TrackId in the email body."""
    # Our tracking pixel URL contains the track_id
    match = re.search(r"/track/open/([A-Za-z0-9]{10,40})", text)
    if match:
        return match.group(1)
    return None


def _decode_body(msg_part: dict) -> str:
    data = msg_part.get("body", {}).get("data", "")
    if data:
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    return ""


# ── Main logic ────────────────────────────────────────────────────────────

def poll_bounces(service) -> None:
    print("🔍 Checking for bounce emails…")
    results = service.users().messages().list(
        userId="me",
        q='from:mailer-daemon OR subject:"Delivery Status Notification" OR subject:"Mail delivery failed"',
        maxResults=50,
    ).execute()

    messages = results.get("messages", [])
    print(f"   Found {len(messages)} potential bounce messages")

    for msg_ref in messages:
        msg = service.users().messages().get(
            userId="me", id=msg_ref["id"], format="full"
        ).execute()

        # Try to find track_id in payload
        payload = msg.get("payload", {})
        body_text = ""

        if "parts" in payload:
            for part in payload["parts"]:
                body_text += _decode_body(part)
        else:
            body_text = _decode_body(payload)

        track_id = _extract_track_id(body_text)
        if track_id:
            # Extract bounced email from body
            emails = re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", body_text)
            detail = emails[0] if emails else ""
            _post_event(track_id, "bounce", detail)


def poll_replies(service) -> None:
    print("🔍 Checking for reply emails…")
    results = service.users().messages().list(
        userId="me",
        q="in:inbox is:unread",
        maxResults=50,
    ).execute()

    messages = results.get("messages", [])
    print(f"   Found {len(messages)} unread messages to check")

    for msg_ref in messages:
        msg = service.users().messages().get(
            userId="me", id=msg_ref["id"], format="metadata",
            metadataHeaders=["In-Reply-To", "References", "Subject"],
        ).execute()

        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        # Check if it's a reply (has In-Reply-To header)
        if "In-Reply-To" not in headers:
            continue

        # Try to match to a sent email via thread
        thread_id = msg.get("threadId")
        if not thread_id:
            continue

        thread = service.users().threads().get(
            userId="me", id=thread_id, format="minimal"
        ).execute()

        # First message in thread is our sent email — try to get its body for track_id
        thread_msgs = thread.get("messages", [])
        if len(thread_msgs) < 2:
            continue

        first_msg = service.users().messages().get(
            userId="me", id=thread_msgs[0]["id"], format="full"
        ).execute()

        payload = first_msg.get("payload", {})
        body_text = ""
        if "parts" in payload:
            for part in payload["parts"]:
                body_text += _decode_body(part)
        else:
            body_text = _decode_body(payload)

        track_id = _extract_track_id(body_text)
        if track_id:
            sender_header = headers.get("From", "")
            # Check for positive sentiment in reply body
            reply_text = body_text.lower()
            positive_keywords = [
                "interested", "yes", "call", "schedule", "meeting", "demo",
                "pricing", "quote", "sure", "sounds good", "discuss", "connect"
            ]
            is_positive = any(kw in reply_text for kw in positive_keywords)
            event_type = "positive" if is_positive else "reply"
            _post_event(track_id, event_type, sender_header)


if __name__ == "__main__":
    print("=" * 50)
    print("SheetMerge Gmail Poller")
    print("=" * 50)
    service = get_gmail_service()
    poll_bounces(service)
    poll_replies(service)
    print("\n✅ Poll complete.")
