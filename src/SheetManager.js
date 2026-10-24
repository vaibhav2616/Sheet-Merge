/**
 * SheetManager.js — Sheet utility functions (v2 Unified Status Edition)
 * ======================================================================
 * Handles column detection, single-column status management with rich color coding,
 * cell notes for detailed metadata, duplicate detection, and row read/write operations.
 */

/* ── Header utilities ─────────────────────────────────────────── */

/**
 * Returns all header names from row 1 of the active (or named) sheet.
 * @param {Sheet} [sheet]
 * @return {string[]}
 */
function getHeaders(sheet) {
  sheet = sheet || getDataSheet();
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

/**
 * Returns a {headerName: columnIndex_1based} map.
 */
function getHeaderMap(sheet) {
  var headers = getHeaders(sheet);
  var map = {};
  headers.forEach(function(h, i) { map[h] = i + 1; });
  return map;
}

/**
 * Returns the active spreadsheet's primary lead/data sheet,
 * skipping internal utility and report tabs.
 */
function getDataSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var active = ss.getActiveSheet();
  var skipSheets = [
    '_MM_Metrics',
    '_MM_Tracking',
    '📊 SheetMerge Dashboard',
    '🎯 Positive Responses',
    '✨ Valid Contacts'
  ];

  if (active && skipSheets.indexOf(active.getName()) === -1) {
    return active;
  }

  // Fall back to first non-utility sheet
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (skipSheets.indexOf(sheets[i].getName()) === -1) {
      return sheets[i];
    }
  }
  return sheets[0];
}

/* ── Unified Single Status Column Management ────────────────────── */

/**
 * Ensures the single unified status column exists in row 1.
 * Uses 'Merge Status' (100% compatible with Yet Another Mail Merge).
 * If 'SheetMerge Status' exists from earlier versions, renames it cleanly.
 *
 * @param {Sheet} sheet
 * @return {Object} Updated header map
 */
function ensureStatusColumns(sheet) {
  sheet = sheet || getDataSheet();
  var headers = getHeaders(sheet);

  // Check if primary 'Merge Status' or legacy alias exists
  var statusIdx = headers.indexOf(COL.STATUS);
  if (statusIdx === -1 && COL.LEGACY_STATUS) {
    statusIdx = headers.indexOf(COL.LEGACY_STATUS);
    if (statusIdx !== -1) {
      sheet.getRange(1, statusIdx + 1).setValue(COL.STATUS);
      headers[statusIdx] = COL.STATUS;
    }
  }

  // If still not found, append 'Merge Status' as a new column
  if (statusIdx === -1) {
    var newCol = headers.length + 1;
    var cell = sheet.getRange(1, newCol);
    cell.setValue(COL.STATUS);
    cell.setFontWeight('bold');
    cell.setBackground('#e2e8f0'); // Crisp slate-gray header
    cell.setFontColor('#0f172a');
    headers.push(COL.STATUS);
  }

  return getHeaderMap(sheet);
}

/**
 * Studies and consolidates all legacy or separated status columns
 * (e.g. Email Status, Bounce Status, Reply Status, Click Status, MM_*, Track ID)
 * into a single unified 'Merge Status' column (matching Yet Another Mail Merge standard).
 * Standardizes raw values and deletes the redundant legacy columns.
 *
 * @param {Sheet} [sheet]
 */
