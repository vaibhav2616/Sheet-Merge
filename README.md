<p align="center">
  <img src="https://img.shields.io/badge/Version-v2.1.0-blue?style=for-the-badge" alt="v2.1.0">
  <img src="https://img.shields.io/badge/Tests-85%2F85%20Passing-brightgreen?logo=pytest&style=for-the-badge" alt="85/85 Tests Passing">
  <img src="https://img.shields.io/badge/Platform-Google%20Sheets%20%7C%20Standalone%20Web-brightgreen?logo=googlesheets&style=for-the-badge" alt="Google Sheets and Web">
  <img src="https://img.shields.io/badge/Backend-FastAPI%20%2B%20Docker-009688?logo=fastapi&style=for-the-badge" alt="FastAPI + Docker">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT">
</p>

<h1 align="center">✉️ SheetMerge (v2.1)</h1>
<p align="center"><strong>The Modern, Spam-Resistant Mail Merge Suite — Dual Platform: Google Sheets Add-on & Standalone Web Application</strong></p>
<p align="center">
  <em>Featuring a single, YAMM-compatible <strong>Merge Status</strong> column, automatic multi-column consolidation, guaranteed 50 valid daily deliveries, native light/dark UI, 5xx permanent bounce suppression, and enterprise SPF/DKIM/DMARC deliverability guard.</em>
</p>

---

## 🎨 Visual UI Architecture & Feature Showcase

### 1. Standalone Web Application Interface (`/`)
Run locally or deploy to the cloud. Upload CSVs, customize templates with live recipient preview, run pre-flight anti-spam audits, and track live transmission events in real time:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ ✉️ SheetMerge Enterprise   [📁 Contacts]  [✍️ Template]  [🛡️ Deliverability]  [🚀 Dispatch]   │ [☀️ Light] │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 📁 Contacts & Unified Status Grid (Single 'Merge Status' Column)                           │
│                                                                                             │
│  [📄 Drop recipient CSV here or browse (auto-maps headers)]                                │
│                                                                                             │
│  RECORDS: 5 contacts loaded                          [📥 Export Enriched CSV with Status]    │
│  ┌───┬──────────────────────────┬──────────────┬──────────────────┬───────────────────────┐ │
│  │ # │ Recipient Email          │ Name         │ Company          │ Merge Status          │ │
│  ├───┼──────────────────────────┼──────────────┼──────────────────┼───────────────────────┤ │
│  │ 1 │ alex.rivera@acme.corp    │ Alex Rivera  │ Acme Corp        │ [ Sent ]              │ │
│  │ 2 │ sarah.c@cloudscale.io    │ Sarah Chen   │ CloudScale       │ [ Opened ]            │ │
│  │ 3 │ marcus.t@nexusfin.com    │ Marcus T.    │ Nexus Financial  │ [ Positive Reply ]    │ │
│  │ 4 │ fake-user@dead-dom.org   │ Test User    │ Test Co          │ [ Bounced ]           │ │
│  │ 5 │ elena.b@horizontech.ai   │ Elena Brooks │ HorizonTech      │ [ Pending ]           │ │
│  └───┴──────────────────────────┴──────────────┴──────────────────┴───────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🛡️ Pre-Flight Deliverability Guard               👁️ Live Dynamic Recipient Preview           │
│                                                                                             │
│  DELIVERABILITY SCORE: 95 / 100 [SAFE / INBOX]   To: alex.rivera@acme.corp                  │
│  ██████████████████████████████████░░░░ 95%      Subject: Quick idea for Acme Corp          │
│                                                                                             │
│  ✔ SPF: Valid include:_spf.google.com ~all       "Hi Alex, I came across your team at       │
│  ✔ DMARC: Policy p=reject (Strict quarantine)     Acme Corp and was impressed by your       │
│  ✔ Spam Trigger Word Check: 0 flags detected      recent growth initiatives..."             │
│  ✔ Socket Timeout: 30s configured                [⚡ Launch 50-Quota Campaign]             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Google Sheets Sidebar UI (Responsive Executive Theme with Light/Dark Mode)
Embedded directly in Google Sheets via `✉️ SheetMerge > 📧 Open Mail Merge Sidebar (v2)`:

```
┌───────────────────────────────────────┐
│ ✉️ SheetMerge v2.1        [🌙 / ☀️]   │
├───────────────────────────────────────┤
│ 🎯 CAMPAIGN STATUS                    │
│ Target: 50 Valid Sends / Day          │
│ Pacing: 15s (±35% Randomized Jitter)  │
│                                       │
│ 📝 GMAIL DRAFT SELECTION              │
│ [ Q4 Outreach Strategy Draft     ▼ ]  │
│                                       │
│ 👥 RECIPIENT COLUMN MAPPING           │
│ Email Column: [ Email             ▼ ] │
│ Name Column:  [ First Name        ▼ ] │
│                                       │
│ 🛡️ DELIVERABILITY & AUTOMATION        │
│ [✔] 5xx Hard Bounce Suppression       │
│ [✔] Multi-Account Daily Alternation   │
│ [✔] Auto-Sort Bounces to Bottom       │
│ [✔] Auto-Sync Positive Replies Sheet  │
│                                       │
│ [ ⚡ Run Daily Batch (50 Sends)   ]   │
│ [ ⏰ Configure Scheduled Trigger   ]   │
│ [ 🗂️ Consolidate to Merge Status ]   │
└───────────────────────────────────────┘
```

