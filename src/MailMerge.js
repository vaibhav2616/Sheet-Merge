/**
 * MailMerge.js — Core mail merge sending logic
 * =============================================
 * Orchestrates: template rendering, duplicate detection, Gmail sending,
 * tracking injection, progress tracking, and rate limiting.
 */

/* ── Template engine ──────────────────────────────────────────── */

/**
 * Replaces {{ColumnName}} placeholders in a template string with row data.
 * Case-insensitive matching.
 *
 * @param {string} template   Subject or body with {{placeholders}}
 * @param {Object} rowData    { ColumnName: value, … }
 * @return {string}
 */
function renderTemplate(template, rowData) {
  return template.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
    var trimmed = key.trim();
    // Case-insensitive lookup
    var match = Object.keys(rowData).find(function(k) {
      return k.toLowerCase() === trimmed.toLowerCase();
    });
    return match !== undefined ? String(rowData[match]) : '';
  });
}

/* ── Tracking injection ───────────────────────────────────────── */

/**
 * Injects an invisible 1×1 tracking pixel into an HTML email body.
 * If no tracking backend is configured, returns body unchanged.
 *
 * @param {string} body          HTML body
 * @param {string} trackId       Unique tracking ID for this send
 * @param {string} backendUrl    http://localhost:8000
 * @return {string}
 */
function injectTrackingPixel(body, trackId, backendUrl) {
  if (!backendUrl) return body;
  var pixelUrl = backendUrl.replace(/\/$/, '') + '/track/open/' + encodeURIComponent(trackId);
  var pixel = '<img src="' + pixelUrl + '" width="1" height="1" alt="" style="display:none" />';
  // Insert just before </body> if present, otherwise append
  if (body.toLowerCase().indexOf('</body>') !== -1) {
    return body.replace(/<\/body>/i, pixel + '</body>');
  }
  return body + pixel;
}

/**
 * Wraps all <a href="…"> links in an HTML body with click-tracking redirects.
 *
 * @param {string} body
 * @param {string} trackId
 * @param {string} backendUrl
 * @return {string}
 */
function injectClickTracking(body, trackId, backendUrl) {
  if (!backendUrl) return body;
  var base = backendUrl.replace(/\/$/, '') + '/track/click/' + encodeURIComponent(trackId) + '?url=';
  return body.replace(/href="(https?:\/\/[^"]+)"/gi, function(_, url) {
    return 'href="' + base + encodeURIComponent(url) + '"';
  });
}

/* ── Sending ──────────────────────────────────────────────────── */

/**
 * Main entry point called from the sidebar UI.
 * Accepts a config object passed from the client (avoids re-reading props).
 *
 * @param {Object} params
 * @param {number} params.startRow           1-indexed data row to start from
 * @param {number} params.endRow             1-indexed data row to end at (0 = all)
 * @param {string} params.emailColumn        Header name of the email column
 * @param {string} params.subjectTemplate
 * @param {string} params.bodyTemplate
 * @param {string} params.senderName
 * @param {string} params.replyToEmail
 * @param {string} params.trackingBackendUrl
 * @param {boolean} params.enableOpenTracking
 * @param {boolean} params.enableClickTracking
 * @param {number} params.sendDelay          Seconds between emails
 * @param {number} params.dailyLimit
 * @return {Object}  { sent, failed, skipped, duplicate, errors: [] }
 */
function runMailMerge(params) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 10-second timeout to prevent concurrent runs
  } catch (e) {
    throw new Error('Another mail merge is already running. Please wait.');
  }

  try {
    return _doMailMerge(params);
  } finally {
    lock.releaseLock();
  }
}

