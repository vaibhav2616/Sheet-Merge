<p align="center">
  <img src="https://img.shields.io/badge/Platform-Google%20Sheets-brightgreen?logo=googlesheets&style=for-the-badge" alt="Google Sheets">
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&style=for-the-badge" alt="FastAPI">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT">
  <img src="https://img.shields.io/badge/PRs-Welcome-blueviolet?style=for-the-badge" alt="PRs Welcome">
</p>

<h1 align="center">✉️ SheetMerge</h1>
<p align="center"><strong>Enterprise-grade, 100% open-source Mail Merge for Google Sheets — with Gmail Draft templates, In-Sheet Visual Analytics, and Positive Lead Intelligence</strong></p>
<p align="center">
  Like <em>Yet Another Mail Merge (YAMM)</em>, but completely free, privacy-first, and powered by open-source technology.
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📝 **Use Gmail Drafts Directly** | Select any prepared Gmail Draft as your template. Automatically preserves rich text, custom fonts, inline graphics, signatures, tables, attachments, and `{{ColumnName}}` merge tags. |
| 📊 **In-Sheet Visual Dashboard** | Generates a dedicated `📊 SheetMerge Dashboard` tab with 3 large native Google Sheets charts (Delivery Breakdown, Engagement Funnel, Sentiment Quality), live formulas, and strategic inference benchmarks. |
| 🎯 **Positive Responses Sheet** | Synchronizes all positive replies and interested prospects into a dedicated `🎯 Positive Responses` sheet with complete contact data and response intelligence. |
| 📋 **Smart Queue Reordering** | One-click action to move email addresses that can be contacted to the last of the list, keeping processed leads grouped at the top so you can clearly anchor where your next batch begins. |
| 🔁 **Duplicate Suppression** | Scans and skips duplicate email addresses across your sheet automatically. |
| ⏭ **Precise Row Resume** | Pick any starting row or auto-resume from where your previous batch finished. |
| 👁 **Zero-Third-Party Tracking** | 1×1 invisible open tracking and click redirection via your own Google Apps Script Web App or local FastAPI backend. |
| ↩️ **Inbound Sentiment & Bounce Poller** | Detects bounces from `MAILER-DAEMON` and flags positive replies containing high-intent keywords. |
| 📬 **50-Email Batch Safety** | Built for 50 emails/day per account to protect sender reputation on free Gmail accounts, with full multi-account export/import support. |
| 🎨 **Dark Glassmorphism UI** | Modern, responsive sidebar with instant live preview, draft tag validation, and one-click actions. |

---

## 🚀 How To Use SheetMerge on Google Sheets

Follow either **Method 1 (Fastest via Clasp CLI)** or **Method 2 (No Coding / Copy-Paste in Browser)**.

---

### Method 1: Automated Setup via `clasp` (Recommended)

Requires Node.js (18+) installed on your computer.

```bash
# 1. Clone this repository
git clone https://github.com/vaibhav2616/Sheet-Merge.git
cd Sheet-Merge

# 2. Install Google clasp globally
npm install -g @google/clasp

# 3. Enable the Google Apps Script API (one-time requirement)
# Visit https://script.google.com/home/usersettings and toggle "Google Apps Script API" to ON.

# 4. Authenticate with your Google account
clasp login

# 5. Link to your Google Sheet:
# Option A - Create a brand new Google Sheet:
clasp create --title "SheetMerge Campaign" --type sheets

# Option B - Link to an existing Google Sheet:
# In your sheet, click Extensions > Apps Script > Project Settings (⚙️) > copy Script ID.
# Create a .clasp.json file:
# {"scriptId": "PASTE_YOUR_SCRIPT_ID_HERE", "rootDir": "."}

# 6. Push all files to Google Apps Script
clasp push
```

Reload your Google Sheet. The **`✉️ SheetMerge`** menu is now live!

---

### Method 2: Manual Setup (No CLI / No Node.js Required)

If you don't have Node.js, you can install SheetMerge directly inside your browser in 2 minutes:

