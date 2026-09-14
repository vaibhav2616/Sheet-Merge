/**
 * MailMerge.js — Core mail merge sending engine (v2 Unified & Anti-Spam Edition)
 * ==============================================================================
 * Key upgrades:
 * 1. Single-column status writing with rich badge colors and note metadata.
 * 2. Strict target count: continues emailing through invalid/failed rows until
 *    50 successful emails are delivered.
 * 3. Human-like anti-spam: randomized interval jitter (12s–35s) and natural formatting.
 * 4. Automatic post-run bounce sorting and valid contacts synchronization.
 */

/* ── Template engine ──────────────────────────────────────────── */

/**
 * Replaces {{ColumnName}} placeholders in a template string with row data.
 * Case-insensitive matching.
 */
function renderTemplate(template, rowData) {
  if (!template) return '';
  return template.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
    var trimmed = key.trim();
    var match = Object.keys(rowData).find(function(k) {
      return k.toLowerCase() === trimmed.toLowerCase();
    });
    return match !== undefined ? String(rowData[match]) : '';
  });
}

/* ── Tracking injection ───────────────────────────────────────── */

function injectTrackingPixel(body, trackId, backendUrl) {
  if (!backendUrl) return body;
  var pixelUrl = backendUrl.replace(/\/$/, '') + '/track/open/' + encodeURIComponent(trackId);
  var pixel = '<img src="' + pixelUrl + '" width="1" height="1" alt="" style="display:none" />';
  if (body.toLowerCase().indexOf('</body>') !== -1) {
    return body.replace(/<\/body>/i, pixel + '</body>');
  }
  return body + pixel;
}

function injectClickTracking(body, trackId, backendUrl) {
  if (!backendUrl) return body;
  var base = backendUrl.replace(/\/$/, '') + '/track/click/' + encodeURIComponent(trackId) + '?url=';
  return body.replace(/href="(https?:\/\/[^"]+)"/gi, function(_, url) {
    return 'href="' + base + encodeURIComponent(url) + '"';
  });
}

/* ── Sending Loop ─────────────────────────────────────────────── */

