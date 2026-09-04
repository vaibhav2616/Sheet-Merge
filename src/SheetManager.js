/**
 * SheetManager.js — Sheet utility functions
 * ==========================================
 * Handles column detection, status column management, header mapping,
 * duplicate detection, and row-level read/write operations.
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
 * Returns the active spreadsheet's first visible non-config sheet,
 * or the sheet named in config.
 */
function getDataSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var active = ss.getActiveSheet();
  var skipSheets = ['_MM_Metrics', '_MM_Tracking', '📊 SheetMerge Dashboard', '🎯 Positive Responses'];

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

/* ── Status-column management ─────────────────────────────────── */

/**
 * Ensures all MM_ columns exist in the sheet header row.
 * Adds missing columns at the end.
 * @param {Sheet} sheet
 * @return {Object}  Updated header map
 */
function ensureStatusColumns(sheet) {
  sheet = sheet || getDataSheet();
  var headers = getHeaders(sheet);
  var statusCols = Object.values(COL);   // MM_Status, MM_SentAt, …

  statusCols.forEach(function(colName) {
    if (headers.indexOf(colName) === -1) {
      var newCol = headers.length + 1;
      sheet.getRange(1, newCol).setValue(colName);
      // Light yellow header background
      sheet.getRange(1, newCol).setBackground('#fff9c4');
      headers.push(colName);
    }
  });

  return getHeaderMap(sheet);
}

/**
 * Removes all MM_ columns from the sheet (for reset).
 */
function clearStatusColumns() {
  var sheet = getDataSheet();
  var headers = getHeaders(sheet);
  var toDelete = [];

  headers.forEach(function(h, i) {
    if (h.startsWith('MM_')) toDelete.push(i + 1); // 1-indexed
  });

  // Delete right-to-left to preserve indices
  toDelete.reverse().forEach(function(col) {
    sheet.deleteColumn(col);
  });

  SpreadsheetApp.getUi().alert('✅ All MM_ status columns removed.');
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
 * Writes a set of column values to a specific row.
 * @param {Sheet}  sheet
 * @param {number} rowIndex   1-indexed
 * @param {Object} colMap     { headerName: 1-indexed-col }
 * @param {Object} updates    { headerName: value }
 */
function writeRowStatus(sheet, rowIndex, colMap, updates) {
  Object.keys(updates).forEach(function(key) {
    var col = colMap[key];
    if (col) {
      sheet.getRange(rowIndex, col).setValue(updates[key]);
    }
  });
}

/* ── Duplicate detection ──────────────────────────────────────── */

/**
 * Returns a Set-like object (plain object) of email addresses that
 * already have status === STATUS.SENT, to prevent re-sending.
 *
 * @param {Sheet}  sheet
 * @param {Object} colMap
 * @param {string} emailColName  Header name of the email column
 * @return {Object}  { 'email@example.com': true }
 */
function buildSentEmailSet(sheet, colMap, emailColName) {
  var lastRow = sheet.getLastRow();
  var statusCol = colMap[COL.STATUS];
  var emailCol  = colMap[emailColName];

  if (!statusCol || !emailCol || lastRow < 2) return {};

  var sent = {};
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var headers = getHeaders(sheet);

  data.forEach(function(row) {
    var email  = String(row[emailCol  - 1]).trim().toLowerCase();
    var status = String(row[statusCol - 1]).trim();
    if (status === STATUS.SENT && email) {
      sent[email] = true;
    }
  });

  return sent;
}

/**
 * Finds duplicate email addresses across all data rows (not just sent).
 * Returns an object where duplicated emails map to the row indices that
 * contain them.
 *
 * @param {Array} dataRows  Output of getDataRows()
 * @param {string} emailColName
 * @return {Object}  { 'dup@example.com': [2, 7, 12] }
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
 * Computes a summary of all MM_ status values from the sheet.
 * @return {Object}
 */
function computeMetrics() {
  var sheet  = getDataSheet();
  var colMap = getHeaderMap(sheet);
  var lastRow = sheet.getLastRow();

  var metrics = {
    total    : 0,
    sent     : 0,
    failed   : 0,
    pending  : 0,
    skipped  : 0,
    duplicate: 0,
    opened   : 0,
    clicked  : 0,
    replied  : 0,
    positive : 0,
    bounced  : 0,
    blocked  : 0
  };

  var statusCol   = colMap[COL.STATUS];
  var openedCol   = colMap[COL.OPENED];
  var clickedCol  = colMap[COL.CLICKED];
  var repliedCol  = colMap[COL.REPLIED];
  var positiveCol = colMap[COL.POSITIVE];
  var bouncedCol  = colMap[COL.BOUNCED];
  var blockedCol  = colMap[COL.BLOCKED];

  if (!statusCol || lastRow < 2) return metrics;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  data.forEach(function(row) {
    var status = String(row[statusCol - 1] || '').trim();
    if (!status) return;
    metrics.total++;

    switch (status) {
      case STATUS.SENT:      metrics.sent++;      break;
      case STATUS.FAILED:    metrics.failed++;     break;
      case STATUS.PENDING:   metrics.pending++;    break;
      case STATUS.SKIPPED:   metrics.skipped++;    break;
      case STATUS.DUPLICATE: metrics.duplicate++;  break;
    }

    if (openedCol   && (row[openedCol   - 1] === true || String(row[openedCol   - 1]).toLowerCase() === 'true')) metrics.opened++;
    if (clickedCol  && (row[clickedCol  - 1] === true || String(row[clickedCol  - 1]).toLowerCase() === 'true')) metrics.clicked++;
    if (repliedCol  && (row[repliedCol  - 1] === true || String(row[repliedCol  - 1]).toLowerCase() === 'true')) metrics.replied++;
    if (positiveCol && (row[positiveCol - 1] === true || String(row[positiveCol - 1]).toLowerCase() === 'true')) metrics.positive++;
    if (bouncedCol  && (row[bouncedCol  - 1] === true || String(row[bouncedCol  - 1]).toLowerCase() === 'true')) metrics.bounced++;
    if (blockedCol  && (row[blockedCol  - 1] === true || String(row[blockedCol  - 1]).toLowerCase() === 'true')) metrics.blocked++;
  });

  return metrics;
}

/**
 * Returns the last row index that was successfully sent, so the UI
 * can suggest resuming from the next row.
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
    if (row[0] === STATUS.SENT) last = i + 2; // i+2 because 1-indexed and header offset
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
 * Returns the list of non-MM_ column headers (for the column picker in UI).
 */
function getDataColumns() {
  var headers = getHeaders();
  return headers.filter(function(h) { return !h.startsWith('MM_'); });
}

