#!/usr/bin/env pwsh
# create_github_issues.ps1
# Creates tracked GitHub issues for the SheetMerge project.
# Requires: GitHub CLI (gh) to be installed and authenticated.
# Usage: .\create_github_issues.ps1
# Each issue can then be resolved via a PR that references it with "Closes #N"

$REPO = "vaibhav2616/Sheet-Merge"

$issues = @(
    @{
        title  = "[BUG] checkEmailStatuses() crashes in automated time-driven triggers (UI context unavailable)"
        body   = @"
## Bug Description
``checkEmailStatuses()`` in ``src/MailMerge.js`` calls ``SpreadsheetApp.getUi().alert()`` unconditionally. When this function is invoked from a time-driven trigger (via ``dailyAutomatedMerge``), there is no UI context available and Apps Script throws an exception, halting the entire automation run.

## Root Cause
``SpreadsheetApp.getUi()`` is not available in headless / server-side contexts (time-driven triggers, ``onEdit``, etc.).

## Fix Required
Wrap the ``.alert()`` call in a ``try/catch`` so the function logs the result to ``Logger`` instead of crashing when there is no UI context.

## Labels: ``bug``, ``automation``, ``good first issue``
"@
        labels = "bug,automation,good first issue"
    },
    @{
        title  = "[BUG] record_send_event SQL INSERT missing account_id column — schema mismatch causes IntegrityError"
        body   = @"
## Bug Description
The ``INSERT OR REPLACE`` query in ``/api/history/record`` (``backend/main.py``) was missing the ``account_id`` column in its column list. The ``send_history`` table schema includes ``account_id``, but the INSERT statement only provided 6 values for 7 defined columns (excluding ``id``), causing implicit column mismatch and potential ``sqlite3.IntegrityError`` when ``account_email`` is supplied.

## Fix Required
Add ``account_id`` to the INSERT column list and resolve the account ID from ``accounts`` table before the insert.

## Labels: ``bug``, ``backend``
"@
        labels = "bug,backend"
    },
    @{
        title  = "[BUG] socket.setdefaulttimeout() mutates global state in domain_security.py and spam_analyzer.py"
        body   = @"
## Bug Description
Both ``domain_security.py`` and ``spam_analyzer.py`` call ``socket.setdefaulttimeout(N)`` without saving and restoring the original value. This permanently modifies the global socket timeout for the entire Python process, which can affect unrelated HTTP/SMTP connections running concurrently (e.g. FastAPI route handlers).

## Fix Required
Save the original timeout via ``socket.getdefaulttimeout()`` before setting it, then restore it in a ``finally`` block.

## Labels: ``bug``, ``backend``, ``concurrency``
"@
        labels = "bug,backend,concurrency"
    },
    @{
        title  = "[BUG] Code.js contains placeholder repo URLs (yourusername/sheetmerge) in showHelp()"
        body   = @"
## Bug Description
The ``showHelp()`` function in ``src/Code.js`` contains two links pointing to ``https://github.com/yourusername/sheetmerge`` (the placeholder from the project template). These are dead links that break the in-app help dialog for end users.

## Fix Required
Replace all occurrences of ``yourusername/sheetmerge`` with ``vaibhav2616/Sheet-Merge``.

## Labels: ``bug``, ``good first issue``, ``documentation``
"@
        labels = "bug,good first issue,documentation"
    },
    @{
        title  = "[BUG] smtp_relay.py imports unused asyncio module"
        body   = @"
## Bug Description
``backend/smtp_relay.py`` imports ``asyncio`` at line 13, but this module is never used anywhere in the file. The file uses synchronous ``smtplib`` exclusively. The dead import adds confusion and could mislead contributors into thinking async patterns are used.

## Fix Required
Remove ``import asyncio`` from ``smtp_relay.py``.

## Labels: ``bug``, ``cleanup``, ``good first issue``
"@
        labels = "bug,cleanup,good first issue"
    },
    @{
        title  = "[FEAT] Add per-account daily quota reset cron to backend"
        body   = @"
## Feature Request
The ``accounts`` table tracks ``sent_today`` but there is no mechanism to automatically reset it to ``0`` each day. This means the ``/api/accounts/next-active`` endpoint will eventually return ``available: False`` for all accounts and never recover without manual intervention.

## Proposed Implementation
Add a background task (APScheduler or a FastAPI startup background loop) that resets ``sent_today = 0`` for all accounts once per day at midnight UTC, and updates ``last_reset``.

## Labels: ``enhancement``, ``backend``
"@
        labels = "enhancement,backend"
    },
    @{
        title  = "[FEAT] Add pytest GitHub Actions CI workflow for backend tests"
        body   = @"
## Feature Request
The project now has a backend test suite (``backend/tests/test_smtp_relay.py``, ``test_spam_analyzer.py``, ``test_domain_security.py``, ``test_main_api.py``) but there is no CI workflow that runs these tests automatically on every push/PR.

## Proposed Implementation
Add a ``.github/workflows/backend-tests.yml`` GitHub Actions workflow that:
1. Installs Python 3.11+
2. Installs dependencies from ``backend/requirements.txt`` plus ``pytest httpx``
3. Runs ``pytest backend/tests/ -v``
4. Reports failures as PR checks

## Labels: ``enhancement``, ``ci``, ``good first issue``
"@
        labels = "enhancement,ci,good first issue"
    },
    @{
        title  = "[FEAT] Add Jest CI workflow for Apps Script unit tests"
        body   = @"
## Feature Request
Add a GitHub Actions workflow that runs ``npx jest tests/SheetMerge.test.js`` on every push and PR to the ``main`` branch. This ensures the pure-logic JS functions (template rendering, email validation, duplicate detection, tracking injection) stay correct as the codebase evolves.

## Proposed Implementation
Add ``.github/workflows/js-tests.yml`` that:
1. Uses ``node`` 20+
2. Runs ``npm install`` (installs Jest from ``package.json``)
3. Runs ``npm test``

## Labels: ``enhancement``, ``ci``, ``good first issue``
"@
        labels = "enhancement,ci,good first issue"
    },
    @{
        title  = "[FEAT] Standalone web app — public-facing hosted deployment (Phase 1 planning)"
        body   = @"
## Feature Request
The project is ready to move from a Google Sheets add-on toward a standalone public-facing web application that can be used without installing anything in Google Sheets.

## Scope
- FastAPI backend deployable to Vercel / Render / Railway (free tier)
- React or plain-HTML frontend with the same sidebar UI
- OAuth2 integration (Google Sign-in) to access Gmail drafts
- Hosted tracking pixel endpoint with persistent SQLite or Postgres
- Public URL that anyone can use

## Acceptance Criteria
- [ ] Backend deployed to a public URL
- [ ] Frontend accessible via browser (no Google Sheets required)
- [ ] Google OAuth flow working for Gmail draft access
- [ ] All existing features (bounce detection, quota management, multi-account) functional

## Labels: ``enhancement``, ``roadmap``
"@
        labels = "enhancement,roadmap"
    }
)

foreach ($issue in $issues) {
    Write-Host "Creating issue: $($issue.title)"
    gh issue create `
        --repo $REPO `
        --title $issue.title `
        --body $issue.body `
        --label $issue.labels 2>&1
    Start-Sleep -Seconds 1
}

Write-Host "`nDone. Visit https://github.com/$REPO/issues to see all issues."