function runMailMerge(params) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(12000); // 12-second timeout
  } catch (e) {
    throw new Error('Another mail merge process is currently active. Please wait a moment.');
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

  var startRow     = Math.max(2, params.startRow || 2);
  var endRow       = params.endRow || 0;
  var emailCol     = params.emailColumn || 'Email';
  var targetQuota  = params.dailyLimit  || 50;   // Keep going until 50 successful
  var baseDelaySec = params.sendDelay   || 15;   // Natural human delay
  var useJitter    = params.randomJitter !== false; // Anti-spam jitter

  var result = {
    sent: 0,
    failed: 0,
    skipped: 0,
    duplicate: 0,
    targetQuota: targetQuota,
    errors: []
  };

  // 1. Load Gmail draft if selected
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
          params.bodyTemplate = draftMsg.getBody();
        }
      }
    } catch (e) {
      Logger.log('Draft error: ' + e.message);
    }
  }

  // 2. Build set of already-sent emails to respect campaign history
  var sentSet = buildSentEmailSet(sheet, colMap, emailCol);

  var allRows = getDataRows(sheet, startRow);
  if (endRow > 0) {
    allRows = allRows.filter(function(r) { return r.rowIndex <= endRow; });
  }

  var successfulSends = 0;

  for (var i = 0; i < allRows.length; i++) {
    // Check if target successful quota is reached
    if (successfulSends >= targetQuota) {
      break;
    }

    var row     = allRows[i];
    var rowData = row.data;
    var email   = String(rowData[emailCol] || '').trim();

    // Check status already set on this row
    var currentStatus = String(rowData[COL.STATUS] || '').trim();
    if (
      currentStatus === STATUS.SENT ||
      currentStatus === STATUS.OPENED ||
      currentStatus === STATUS.CLICKED ||
      currentStatus === STATUS.REPLIED ||
      currentStatus === STATUS.POSITIVE ||
      currentStatus === STATUS.BOUNCED ||
      currentStatus === STATUS.BLOCKED
    ) {
      if (email) sentSet[email.toLowerCase()] = true;
      result.skipped++;
      continue;
    }

    // Email syntax validation
    if (!email || !_isValidEmail(email)) {
      setCellStatus(sheet, row.rowIndex, STATUS.FAILED, {
        error: 'Invalid or missing email address',
        timestamp: new Date().toISOString()
      });
      result.failed++;
      result.errors.push('Row ' + row.rowIndex + ': invalid address "' + email + '"');
      // Do NOT increment successfulSends; continue to next to ensure quota is met!
      continue;
    }

    // Duplicate detection
    var emailLower = email.toLowerCase();
    if (sentSet[emailLower]) {
      setCellStatus(sheet, row.rowIndex, STATUS.DUPLICATE, {
        error: 'Duplicate address: already emailed previously',
        timestamp: new Date().toISOString()
      });
      result.duplicate++;
      // Do NOT increment successfulSends; continue
      continue;
    }

    // Render templates
    var subject = renderTemplate(params.subjectTemplate || '', rowData);
    var body    = renderTemplate(params.bodyTemplate    || '', rowData);

    // Inject tracking if enabled
    var trackId = _generateTrackId(email, row.rowIndex);
    if (params.enableOpenTracking && params.trackingBackendUrl) {
      body = injectTrackingPixel(body, trackId, params.trackingBackendUrl);
    }
    if (params.enableClickTracking && params.trackingBackendUrl) {
      body = injectClickTracking(body, trackId, params.trackingBackendUrl);
    }

    // Dispatch email
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

      var sentTimestamp = new Date().toISOString();
      setCellStatus(sheet, row.rowIndex, STATUS.SENT, {
        timestamp: sentTimestamp,
        trackId: trackId,
        details: 'Sent via SheetMerge V2 engine'
      });

      sentSet[emailLower] = true;
      result.sent++;
      successfulSends++;

      // Save state
      saveConfig({ lastSentRow: row.rowIndex });

      // Anti-spam jitter delay: randomized human pace
      var waitMs = baseDelaySec * 1000;
      if (useJitter) {
        // Add +/- 35% randomized jitter
        var jitter = (Math.random() * 0.7 - 0.35) * waitMs;
        waitMs = Math.max(5000, Math.floor(waitMs + jitter));
      }
      Utilities.sleep(waitMs);

    } catch (err) {
      var errMsg = err.message || String(err);
      var errLower = errMsg.toLowerCase();
      var is5xxHardBounce = errLower.indexOf('550') !== -1 || errLower.indexOf('554') !== -1 || errLower.indexOf('5.4.1') !== -1 || errLower.indexOf('user unknown') !== -1 || errLower.indexOf('address rejected') !== -1;
      var isBlock = errLower.indexOf('block') !== -1 || errLower.indexOf('spam') !== -1 || errLower.indexOf('policy') !== -1;

      var failStatus = is5xxHardBounce ? STATUS.BOUNCED : (isBlock ? STATUS.BLOCKED : STATUS.FAILED);

      setCellStatus(sheet, row.rowIndex, failStatus, {
        error: errMsg,
        timestamp: new Date().toISOString(),
        details: is5xxHardBounce ? 'Permanent 5xx hard bounce intercepted' : 'Dispatch error'
      });

      // If hard bounce, add to sentSet so it is never re-tried in this or future runs
      if (is5xxHardBounce && email) {
        sentSet[emailLower] = true;
      }

      result.failed++;
      result.errors.push('Row ' + row.rowIndex + ' (' + email + '): ' + errMsg);
      // Hard bounce or error encountered: engine stops hammering this address and continues to next lead
    }
  }

  // 3. Post-run organization
  if (params.autoMoveBouncedToBottom !== false) {
    try {
      moveBouncedAndBlockedToBottom(sheet);
    } catch (e) {
      Logger.log('Auto bounce sort note: ' + e.message);
    }
  }

  if (params.autoBuildValidList !== false) {
    try {
      buildValidContactsSheet(sheet);
    } catch (e) {
      Logger.log('Auto valid list note: ' + e.message);
    }
  }

  try {
    createOrUpdateDashboardSheet(sheet);
  } catch (e) {
    Logger.log('Dashboard refresh note: ' + e.message);
  }

  return result;
}