function _doMailMerge(params) {
  var sheet  = getDataSheet();
  var colMap = ensureStatusColumns(sheet);

  var startRow  = Math.max(2, params.startRow  || 2);
  var endRow    = params.endRow || 0;           // 0 means "all rows"
  var emailCol  = params.emailColumn || 'Email';
  var limit     = params.dailyLimit  || 50;
  var delay     = (params.sendDelay  || 2) * 1000; // ms

  var result = { sent: 0, failed: 0, skipped: 0, duplicate: 0, errors: [] };

  // Load Gmail Draft if draftId specified
  var draftAttachments = [];
  if (params.draftId) {
    try {
      var draft = GmailApp.getDraft(params.draftId);
      if (draft) {
        var draftMsg = draft.getMessage();
        draftAttachments = draftMsg.getAttachments() || [];
        if (!params.subjectTemplate) {
          params.subjectTemplate = draftMsg.getSubject();
        }
        if (!params.bodyTemplate) {
          params.bodyTemplate = draftMsg.getBody(); // rich formatted HTML
        }
      }
    } catch (e) {
      Logger.log('Could not load draft ' + params.draftId + ': ' + e.message);
    }
  }

  // Build set of already-sent emails to detect duplicates
  var sentSet = buildSentEmailSet(sheet, colMap, emailCol);

  var allRows = getDataRows(sheet, startRow);

  // Optionally restrict to endRow
  if (endRow > 0) {
    allRows = allRows.filter(function(r) { return r.rowIndex <= endRow; });
  }

  var sentCount = 0;

  for (var i = 0; i < allRows.length; i++) {
    if (sentCount >= limit) {
      // Mark remaining as skipped
      allRows.slice(i).forEach(function(r) {
        writeRowStatus(sheet, r.rowIndex, colMap, {
          [COL.STATUS]: STATUS.SKIPPED,
          [COL.ERROR] : 'Daily limit reached (' + limit + ' max per batch/account)'
        });
        result.skipped++;
      });
      break;
    }

    var row     = allRows[i];
    var rowData = row.data;
    var email   = String(rowData[emailCol] || '').trim();

    // --- Validate email ---
    if (!email || !_isValidEmail(email)) {
      writeRowStatus(sheet, row.rowIndex, colMap, {
        [COL.STATUS]: STATUS.FAILED,
        [COL.ERROR] : 'Invalid or empty email address'
      });
      result.failed++;
      result.errors.push('Row ' + row.rowIndex + ': invalid email "' + email + '"');
      continue;
    }

    // --- Duplicate check ---
    var emailLower = email.toLowerCase();
    if (sentSet[emailLower]) {
      writeRowStatus(sheet, row.rowIndex, colMap, {
        [COL.STATUS]: STATUS.DUPLICATE,
        [COL.ERROR] : 'Duplicate: already sent to ' + email
      });
      result.duplicate++;
      continue;
    }

    // --- Current row already sent? (resume guard) ---
    var currentStatus = String(rowData[COL.STATUS] || '').trim();
    if (currentStatus === STATUS.SENT) {
      sentSet[emailLower] = true;
      result.skipped++;
      continue;
    }

    // --- Render templates ---
    var subject = renderTemplate(params.subjectTemplate || '', rowData);
    var body    = renderTemplate(params.bodyTemplate    || '', rowData);

    // --- Inject tracking ---
    var trackId = _generateTrackId(email, row.rowIndex);

    if (params.enableOpenTracking && params.trackingBackendUrl) {
      body = injectTrackingPixel(body, trackId, params.trackingBackendUrl);
    }
    if (params.enableClickTracking && params.trackingBackendUrl) {
      body = injectClickTracking(body, trackId, params.trackingBackendUrl);
    }

    // --- Send or Create Draft ---
    try {
      var mailOptions = {
        htmlBody   : body,
        name       : params.senderName || '',
        attachments: draftAttachments
      };
      if (params.replyToEmail) {
        mailOptions.replyTo = params.replyToEmail;
      }

      if (params.createDraftsOnly) {
        GmailApp.createDraft(email, subject, body, mailOptions);
      } else {
        GmailApp.sendEmail(email, subject, body, mailOptions);
      }

      var sentAt = new Date().toISOString();
      writeRowStatus(sheet, row.rowIndex, colMap, {
        [COL.STATUS]    : STATUS.SENT,
        [COL.SENT_AT]   : sentAt,
        [COL.TRACK_ID]  : trackId,
        [COL.OPENED]    : false,
        [COL.CLICKED]   : false,
        [COL.REPLIED]   : false,
        [COL.POSITIVE]  : false,
        [COL.BOUNCED]   : false,
        [COL.BLOCKED]   : false,
        [COL.ERROR]     : ''
      });

      sentSet[emailLower] = true;
      result.sent++;
      sentCount++;

      // Save progress so a crash or next account session can resume
      saveConfig({ lastSentRow: row.rowIndex });

      // Rate limit
      if (delay > 0) Utilities.sleep(delay);

    } catch (e) {
      var errMsg = e.message || String(e);
      writeRowStatus(sheet, row.rowIndex, colMap, {
        [COL.STATUS]: STATUS.FAILED,
        [COL.ERROR] : errMsg.substring(0, 200)
      });
      result.failed++;
      result.errors.push('Row ' + row.rowIndex + ' (' + email + '): ' + errMsg);
    }
  }

  // Automatic contact list organization if requested
  if (params.autoMoveContactableToBottom) {
    try {
      moveContactableToBottom(sheet);
    } catch (e) {
      Logger.log('Auto-reorder note: ' + e.message);
    }
  }

  // Auto-refresh in-sheet visual dashboard if present
  try {
    createOrUpdateDashboardSheet(sheet);
  } catch (e) {
    Logger.log('Dashboard refresh note: ' + e.message);
  }

  return result;
}