function consolidateAndMigrateLegacyStatusColumns(sheet) {
  sheet = sheet || getDataSheet();
  var headers = getHeaders(sheet);
  if (!headers || headers.length === 0) return;

  var colMap = ensureStatusColumns(sheet);
  var targetStatusCol = colMap[COL.STATUS];
  var lastRow = sheet.getLastRow();

  // Known legacy column names to detect and consolidate
  var legacyPatterns = [
    'email status', 'bounce status', 'reply status', 'click status',
    'opened', 'bounced', 'replied', 'clicked',
    'mm_status', 'mm_sentat', 'mm_openedat', 'mm_clickedat',
    'mm_repliedat', 'mm_bouncedat', 'mm_error', 'track id', 'tracking id'
  ];

  var legacyIndices = [];
  headers.forEach(function(h, idx) {
    var lower = String(h || '').trim().toLowerCase();
    if (idx + 1 === targetStatusCol) return;
    if (lower === COL.STATUS.toLowerCase()) return;
    for (var k = 0; k < legacyPatterns.length; k++) {
      if (lower === legacyPatterns[k] || lower.indexOf('mm_') === 0) {
        legacyIndices.push({ index: idx + 1, header: h, lower: lower });
        break;
      }
    }
  });

  if (lastRow >= 2) {
    var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var values = dataRange.getValues();

    for (var r = 0; r < values.length; r++) {
      var rowNum = r + 2;
      var currentVal = String(values[r][targetStatusCol - 1] || '').trim();
      var metaNote = {};

      var resolvedStatus = '';
      if (currentVal) {
        resolvedStatus = parseStatusString(currentVal);
      }

      // Check legacy columns if target column was empty or needs metadata
      legacyIndices.forEach(function(leg) {
        var val = String(values[r][leg.index - 1] || '').trim();
        if (!val) return;

        if (leg.lower.indexOf('error') !== -1) metaNote.error = val;
        if (leg.lower.indexOf('track') !== -1) metaNote.trackId = val;
        if (leg.lower.indexOf('sentat') !== -1) metaNote.timestamp = val;

        if (!resolvedStatus || resolvedStatus === STATUS.PENDING) {
          if (leg.lower.indexOf('bounce') !== -1 && val.toLowerCase().indexOf('bounc') !== -1) {
            resolvedStatus = STATUS.BOUNCED;
          } else if (leg.lower.indexOf('reply') !== -1 && val) {
            resolvedStatus = val.toLowerCase().indexOf('pos') !== -1 ? STATUS.POSITIVE : STATUS.REPLIED;
          } else if (leg.lower.indexOf('click') !== -1 && val.toLowerCase().indexOf('click') !== -1) {
            resolvedStatus = STATUS.CLICKED;
          } else if (leg.lower.indexOf('open') !== -1 && val.toLowerCase().indexOf('open') !== -1) {
            resolvedStatus = STATUS.OPENED;
          } else if (leg.lower.indexOf('email status') !== -1 || leg.lower === 'mm_status') {
            resolvedStatus = parseStatusString(val);
          }
        }
      });

      if (resolvedStatus && resolvedStatus !== currentVal) {
        setCellStatus(sheet, rowNum, resolvedStatus, metaNote);
      } else if (currentVal) {
        // Apply badge styling to existing YAMM / legacy values
        var std = parseStatusString(currentVal);
        var style = STATUS_COLORS[currentVal] || STATUS_COLORS[std] || { bg: '#ffffff', text: '#000000' };
        var cell = sheet.getRange(rowNum, targetStatusCol);
        cell.setBackground(style.bg);
        cell.setFontColor(style.text);
        cell.setFontWeight('bold');
        cell.setHorizontalAlignment('center');
      }
    }
  }

  // Safely delete legacy columns from right to left
  var toDeleteCols = legacyIndices.map(function(item) { return item.index; });
  toDeleteCols.sort(function(a, b) { return b - a; });
  toDeleteCols.forEach(function(colIdx) {
    sheet.deleteColumn(colIdx);
  });

  try {
    SpreadsheetApp.getUi().alert('✅ Successfully consolidated statuses into single "' + COL.STATUS + '" column. ' + toDeleteCols.length + ' legacy columns cleaned.');
  } catch (e) {
    Logger.log('Consolidated ' + toDeleteCols.length + ' legacy columns headlessly.');
  }
}

/**
 * Applies color-coded badge styling and optional cell metadata note
 * to a single row's Merge Status cell.
 *
 * @param {Sheet} sheet
 * @param {number} rowIndex 1-indexed row number
 * @param {string} status Status string (e.g. 'Sent', 'Opened', 'Positive Reply', 'Bounced')
 * @param {Object} [meta] Metadata object stored in the cell's note
 */
