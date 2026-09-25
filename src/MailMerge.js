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
  var pixelUrl = backendUrl.indexOf('script.google.com') !== -1
    ? backendUrl + (backendUrl.indexOf('?') === -1 ? '?' : '&') + 'route=open&id=' + encodeURIComponent(trackId)
    : backendUrl.replace(/\/$/, '') + '/track/open/' + encodeURIComponent(trackId);
  var pixel = '<img src="' + pixelUrl + '" width="1" height="1" alt="" style="display:none" />';
  if (body.toLowerCase().indexOf('</body>') !== -1) {
    return body.replace(/<\/body>/i, pixel + '</body>');
  }
  return body + pixel;
}

function injectClickTracking(body, trackId, backendUrl) {
  if (!backendUrl) return body;
  var isScriptUrl = backendUrl.indexOf('script.google.com') !== -1;
  return body.replace(/href="(https?:\/\/[^"]+)"/gi, function(_, url) {
    var redirectUrl = isScriptUrl
      ? backendUrl + (backendUrl.indexOf('?') === -1 ? '?' : '&') + 'route=click&id=' + encodeURIComponent(trackId) + '&url=' + encodeURIComponent(url)
      : backendUrl.replace(/\/$/, '') + '/track/click/' + encodeURIComponent(trackId) + '?url=' + encodeURIComponent(url);
    return 'href="' + redirectUrl + '"';
  });
}

/* ── Stop Detection & Control ─────────────────────────────────── */

/**
 * Checks whether a stop signal has been triggered by the user via PropertiesService or CacheService.
 * @return {boolean}
 */
function isStopRequested() {
  try {
    var p = PropertiesService.getUserProperties().getProperty('SHEETMERGE_STOP_REQUESTED');
    if (p === 'true') return true;
  } catch (e) {}
  try {
    var c = CacheService.getUserCache().get('SHEETMERGE_STOP_REQUESTED');
    if (c === 'true') return true;
  } catch (e2) {}
  return false;
}

/**
 * Resets the stop request flags.
 */
function clearStopFlag() {
  try { PropertiesService.getUserProperties().deleteProperty('SHEETMERGE_STOP_REQUESTED'); } catch (e) {}
  try { CacheService.getUserCache().remove('SHEETMERGE_STOP_REQUESTED'); } catch (e2) {}
}

/**
 * Sets the stop request flag to halt any running mail merge loop immediately.
 * @return {Object}
 */
function triggerStopMerge() {
  try { PropertiesService.getUserProperties().setProperty('SHEETMERGE_STOP_REQUESTED', 'true'); } catch (e) {}
  try { CacheService.getUserCache().put('SHEETMERGE_STOP_REQUESTED', 'true', 300); } catch (e2) {}
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('Stop signal received. Mail merge will halt after the current email.', '🛑 Halting SheetMerge', 6);
  } catch (e3) {}
  return { success: true, message: 'Stop signal dispatched. SheetMerge execution will halt.' };
}

/**
 * Sleeps for totalMs while checking for stop requests every 400ms.
 * Returns true if the user triggered a stop during the delay.
 *
 * @param {number} totalMs
 * @return {boolean}
 */