---

## ⚡ Core Upgrades in v2.1

| Feature | Description |
|---|---|
| 🎯 **Single YAMM-Compatible Column** | Uses exactly one **`Merge Status`** column. Recognizes legacy YAMM tokens (`EMAIL_SENT`, `EMAIL_OPENED`, `EMAIL_CLICKED`, `EMAIL_RESPONDED`, `EMAIL_BOUNCED`) and modern badges (`Sent`, `Opened`, `Positive Reply`, `Bounced`). |
| 🗂️ **Automatic Column Consolidation** | Automatically identifies separated legacy columns (`Email Status`, `Bounce Status`, `Reply Status`, `Click Status`, `Track ID`, `MM_*`) and collapses them into `Merge Status`, safely deleting redundant columns. |
| 🛡️ **Guaranteed 50 Valid Daily Sends** | Syntax errors and bounces do not deplete your campaign quota; SheetMerge continues through the sheet until exactly 50 *successful* deliveries are completed. |
| 🛑 **5xx Permanent Hard Bounce Catch** | Catches `550 5.4.1` permanent bounces, records them in the local SQLite suppression list, and immediately halts subsequent retries to preserve domain reputation. |
| 🌐 **Dual Platform: Web App + Sheets** | Use as an Apps Script add-on inside Google Sheets or run as a standalone web application anywhere with zero Google account lock-in. |
| 🔐 **DNS & Anti-Spam Security Suite** | Live SPF, DKIM, and DMARC verification endpoint (`/api/security/check-domain`) and 45+ rule content spam keyword scanner (`/api/security/analyze-content`). |
| ⏰ **Hands-Free Daily Automation** | Native Apps Script time triggers fire every morning (e.g. 09:00 AM) to send 50 emails and sync statuses without opening a browser. |
| 🧪 **85 Automated Unit & Integration Tests** | 100% test pass rate across Jest (37 JS tests) and Pytest (48 Python integration tests). |

---

## 📊 Single "Merge Status" Column Reference

SheetMerge formats the unified column with high-contrast, professional badges:

| Status Badge | Color Styling | Meaning & Lifecycle |
|---|---|---|
| **Sent** (`EMAIL_SENT`) | `#dcfce7` (Soft Green) | Message delivered via Gmail API or SMTP relay |
| **Opened** (`EMAIL_OPENED`) | `#dbeafe` (Soft Blue) | Recipient rendered transparent tracking pixel |
| **Clicked** (`EMAIL_CLICKED`) | `#f3e8ff` (Soft Purple) | Recipient clicked an embedded tracked link |
| **Replied** (`EMAIL_REPLIED`) | `#e0e7ff` (Soft Indigo) | Inbound reply detected in sender inbox |
| **Positive Reply** | `#d1fae5` (Emerald) | AI/keyword-matched high-intent reply ("interested", "demo", "call") |
| **Bounced** (`EMAIL_BOUNCED`) | `#fee2e2` (Soft Red) | Permanent 5xx hard bounce or delivery failure |
| **Blocked** (`EMAIL_BLOCKED`) | `#ffedd5` (Soft Orange) | Gateway spam block or domain policy rejection |
| **Duplicate** | `#fef3c7` (Amber) | Address appeared multiple times; duplicate skipped |
| **Pending** | `#f8fafc` (Neutral) | Scheduled for upcoming daily batch |

> **Cell Note Metadata:** All extended metadata (exact ISO timestamps, track IDs, sender account email, and bounce error descriptions) are stored inside the cell's **Note**, keeping your sheet clean and export-ready.

---

## 🚀 Getting Started

### Option A: Standalone Web Application (Docker or Local)

The standalone edition runs on FastAPI and serves the responsive single-page web app at `/`:

```bash
# 1. Clone repository
git clone https://github.com/vaibhav2616/Sheet-Merge.git
cd Sheet-Merge

# 2. Run with Docker (Fastest)
docker build -t sheetmerge .
docker run -p 8000:8000 sheetmerge

# Or run locally with Python:
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Open **`http://localhost:8000`** in your browser to access the application!

---

### Option B: Google Sheets Add-on Setup

#### Method 1: Clasp CLI (Recommended)
```bash
git clone https://github.com/vaibhav2616/Sheet-Merge.git
cd Sheet-Merge
npx @google/clasp login
npx @google/clasp push -f
```

#### Method 2: Manual Browser Setup
1. Open your Google Sheet (or create one at [sheets.new](https://sheets.new)).
2. Navigate to **Extensions → Apps Script**.
3. In **Project Settings (⚙️)**, check **"Show 'appsscript.json' manifest file in editor"**.
4. Replace `appsscript.json` with the repository's [`appsscript.json`](appsscript.json).
5. Copy files from `src/*.js` as Script files and `html/*.html` as HTML files.
6. Refresh your Google Sheet — the **`✉️ SheetMerge`** menu will appear!

---

## 🧪 Testing Suite (85 Virtual Scenario Tests)

Every component is validated through virtual scenario test suites covering template rendering, email syntax, track ID generation, YAMM status normalization, SMTP dispatch, socket timeout leaks, DNS resolution, and REST endpoints:

```bash
# Run JavaScript logic tests (Jest: 37 tests)
npm test

# Run Python backend integration tests (Pytest: 48 tests)
python -m pytest backend/tests -v
```

---

## 📄 License
MIT License. Open-source and free for individual, commercial, and enterprise use.