1. **Open your Google Sheet** (or create a new one at [sheets.new](https://sheets.new)).
2. In the top menu, click **Extensions → Apps Script**.
3. **Configure Project Settings**:
   * Click **Project Settings (⚙️)** in the left sidebar.
   * Check the box: **"Show "appsscript.json" manifest file in editor"**.
4. **Copy the Manifest**:
   * In the file list on the left, click **`appsscript.json`**.
   * Replace its entire content with the [`appsscript.json`](appsscript.json) from this repository.
5. **Add Script Files (`src/`)**:
   * Click the **+** button next to Files → choose **Script**.
   * Create the following script files and paste their respective code from this repository:
     * `Code` → [src/Code.js](src/Code.js)
     * `Config` → [src/Config.js](src/Config.js)
     * `SheetManager` → [src/SheetManager.js](src/SheetManager.js)
     * `MailMerge` → [src/MailMerge.js](src/MailMerge.js)
     * `GmailDraftManager` → [src/GmailDraftManager.js](src/GmailDraftManager.js)
     * `ContactManager` → [src/ContactManager.js](src/ContactManager.js)
     * `DashboardSheet` → [src/DashboardSheet.js](src/DashboardSheet.js)
     * `PositiveResponsesSheet` → [src/PositiveResponsesSheet.js](src/PositiveResponsesSheet.js)
     * `SidebarHelpers` → [src/SidebarHelpers.js](src/SidebarHelpers.js)
     * `Tracking` → [src/Tracking.js](src/Tracking.js)
6. **Add HTML Files (`html/`)**:
   * Click the **+** button next to Files → choose **HTML**.
   * Create the following HTML files and paste their code:
     * `Sidebar` → [html/Sidebar.html](html/Sidebar.html)
     * `Dashboard` → [html/Dashboard.html](html/Dashboard.html)
     * `Settings` → [html/Settings.html](html/Settings.html)
7. Click the **Save project (💾)** icon (or press Ctrl+S).
8. **Reload your Google Sheet tab** in your browser.
9. You will see the new menu: **`✉️ SheetMerge`**!

---

## 📖 Step-by-Step Usage Guide

### 1. Prepare Your Contact List
Make sure Row 1 of your sheet contains descriptive column headers:

| First Name | Last Name | Email | Company | Role |
|------------|-----------|-------|---------|------|
| Sarah | Connor | sarah@example.com | Cyberdyne | Founder |
| John | Miller | john@example.com | TechCorp | VP Engineering |

*(You can include any custom columns you like — they all become usable merge tags!)*

---

### 2. Prepare Your Gmail Draft
1. Open **Gmail** and click **Compose**.
2. Write your email with your preferred formatting, custom fonts, links, bullet points, signatures, and attachments.
3. Use merge tags matching your sheet headers enclosed in double curly braces:
   * **Subject**: `Quick question regarding {{Company}}, {{First Name}}`
   * **Body**: `Hi {{First Name}}, I noticed your work leading engineering at {{Company}}...`
4. Leave the email in your **Drafts** folder (do not send it).

---

### 3. Launch the SheetMerge Sidebar
1. In your Google Sheet, click **`✉️ SheetMerge → 📧 Open Mail Merge Sidebar`**.
2. *(First run only)* Google will show an authorization prompt:
   * Click **Continue** → choose your Google account.
   * Click **Advanced** (bottom left) → click **Go to SheetMerge (unsafe)** → click **Allow**.
3. In the sidebar:
   * Under **Template Source**, select **"✉️ Gmail Draft (Recommended)"**.
   * Pick your draft from the dropdown. SheetMerge automatically displays detected merge tags, verified against your sheet headers in green chips.
   * Switch to the **Preview** tab to see your rendered email with actual row data.

---

### 4. Send or Test in Batches
* **Email Column**: Select your sheet's email column (e.g. `Email`).
* **Batch Range**:
  * For a safe initial test: Start row `2`, End row `6` (sends exactly 5 emails).
  * For full list: Leave End row as `0` (sends all up to your daily safety limit).
* **Execution Options**:
  * **`📧 Start Mail Merge Now`**: Delivers personalized emails immediately via Gmail.
  * **`📝 Create Personalized Drafts in Gmail`**: Creates individual rendered drafts in your Gmail Drafts folder so you can review before sending.

---

### 5. In-Sheet Visual Analytics & Strategic Inferences
Click **`✉️ SheetMerge → 📊 Create / Refresh Visual Dashboard Sheet`** (or open via Sidebar).
A dedicated tab **`📊 SheetMerge Dashboard`** will be generated containing:
* **Live KPI Scorecards**: Total Audience, Delivered, Unique Opens, Link Clicks, Positive Leads, Bounces (powered by live `=COUNTIF` formulas).
* **3 Large Embedded Native Charts**:
  * 🍩 **Delivery Breakdown**: Sent vs Pending vs Duplicates vs Failed vs Skipped.
  * 📊 **Campaign Engagement Funnel**: Total Audience → Delivered → Opened → Clicked → Positive Replies.
  * 🎯 **Inbound Sentiment & Deliverability Quality**: Positive conversion ratio vs bounces/blocks.
* **Strategic Inference & Anchoring Guide**: Evaluates campaign performance against industry benchmarks (21.5% Open Rate, 2.8% CTR, <2% Bounce) and provides actionable advice.

---

### 6. Organize Your Queue & Isolate Positive Leads
* **Move Contactable Leads to Bottom**: Click **`✉️ SheetMerge → 📋 Move Contactable Leads to Bottom`**. Keeps all finished rows at the top and moves uncontacted leads to the bottom, providing a clear starting row anchor for your next batch.
* **Positive Inbound Leads Sync**: When prospects reply, click **`✉️ SheetMerge → 🔄 Refresh Email Statuses`**. Positive replies automatically sync to the dedicated **`🎯 Positive Responses`** tab with all original contact data and timestamps. You can also select any row in the spreadsheet and click **`⭐ Mark Selected Row as Positive Response`**.

---

### 7. Multi-Account Scaling (50 Emails/Day Limit)
To protect your domain and avoid Google's spam filters on free Gmail accounts:
1. Send up to 50 emails from Account 1.
2. In the sheet menu, click **`✉️ SheetMerge → 📥 Export Config (JSON)`** and copy your settings.
3. Switch to your secondary Google account and open the shared spreadsheet.
4. Click **`✉️ SheetMerge → 📤 Import Config (JSON)`** and paste the settings.
5. In the sidebar, set the **Start row** to resume where the first account finished.

---

## 📋 Status Columns Reference

SheetMerge adds standard status columns to your data sheet:

| Column | Description |
|--------|-------------|
| `MM_Status` | `Sent`, `Pending`, `Duplicate`, `Failed`, `Skipped` |
| `MM_SentAt` | ISO timestamp of delivery |
| `MM_TrackId` | Unique cryptographic identifier for open & click events |
| `MM_Opened` | `TRUE` when tracking pixel is loaded |
| `MM_Clicked` | `TRUE` when any link in the email is clicked |
| `MM_Replied` | `TRUE` when an inbound reply thread is detected |
| `MM_Positive` | `TRUE` when positive intent/interest is identified |
| `MM_Bounced` | `TRUE` if `MAILER-DAEMON` delivery failure occurred |
| `MM_Blocked` | `TRUE` if blocked by recipient server |
| `MM_Error` | Error details if delivery was unsuccessful |

---

## 🔒 Privacy & Open-Source Security

- **No Third-Party Access**: No telemetry, analytics, or contact emails are ever sent to external companies.
- **Direct Google API Execution**: All sending occurs directly within your authenticated Google session.
- **Local Fallback**: Works 100% inside Google Apps Script, with an optional Python backend for advanced local SQLite caching.

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

<p align="center">Maintained with ❤️ by <a href="https://github.com/vaibhav2616">vaibhav2616</a></p>