function sleepWithStopCheck(totalMs) {
  var elapsed = 0;
  var step = 400;
  while (elapsed < totalMs) {
    if (isStopRequested()) {
      return true;
    }
    var chunk = Math.min(step, totalMs - elapsed);
    Utilities.sleep(chunk);
    elapsed += chunk;
  }
  return false;
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
  clearStopFlag();

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
    stopped: false,
    targetQuota: targetQuota,
    errors: []
  };

  // Require an active draft or template before any email can be sent
  if (!params.draftId && !params.bodyTemplate) {
    throw new Error('No Gmail draft selected. Please select a Gmail draft before starting mail merge.');
  }

  // 1. Load Gmail draft if selected and retain preference
  var draftAttachments = [];
  if (params.draftId) {
    saveConfig({ draftId: params.draftId });
    try {
      PropertiesService.getUserProperties().setProperty('LAST_SELECTED_DRAFT_ID', params.draftId);
    } catch (eProp) {}

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
      } else {
        throw new Error('Selected Gmail draft could not be found. It may have been deleted or sent in Gmail.');
      }
    } catch (e) {
      Logger.log('Draft error: ' + e.message);
      throw new Error('Could not load draft: ' + e.message);
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
    // Check if user requested to stop the merge
    if (isStopRequested()) {
      Logger.log('Mail merge stop requested by user. Aborting dispatch.');
      clearStopFlag();
      result.stopped = true;
      result.errors.push('Mail merge was stopped by the user after ' + successfulSends + ' successful sends.');
      try {
        SpreadsheetApp.getActiveSpreadsheet().toast('Mail merge stopped by user. ' + successfulSends + ' emails delivered.', '🛑 SheetMerge Halted', 6);
      } catch (eToast) {}
      break;
    }

    // Check if target successful quota is reached
    if (successfulSends >= targetQuota) {
      break;
    }

    var row     = allRows[i];
    var rowData = row.data;
    var email   = String(rowData[emailCol] || '').trim();

    // Check status already set on this row (compatible with YAMM and SheetMerge)
    var currentStatus = String(rowData[COL.STATUS] || '').trim();
    if (isProcessedStatus(currentStatus)) {
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

      // Anti-spam jitter delay with responsive stop interrupt
      var waitMs = baseDelaySec * 1000;
      if (useJitter) {
        // Add +/- 35% randomized jitter
        var jitter = (Math.random() * 0.7 - 0.35) * waitMs;
        waitMs = Math.max(4000, Math.floor(waitMs + jitter));
      }

      // Responsive sleep checking for stop signal every 400ms
      var stoppedDuringWait = sleepWithStopCheck(waitMs);
      if (stoppedDuringWait) {
        Logger.log('Stop signal received during delay. Aborting dispatch.');
        clearStopFlag();
        result.stopped = true;
        result.errors.push('Mail merge stopped by user during delay after row ' + row.rowIndex);
        try {
          SpreadsheetApp.getActiveSpreadsheet().toast('Mail merge stopped by user. ' + successfulSends + ' emails delivered.', '🛑 SheetMerge Halted', 6);
        } catch (eToast2) {}
        break;
      }

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
    }
  }

  // 3. Post-run organization (only if not abruptly stopped or if partial cleanup requested)
  if (!result.stopped && params.autoMoveBouncedToBottom !== false) {
    try {
      moveBouncedAndBlockedToBottom(sheet);
    } catch (e) {
      Logger.log('Auto bounce sort note: ' + e.message);
    }
  }

  if (!result.stopped && params.autoBuildValidList !== false) {
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

  // Only show alert when running interactively (not in time-driven triggers)
  var summary = {
    updatedRows: updatedCount,
    bouncesDetected: bouncedCount,
    positiveReplies: positiveCount
  };
  try {
    SpreadsheetApp.getUi().alert(
      '✅ Status Refresh Complete!\n\n' +
      '• Updated: ' + updatedCount + ' rows\n' +
      '• Bounces detected & moved: ' + bouncedCount + '\n' +
      '• Positive replies: ' + positiveCount
    );
  } catch (uiErr) {
    // Running in headless / time-driven trigger context — no UI available.
    Logger.log('checkEmailStatuses result: ' + JSON.stringify(summary));
  }
  return summary;
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

/**
 * Sends a single test email of row 2 directly to the active user's own inbox.
 * Allows instant verification of tags, formatting, and attachments without altering the sheet.
 *
 * @param {Object} params
 * @return {Object}
 */
function sendTestEmail(params) {
  params = params || {};
  var userEmail = Session.getActiveUser().getEmail();
  if (!userEmail) {
    throw new Error('Could not identify active user email. Please ensure your Google account is signed in.');
  }

  var sheet = getDataSheet();
  var allRows = getDataRows(sheet, 2);
  if (!allRows || allRows.length === 0) {
    throw new Error('Your sheet contains no contact data rows to preview tags with.');
  }

  var sampleRow = allRows[0].data;
  var subject = params.subjectTemplate || '';
  var body = params.bodyTemplate || '';
  var attachments = [];

  if (!params.draftId && !params.bodyTemplate) {
    throw new Error('Please select a Gmail draft before sending a test email.');
  }

  if (params.draftId) {
    saveConfig({ draftId: params.draftId });
    try {
      PropertiesService.getUserProperties().setProperty('LAST_SELECTED_DRAFT_ID', params.draftId);
    } catch (eProp) {}

    try {
      var draft = GmailApp.getDraft(params.draftId);
      if (draft) {
        var msg = draft.getMessage();
        subject = msg.getSubject() || '';
        body = msg.getBody() || '';
        attachments = msg.getAttachments() || [];
      }
    } catch (e) {
      Logger.log('Test email draft fetch note: ' + e.message);
    }
  }

  var renderedSubject = '[TEST] ' + renderTemplate(subject, sampleRow);
  var renderedBody = renderTemplate(body, sampleRow);

  var mailOptions = {
    htmlBody: renderedBody,
    name: params.senderName ? (params.senderName + ' (Test)') : 'SheetMerge Test',
    attachments: attachments
  };

  GmailApp.sendEmail(userEmail, renderedSubject, renderedBody, mailOptions);

  return {
    success: true,
    recipient: userEmail,
    subject: renderedSubject,
    message: 'Test email delivered to ' + userEmail
  };
}

/**
 * Returns current user account info and remaining daily Gmail quota.
 *
 * @return {Object}
 */
function getMergeQuota() {
  var remaining = 100;
  try {
    remaining = MailApp.getRemainingDailyQuota();
  } catch (e) {}

  var userEmail = '';
  try {
    userEmail = Session.getActiveUser().getEmail();
  } catch (e2) {}

  return {
    userEmail: userEmail,
    remainingQuota: remaining,
    maxQuota: 100 // Consumer Gmail 100, Google Workspace 1500
  };
}