/* ── Email-status refresh ─────────────────────────────────────── */

/**
 * Checks Gmail inbox/sent for reply signals, bounces, and positive sentiment.
 * Called from the menu "Refresh Email Statuses".
 */
function checkEmailStatuses() {
  var sheet  = getDataSheet();
  var colMap = ensureStatusColumns(sheet);
  var cfg    = getConfig();
  var emailColName = cfg.emailColumn || 'Email';

  var statusCol   = colMap[COL.STATUS];
  var positiveCol = colMap[COL.POSITIVE];
  var repliedCol  = colMap[COL.REPLIED];
  var bouncedCol  = colMap[COL.BOUNCED];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var allData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var headers = getHeaders(sheet);
  var emailIdx = headers.indexOf(emailColName);

  var updated = 0;
  var positiveCount = 0;

  // 1. Search for bounce messages from mail delivery subsystem
  var bounceThreads = GmailApp.search('from:mailer-daemon OR subject:"Mail delivery failed"', 0, 50);
  var bounceEmails  = {};
  bounceThreads.forEach(function(t) {
    t.getMessages().forEach(function(m) {
      var body = m.getPlainBody();
      var matches = body.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
      if (matches) {
        matches.forEach(function(e) { bounceEmails[e.toLowerCase()] = true; });
      }
    });
  });

  // 2. Search for received replies and test positive sentiment
  var replyEmails = {};
  var positiveEmails = {};
  var positiveKeywords = [
    'interested', 'yes', 'sounds good', 'let\'s talk', 'call', 'meeting',
    'schedule', 'demo', 'pricing', 'quote', 'sure', 'connect', 'discuss',
    'great', 'love to', 'calendar', 'time to chat', 'send more info'
  ];

  var inboxThreads = GmailApp.search('in:inbox', 0, 50);
  inboxThreads.forEach(function(thread) {
    var msgs = thread.getMessages();
    if (msgs.length > 1) { // multiple messages in thread indicates reply
      var lastMsg = msgs[msgs.length - 1];
      var fromHeader = lastMsg.getFrom().toLowerCase();
      var body = (lastMsg.getPlainBody() || '').toLowerCase();

      var match = fromHeader.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (match) {
        var replyEmail = match[0];
        replyEmails[replyEmail] = true;

        for (var k = 0; k < positiveKeywords.length; k++) {
          if (body.indexOf(positiveKeywords[k]) !== -1) {
            positiveEmails[replyEmail] = true;
            break;
          }
        }
      }
    }
  });

  allData.forEach(function(row, i) {
    var rowIndex = i + 2;
    var status   = String(row[statusCol - 1]).trim();
    if (status !== STATUS.SENT) return;

    var email = emailIdx >= 0 ? String(row[emailIdx] || '').trim().toLowerCase() : '';
    if (!email) return;

    var updates = {};

    // Check bounced
    if (bounceEmails[email]) {
      updates[COL.BOUNCED] = true;
      updated++;
    }

    // Check replied
    if (replyEmails[email]) {
      updates[COL.REPLIED] = true;
      updated++;
    }

    // Check positive
    if (positiveEmails[email]) {
      updates[COL.POSITIVE] = true;
      updates[COL.REPLIED]  = true;
      positiveCount++;
      updated++;
    }

    // Pull tracking data from backend if configured
    if (cfg.trackingBackendUrl) {
      var trackId = String(row[colMap[COL.TRACK_ID] - 1] || '').trim();
      if (trackId) {
        _pullTrackingFromBackend(sheet, rowIndex, colMap, trackId, cfg.trackingBackendUrl);
        updated++;
      }
    }

    if (Object.keys(updates).length > 0) {
      writeRowStatus(sheet, rowIndex, colMap, updates);
    }
  });

  // Sync to Positive Responses sheet if positive responses exist
  if (positiveCount > 0) {
    syncPositiveResponsesSheet(sheet);
  }

  // Refresh visual dashboard
  createOrUpdateDashboardSheet(sheet);

  SpreadsheetApp.getUi().alert('✅ Status refresh complete!\nUpdated rows: ' + updated + '\nPositive responses flagged: ' + positiveCount);
}

