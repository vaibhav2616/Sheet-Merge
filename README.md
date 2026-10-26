<p align="center">
  <img src="https://img.shields.io/badge/Version-v2.2.0-blue?style=for-the-badge" alt="v2.2.0">
  <img src="https://img.shields.io/badge/Platform-Google%20Sheets%20Add--on-brightgreen?logo=googlesheets&style=for-the-badge" alt="Google Sheets Add-on">
  <img src="https://img.shields.io/badge/UX-YAMM%20Inspired%20Dynamic%20UI-indigo?style=for-the-badge" alt="YAMM Inspired Dynamic UI">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT">
</p>

<h1 align="center">✉️ SheetMerge (v2.2)</h1>
<p align="center"><strong>The Simplistic, Responsive, Animation-Rich Mail Merge for Google Sheets</strong></p>
<p align="center">
  <em>Featuring an instantaneous <strong>Emergency Stop Switch</strong>, YAMM-inspired dynamic non-stacked modal dialog & sidebar, 1-click Test Email to your inbox, single <strong>Merge Status</strong> column, and human anti-spam deliverability jitter.</em>
</p>

---

## 🚀 Why SheetMerge? (Customer-First YAMM Architecture)

Most legacy mail merge tools either overwhelm users with tall, stacked forms of confusing toggles or lock users out of stopping an ongoing campaign. SheetMerge v2.2 solves this:

1. **Instantaneous Emergency Stop Switch**:
   - Running inside Google Sheets? Click the pulsating red **"🛑 Stop Mail Merge"** button or select **"🛑 Stop In-Progress Mail Merge"** from the spreadsheet menu at any point.
   - SheetMerge checks for stop signals every 400ms during sending intervals, halting immediately without corrupting your data or quota.

2. **Non-Stacked, Dynamic & Responsive UI**:
   - No clunky, overwhelming forms stacked vertically.
   - Stage-based flow: **Select Gmail Draft & Audience → Live Animated Dispatch HUD → Completion Celebration**.
   - Available both as a spacious **Modal Dialog** (`showDialog()`, 680×620px) and a sleek docked **Sidebar** (`showSidebar()`).

3. **1-Click Test Email to My Inbox**:
   - Preview your email draft populated with row 2's contact data sent directly to your own Gmail inbox in seconds before launching your full campaign.

4. **Single Unified `Merge Status` Column**:
   - 100% compatible with YAMM status tokens (`EMAIL_SENT`, `EMAIL_OPENED`, `EMAIL_BOUNCED`, `EMAIL_CLICKED`, `EMAIL_RESPONDED`).
   - Clean, color-coded status badges with timestamps and tracking metadata in cell notes.

---

## 🎨 Visual Interface & Workflow Showcase

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ✉️ SheetMerge Mail Merge                         [● 100 sends left]  [🌙/☀️] │
├─────────────────────────────────────────────────────────────────────────────┤
│ [🚀 Start Merge]         [⏰ Daily 50 Auto]         [📊 Insights]           │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─ 1. SELECT GMAIL DRAFT ─────────────────────────────────────────────────┐ │
│ │  Draft: [ Q4 Product Announcement (with tags)                       ▼ ] │ │
│ │  Detected Tags: [ {{First Name}} ✓ ] [ {{Company}} ✓ ]                  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ 2. AUDIENCE & SENDER CONFIGURATION ────────────────────────────────────┐ │
│ │  Email Column: [ Email ▼ ]          Sender Name: [ John Doe           ] │ │
│ │  Batch Limit:  [ 50    ]          Start Row:   [ 2                  ] │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ 3. DELIVERABILITY SAFEGUARDS ──────────────────────────────────────────┐ │
│ │  [✔] Human Timing Jitter (15s ± 35%) — Prevents spam filters            │ │
│ │  [✔] Auto-Clean Bounced & Blocked Leads to Bottom                       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│   [ ✉️ Send Test Email to Me ]       [ 🚀 Send 50 Emails Now (Primary) ]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### During Merge: Live Animated Dispatch HUD
```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ LIVE DISPATCH IN PROGRESS                                │
│                                                             │
│                ╭───────────────╮                            │
│               │     58%       │  <- Animated SVG            │
│               │   29 / 50     │     Circular Gauge          │
│                ╰───────────────╯                            │
│                                                             │
│   [ Delivered: 29 ]   [ Remaining: 21 ]   [ Failed: 0 ]     │
│                                                             │
│   ● Dispatching to: sarah.williams@domain.com (Row 30)...   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ 🛑 STOP MAIL MERGE (Emergency Interrupt Switch)     │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---
## 🛠️ How It Works (3 Simplistic Steps)

1. **Write your draft in Gmail**:
   - Compose a regular draft in Gmail.
   - Use standard placeholders like `Hi {{First Name}}, how is everything at {{Company}}?`.
2. **Launch SheetMerge**:
   - In your Google Sheet, click **✉️ SheetMerge → 🚀 Start Mail Merge (Modal Dialog)** or **📑 Open Mail Merge (Sidebar)**.
   - Pick your draft from the dropdown. SheetMerge automatically parses and verifies your tags against your sheet headers.
3. **Verify & Send**:
   - Click **✉️ Send Test Email to Me** to verify formatting in your own Gmail inbox.
   - Click **🚀 Send Emails Now**. Watch the live animated circular progress ring deliver at a human-like pace.
   - Need to stop? Click **🛑 Stop Mail Merge** at any second!

---

## 🛑 The Stop Switch Mechanism (`stopSheetMerge`)

SheetMerge features a resilient multi-tier stop protocol:
- **Client UI Trigger**: The user clicks `🛑 Stop Mail Merge`.
- **Spreadsheet Menu Trigger**: The user selects `✉️ SheetMerge → 🛑 Stop In-Progress Mail Merge`.
- **Engine Execution**: Sets `SHEETMERGE_STOP_REQUESTED = 'true'` in `PropertiesService.getUserProperties()` and `CacheService.getUserCache()`.
- **Interruptible Jitter**: `sleepWithStopCheck(totalMs)` checks the flag every 400ms, ensuring that even during a 20-second anti-spam delay, the engine halts almost immediately and toasts the sheet with the final sent tally.

---

## 📁 Repository Structure

```
├── src/
│   ├── Code.js                   # Add-on entry point, menu setup, dialog & stop launchers
│   ├── MailMerge.js              # Core dispatch engine with stop switch & test email
│   ├── GmailDraftManager.js      # Gmail draft fetching & placeholder tag extraction
│   ├── SheetManager.js           # Single 'Merge Status' column manager & contact reader
│   ├── Automation.js             # Automated daily time-driven triggers (9 AM batch)
│   ├── ContactManager.js         # Lead cleaner & bounce sorter
│   ├── DashboardSheet.js         # In-sheet visual dashboard tab generator
│   ├── PositiveResponsesSheet.js # Positive reply synchronization
│   ├── Config.js                 # Persistent user preferences & state
│   ├── SidebarHelpers.js         # Server-side bridges for UI
│   └── Tracking.js               # Open & click tracking utilities
├── html/
│   ├── Dialog.html               # YAMM-style modal dialog (dynamic, responsive, animation-rich)
│   ├── Sidebar.html              # Responsive docked sidebar with live HUD & stop switch
│   ├── Dashboard.html            # Standalone visual metrics dialog
│   └── Settings.html             # Multi-account configuration dialog
├── appsscript.json               # Google Apps Script manifest
└── package.json                  # Clean NPM manifest (tests dropped)
```

---

## 📄 License

MIT License. Open-source and free for individual, commercial, and enterprise use.