function setCellStatus(sheet, rowIndex, status, meta) {
  var colMap = ensureStatusColumns(sheet);
  var col = colMap[COL.STATUS];
  if (!col) return;

  var cell = sheet.getRange(rowIndex, col);
  cell.setValue(status);

  // Apply color coding
  var std = parseStatusString(status);
  var style = STATUS_COLORS[status] || STATUS_COLORS[std] || { bg: '#ffffff', text: '#000000' };
  cell.setBackground(style.bg);
  cell.setFontColor(style.text);
  cell.setFontWeight('bold');
  cell.setHorizontalAlignment('center');

  // Attach metadata to cell note so data sheet remains pristine
  if (meta) {
    var noteLines = ['Status: ' + status];
    if (meta.timestamp) noteLines.push('Timestamp: ' + meta.timestamp);
    if (meta.trackId)   noteLines.push('Track ID: ' + meta.trackId);
    if (meta.account)   noteLines.push('Sender Account: ' + meta.account);
    if (meta.error)     noteLines.push('Error: ' + meta.error);
    if (meta.details)   noteLines.push('Details: ' + meta.details);
    cell.setNote(noteLines.join('\n'));
  }
}

/**
 * Clears the unified status column (or legacy MM_ columns) for reset.
 */
function clearStatusColumns() {
  var sheet = getDataSheet();
  var headers = getHeaders(sheet);
  var toDelete = [];

  headers.forEach(function(h, i) {
    if (h === COL.STATUS || h === COL.LEGACY_STATUS || h.startsWith('MM_')) {
      toDelete.push(i + 1); // 1-indexed
    }
  });

  // Delete right-to-left to preserve index stability
  toDelete.reverse().forEach(function(col) {
    sheet.deleteColumn(col);
  });

  try {
    SpreadsheetApp.getUi().alert('✅ ' + COL.STATUS + ' column reset.');
  } catch (e) {
    Logger.log('Status column reset.');
  }
}

/* ── Row data access ──────────────────────────────────────────── */

/**
 * Reads all data rows as an array of objects keyed by header name.
 * @param {Sheet}  sheet
 * @param {number} startRow  1-indexed (usually 2 to skip header)
 * @return {Array<{rowIndex:number, data:Object}>}
 */
function getDataRows(sheet, startRow) {
  sheet    = sheet    || getDataSheet();
  startRow = startRow || 2;

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < startRow) return [];

  var headers = getHeaders(sheet);
  var values  = sheet.getRange(startRow, 1, lastRow - startRow + 1, lastCol).getValues();

  return values.map(function(row, i) {
    var obj = {};
    headers.forEach(function(h, j) { obj[h] = row[j]; });
    return { rowIndex: startRow + i, data: obj };
  });
}

/**
 * Legacy compatibility wrapper for writing row status.
 */
function writeRowStatus(sheet, rowIndex, colMap, updates) {
  // If status is supplied in updates, use setCellStatus
  var status = updates[COL.STATUS] || updates['MM_Status'];
  if (status) {
    var meta = {
      timestamp: updates['MM_SentAt'] || new Date().toISOString(),
      trackId: updates['MM_TrackId'],
      error: updates['MM_Error']
    };
    setCellStatus(sheet, rowIndex, status, meta);
  }
}

/* ── Duplicate & Sent History Detection ──────────────────────── */

/**
 * Returns a Set-like object of email addresses that have already been
 * contacted/sent, preventing re-sending and respecting campaign history.
 *
 * @param {Sheet}  sheet
 * @param {Object} colMap
 * @param {string} emailColName Header name of the email column
 * @return {Object}  { 'email@example.com': true }
 */
function buildSentEmailSet(sheet, colMap, emailColName) {
  var lastRow = sheet.getLastRow();
  var statusCol = colMap[COL.STATUS];
  var emailCol  = colMap[emailColName];

  if (!statusCol || !emailCol || lastRow < 2) return {};

  var sent = {};
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  data.forEach(function(row) {
    var email  = String(row[emailCol  - 1] || '').trim().toLowerCase();
    var status = String(row[statusCol - 1] || '').trim();

    // Considered already contacted if sent, opened, clicked, replied, bounced, or positive (YAMM + SheetMerge)
    if (email && isProcessedStatus(status)) {
      sent[email] = true;
    }
  });

  return sent;
}

