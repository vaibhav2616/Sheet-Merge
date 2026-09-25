#!/usr/bin/env pwsh
# create_github_issues.ps1
# Creates tracked GitHub issues for the SheetMerge project (Google Sheets Add-on).
# Requires: GitHub CLI (gh) to be installed and authenticated.
# Usage: .\create_github_issues.ps1

$REPO = "vaibhav2616/Sheet-Merge"

$issues = @(
    @{
        title  = "[FEAT] Support fallback tags in draft placeholders (e.g., {{First Name | friend}})"
        body   = @"
## Feature Request
When a recipient row has an empty contact column (such as ``First Name``), the greeting rendered currently results in an awkward blank space (e.g. ``Hi ,``).

## Proposed Implementation
Support fallback filter syntax like ``{{First Name | friend}}`` or ``{{Company | your team}}``. If the row value is empty or undefined, render the default fallback string.

## Labels: ``enhancement``, ``templates``, ``ux``
"@
        labels = "enhancement,templates,ux"
    },
    @{
        title  = "[FEAT] Multi-row in-dialog preview carousel before launch"
        body   = @"
## Feature Request
Users want to preview what their email will look like across multiple rows (e.g. rows 2, 3, 4) directly inside the modal dialog before launching.

## Proposed Implementation
Add a preview carousel in ``html/Dialog.html`` with Next/Previous row buttons that dynamically renders the subject and body for each contact row.

## Labels: ``enhancement``, ``ui``, ``preview``
"@
        labels = "enhancement,ui,preview"
    },
    @{
        title  = "[FEAT] Gmail alias sender selector (GmailApp.getAliases)"
        body   = @"
## Feature Request
Users with configured Google Workspace email aliases want to select which authorized email address to send from.

## Proposed Implementation
Use ``GmailApp.getAliases()`` to populate an alias dropdown selector in ``html/Dialog.html`` and pass the chosen ``from`` address in the ``GmailApp.sendEmail`` options.

## Labels: ``enhancement``, ``gmail``
"@
        labels = "enhancement,gmail"
    },
    @{
        title  = "[FEAT] Self-chaining time-based trigger for campaigns exceeding 4.5 minutes"
        body   = @"
## Feature Request
Google Apps Script terminates scripts after 6 minutes (360 seconds). For large contact lists with anti-spam jitter, campaigns can hit this limit.

## Proposed Implementation
Track elapsed execution time; when reaching 270 seconds (4.5 minutes), save state to ``PropertiesService``, schedule a self-chaining time-based trigger with ``ScriptApp.newTrigger()``, and exit cleanly to resume seamlessly.

## Labels: ``enhancement``, ``deliverability``, ``automation``
"@
        labels = "enhancement,deliverability,automation"
    },
    @{
        title  = "[FEAT] Support CC and BCC recipient columns"
        body   = @"
## Feature Request
Users need the ability to include CC and BCC recipients on a per-contact basis.

## Proposed Implementation
Detect optional ``Cc`` and ``Bcc`` header columns from the active sheet and pass them into ``GmailApp.sendEmail`` options.

## Labels: ``enhancement``, ``sheets``
"@
        labels = "enhancement,sheets"
    },
    @{
        title  = "[FEAT] 1-click unsubscribe link & automatic suppression list"
        body   = @"
## Feature Request
To ensure high email deliverability and compliance with modern mail guidelines, campaigns should support an automated unsubscribe link.

## Proposed Implementation
Provide an optional ``{{Unsubscribe}}`` placeholder that appends an unsubscribe link, and log opt-outs to an internal suppression tab to skip those contacts in future merges.

## Labels: ``enhancement``, ``deliverability``, ``compliance``
"@
        labels = "enhancement,deliverability,compliance"
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