/* ── Status and Bounce Inspection from Gmail ──────────────────── */

function checkEmailStatuses() {
  var sheet   = getDataSheet();
  var colMap  = ensureStatusColumns(sheet);
  var cfg     = getConfig();
  var emailColName = cfg.emailColumn || 'Email';

  var statusCol = colMap[COL.STATUS];
  var lastRow   = sheet.getLastRow();
  if (lastRow < 2) return;

  var allData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var headers = getHeaders(sheet);
  var emailIdx = headers.indexOf(emailColName);

  var updatedCount = 0;
  var positiveCount = 0;
  var bouncedCount = 0;

  // 1. Search for bounce messages from mailer-daemon / bounce notifications
  var bounceThreads = GmailApp.search('from:mailer-daemon OR subject:"Mail delivery failed" OR subject:"Delivery Status Notification"', 0, 40);
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

  // 2. Search for replies and analyze sentiment
  var replyEmails = {};
  var positiveEmails = {};
  var positiveKeywords = [
    'interested', 'yes', 'sounds good', 'let\'s talk', 'call', 'meeting',
    'schedule', 'demo', 'pricing', 'quote', 'sure', 'connect', 'discuss',
    'great', 'love to', 'calendar', 'time to chat', 'send more info'
  ];

  var inboxThreads = GmailApp.search('in:inbox', 0, 40);
  inboxThreads.forEach(function(thread) {
    var msgs = thread.getMessages();
    if (msgs.length > 1) {
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
    var currentStatus = String(row[statusCol - 1] || '').trim();
    var email = emailIdx >= 0 ? String(row[emailIdx] || '').trim().toLowerCase() : '';

    if (!email) return;

    if (bounceEmails[email]) {
      setCellStatus(sheet, rowIndex, STATUS.BOUNCED, {
        error: 'Delivery bounced (Mailer-Daemon Notification)',
        timestamp: new Date().toISOString()
      });
      bouncedCount++;
      updatedCount++;
    } else if (positiveEmails[email]) {
      setCellStatus(sheet, rowIndex, STATUS.POSITIVE, {
        details: 'Positive sentiment reply detected',
        timestamp: new Date().toISOString()
      });
      positiveCount++;
      updatedCount++;
    } else if (replyEmails[email]) {
      setCellStatus(sheet, rowIndex, STATUS.REPLIED, {
        details: 'Reply received in Gmail',
        timestamp: new Date().toISOString()
      });
      updatedCount++;
    }
  });

  // Re-sort bounced to bottom if new bounces found
  if (bouncedCount > 0) {
    moveBouncedAndBlockedToBottom(sheet);
  }

  // Update valid contacts and positive leads
  buildValidContactsSheet(sheet);
  if (positiveCount > 0) {
    syncPositiveResponsesSheet(sheet);
  }
  createOrUpdateDashboardSheet(sheet);

  SpreadsheetApp.getUi().alert(
    '✅ Status Refresh Complete!\n\n' +
    '• Updated: ' + updatedCount + ' rows\n' +
    '• Bounces detected & moved: ' + bouncedCount + '\n' +
    '• Positive replies: ' + positiveCount
  );
}

function _isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function _generateTrackId(email, rowIndex) {
  var raw = email + '_' + rowIndex + '_' + Date.now();
  return Utilities.base64Encode(raw).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}

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