/**
 * Finds duplicate email addresses across all data rows.
 * @param {Array} dataRows Output of getDataRows()
 * @param {string} emailColName
 * @return {Object} { 'dup@example.com': [2, 7, 12] }
 */
function findDuplicates(dataRows, emailColName) {
  var seen  = {};
  var dupes = {};

  dataRows.forEach(function(r) {
    var email = String(r.data[emailColName] || '').trim().toLowerCase();
    if (!email) return;
    if (!seen[email]) {
      seen[email] = [r.rowIndex];
    } else {
      seen[email].push(r.rowIndex);
    }
  });

  Object.keys(seen).forEach(function(email) {
    if (seen[email].length > 1) dupes[email] = seen[email];
  });

  return dupes;
}

/* ── Metrics summary ──────────────────────────────────────────── */

/**
 * Computes a summary of all statuses from the single unified status column.
 * @return {Object}
 */
function computeMetrics() {
  var sheet  = getDataSheet();
  var colMap = getHeaderMap(sheet);
  var lastRow = sheet.getLastRow();

  var metrics = {
    total    : 0,
    sent     : 0,
    opened   : 0,
    clicked  : 0,
    replied  : 0,
    positive : 0,
    bounced  : 0,
    blocked  : 0,
    failed   : 0,
    duplicate: 0,
    skipped  : 0,
    pending  : 0
  };

  var statusCol = colMap[COL.STATUS];
  if (!statusCol || lastRow < 2) return metrics;

  var data = sheet.getRange(2, statusCol, lastRow - 1, 1).getValues();

  data.forEach(function(row) {
    var status = String(row[0] || '').trim();
    if (!status) {
      metrics.pending++;
      return;
    }
    metrics.total++;

    if (status.indexOf('Positive') !== -1) {
      metrics.positive++;
      metrics.replied++;
      metrics.sent++;
    } else if (status.indexOf('Replied') !== -1) {
      metrics.replied++;
      metrics.sent++;
    } else if (status.indexOf('Clicked') !== -1) {
      metrics.clicked++;
      metrics.opened++;
      metrics.sent++;
    } else if (status.indexOf('Opened') !== -1) {
      metrics.opened++;
      metrics.sent++;
    } else if (status === STATUS.SENT) {
      metrics.sent++;
    } else if (status === STATUS.BOUNCED) {
      metrics.bounced++;
    } else if (status === STATUS.BLOCKED) {
      metrics.blocked++;
    } else if (status === STATUS.FAILED) {
      metrics.failed++;
    } else if (status === STATUS.DUPLICATE) {
      metrics.duplicate++;
    } else if (status === STATUS.SKIPPED) {
      metrics.skipped++;
    } else {
      metrics.pending++;
    }
  });

  return metrics;
}

/**
 * Returns the last row index that was processed, so the engine resumes
 * from the next row without user intervention.
 */
function getLastSentRow() {
  var sheet  = getDataSheet();
  var colMap = getHeaderMap(sheet);
  var statusCol = colMap[COL.STATUS];
  if (!statusCol) return 1;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;

  var statuses = sheet.getRange(2, statusCol, lastRow - 1, 1).getValues();
  var last = 1;
  statuses.forEach(function(row, i) {
    var val = String(row[0] || '').trim();
    if (val !== '' && val !== STATUS.PENDING) {
      last = i + 2; // 1-indexed plus header row offset
    }
  });
  return last;
}

/**
 * Returns a list of all sheet names in the spreadsheet.
 */
function getSheetNames() {
  return SpreadsheetApp.getActiveSpreadsheet()
    .getSheets()
    .map(function(s) { return s.getName(); });
}

/**
 * Returns data column headers (excluding internal status column).
 */
function getDataColumns() {
  var headers = getHeaders();
  return headers.filter(function(h) {
    return h !== COL.STATUS && !h.startsWith('MM_');
  });
}