/**
 * Fetches open/click metrics from the FastAPI backend for a given trackId
 * and writes them to the sheet row.
 */
function _pullTrackingFromBackend(sheet, rowIndex, colMap, trackId, backendUrl) {
  try {
    var url      = backendUrl.replace(/\/$/, '') + '/api/status/' + encodeURIComponent(trackId);
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return;
    var data     = JSON.parse(response.getContentText());

    var updates = {};
    if (data.opened)  updates[COL.OPENED]  = data.opened;
    if (data.clicked) updates[COL.CLICKED] = data.clicked;
    if (data.bounced) updates[COL.BOUNCED] = data.bounced;
    if (data.replied) updates[COL.REPLIED] = data.replied;
    if (data.blocked) updates[COL.BLOCKED] = data.blocked;
    if (data.positive) updates[COL.POSITIVE] = data.positive;

    if (Object.keys(updates).length > 0) {
      writeRowStatus(sheet, rowIndex, colMap, updates);
    }
  } catch (e) {
    // Non-fatal — backend may not be running
  }
}

/* ── Helpers ──────────────────────────────────────────────────── */

function _isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function _generateTrackId(email, rowIndex) {
  var raw = email + '_' + rowIndex + '_' + Date.now();
  return Utilities.base64Encode(raw).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}

/* ── Preview ──────────────────────────────────────────────────── */

/**
 * Renders the first data row (or a specified row) as a preview
 * without sending. Returns { subject, body }.
 *
 * @param {number} previewRow  1-indexed sheet row to use as sample data
 * @param {string} subjectTpl
 * @param {string} bodyTpl
 * @return {Object}
 */
function previewEmail(previewRow, subjectTpl, bodyTpl, draftId) {
  var sheet   = getDataSheet();
  var headers = getHeaders(sheet);
  var row     = sheet.getRange(previewRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowData = {};
  headers.forEach(function(h, i) { rowData[h] = row[i]; });

  if (draftId) {
    try {
      var draft = GmailApp.getDraft(draftId);
      if (draft) {
        var msg = draft.getMessage();
        subjectTpl = subjectTpl || msg.getSubject();
        bodyTpl = bodyTpl || msg.getBody();
      }
    } catch (e) {
      Logger.log('Preview draft error: ' + e.message);
    }
  }

  return {
    subject: renderTemplate(subjectTpl || '', rowData),
    body   : renderTemplate(bodyTpl    || '', rowData)
  };
}

