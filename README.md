<p align="center">
  <img src="https://img.shields.io/badge/Version-v2.0.0-blue?style=for-the-badge" alt="v2.0.0">
  <img src="https://img.shields.io/badge/Platform-Google%20Sheets-brightgreen?logo=googlesheets&style=for-the-badge" alt="Google Sheets">
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&style=for-the-badge" alt="FastAPI">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT">
</p>

<h1 align="center">✉️ SheetMerge v2</h1>
<p align="center"><strong>Enterprise-Grade, Anti-Spam Mail Merge for Google Sheets — Single Unified Status Column, Automated Daily 50-Send Scheduling, Multi-Account Rotation, and Deliverability Intelligence</strong></p>
<p align="center">
  <em>An open-source, spam-resistant alternative to Yet Another Mail Merge (YAMM) with native Gmail draft support, responsive light/dark UI, and automatic bounce isolation.</em>
</p>

---

## ⚡ What's New in v2.0

| Feature | Description |
|---------|-------------|
| 🎯 **Single Unified Status Column** | Replaced 10 cluttering columns with one clean **`SheetMerge Status`** column featuring rich pastel color badges (`Sent`, `Opened`, `Clicked`, `Replied`, `Positive Reply`, `Bounced`, `Blocked`, `Duplicate`) and comprehensive cell notes. |
| 🛡️ **Guaranteed 50-Daily Deliveries** | If an email bounces or fails syntax verification, the engine does **not** stop; it continues through the sheet until exactly 50 *successful* deliveries are completed. |
| 🔻 **Automatic Bounce Isolation** | Pushes all bounced or blocked leads directly to the bottom of the sheet, keeping the active list fresh and actionable. |
| ✨ **Auto-Generating Valid Contacts Sheet** | Progressively builds a dedicated `✨ Valid Contacts` sheet containing only verified, deliverable contacts as traversal proceeds daily. |
| ⏰ **Automated Daily Sending (No Intervention)** | Native time-driven triggers wake up SheetMerge automatically every day at your chosen hour (e.g., 09:00 AM) to send 50 emails and record metrics without opening your browser. |
| 🔄 **Multi-Account Alternation** | Supports alternating sending across 2 or more Google accounts (e.g. 50 from Account A, then 50 from Account B) via Apps Script multi-user sharing or FastAPI round-robin rotation. |
| 🧠 **Anti-Spam Humanization Engine** | Avoids campaign blast signatures by randomizing dispatch intervals (e.g. 15s ±35% jitter) and sending via genuine user Gmail drafts. |
| 🎨 **Responsive Executive UI** | Clean, non-AI influenced interface with an instant **Light / Dark Mode** toggle, clean typography, and customizable layout. |
| 🐍 **FastAPI High-Scale Backend** | Python FastAPI server handling multi-account rotation, open/click redirects, and permanent campaign history to prevent duplicate re-sends. |

---

## 📌 Daily Limit & Bounce Mechanics Explained

> **Does a bounced email count towards Google's daily sending limit?**
>
> 1. **From Gmail's Infrastructure Perspective:** When `GmailApp.sendEmail()` executes, Google accepts the message and counts 1 send against your daily account quota (500/day for free Gmail, 2,000/day for Workspace). The bounce notification (`MAILER-DAEMON`) arrives asynchronously minutes later.
> 2. **From SheetMerge's Campaign Perspective:** In SheetMerge v2, a bounced or invalid address is **not** counted as a successful send. The engine checks email syntax and historical suppression, pushes failed addresses to the end of the sheet, and continues until **50 verified successful deliveries** have been achieved for your daily batch.

---

## 🚀 Installation & Setup on Google Sheets

### Method 1: Clasp CLI (Fastest)

```bash
# 1. Clone repository
git clone https://github.com/vaibhav2616/Sheet-Merge.git
cd Sheet-Merge

# 2. Authenticate clasp
npx @google/clasp login

# 3. Push all files to your Google Sheet's Apps Script
npx @google/clasp push -f
```

---

### Method 2: Manual Browser Setup (No Node.js Required)

1. Open your Google Sheet (or create one at [sheets.new](https://sheets.new)).
2. In the top menu, go to **Extensions → Apps Script**.
3. In **Project Settings (⚙️)**, check **"Show "appsscript.json" manifest file in editor"**.
4. Replace `appsscript.json` with the repository's [`appsscript.json`](appsscript.json).
5. Add the files under `src/` as **Script** files:
   - `Code.js`, `Config.js`, `SheetManager.js`, `MailMerge.js`, `ContactManager.js`, `Automation.js`, `DashboardSheet.js`, `PositiveResponsesSheet.js`, `SidebarHelpers.js`, `Tracking.js`, `GmailDraftManager.js`.
6. Add the files under `html/` as **HTML** files:
   - `Sidebar.html`, `Dashboard.html`, `Settings.html`.
7. Reload your Google Sheet. The **`✉️ SheetMerge`** menu will appear!

---

## 🔄 Multi-Account Alternation Guide

### Workflow A: Google Sheets Native (Zero Server Setup)
1. Share your master Google Sheet with your secondary Google account (grant `Editor` access).
2. Open the sheet logged into **Account 1** → Menu: `✉️ SheetMerge > ⏰ Configure Automated Daily Sending` → Set trigger at **09:00 AM**.
3. Open the sheet logged into **Account 2** → Set trigger at **03:00 PM**.
4. Both accounts will sequentially pick up where the other left off, each sending 50 emails and color-coding the single `SheetMerge Status` column.

### Workflow B: Python FastAPI Multi-Account Rotation
1. Start the FastAPI backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
2. Register your sending accounts via API:
   ```bash
   curl -X POST http://localhost:8000/api/accounts -H "Content-Type: application/json" -d '{"email": "account1@gmail.com", "daily_quota": 50}'
   curl -X POST http://localhost:8000/api/accounts -H "Content-Type: application/json" -d '{"email": "account2@gmail.com", "daily_quota": 50}'
   ```
3. The backend tracks quotas and campaign history in SQLite to avoid re-contacting any lead.

---

## 📊 Single Status Color Coding Reference

| Status | Badge Background | Font Color | Meaning |
|---|---|---|---|
| **Sent** | `#dcfce7` (Soft Green) | `#166534` | Email successfully dispatched via Gmail |
| **Opened** | `#dbeafe` (Soft Blue) | `#1e40af` | Recipient opened email |
| **Clicked** | `#f3e8ff` (Soft Purple) | `#6b21a8` | Recipient clicked an embedded link |
| **Replied** | `#e0e7ff` (Soft Indigo) | `#3730a3` | Reply detected in Gmail inbox |
| **Positive Reply** | `#d1fae5` (Rich Emerald) | `#065f46` | High-intent interested reply detected |
| **Bounced** | `#fee2e2` (Soft Red) | `#991b1b` | Mail delivery subsystem bounce |
| **Blocked** | `#ffedd5` (Soft Orange) | `#9a3412` | Sending blocked / spam policy rejection |
| **Duplicate** | `#fef3c7` (Amber) | `#92400e` | Skipped because contact was already emailed |

*All extended metadata (Sent timestamp, Track ID, error messages, and sender account) is neatly stored in the cell's note so your sheet remains clean.*

---

## 📄 License

MIT License. Designed and maintained for open-source community use.
