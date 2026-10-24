/**
 * ContactManager.js — Contact list ordering and lead classification (v2)
 * ======================================================================
 * Features:
 * 1. Move Bounced & Blocked emails to the very bottom of the sheet.
 * 2. Create/update a dedicated "✨ Valid Contacts" sheet containing only
 *    verified, deliverable contacts as traversal proceeds daily.
 * 3. Move contactable / completed leads with clear separation.
 */

var VALID_CONTACTS_SHEET_NAME = '✨ Valid Contacts';

/**
 * Moves all rows whose status is 'Bounced' or 'Blocked' (or Failed due to invalid email)
 * to the very bottom of the data sheet. Valid and pending leads bubble up.
 *
 * @param {Sheet} [sheet]
 * @return {Object} { totalRows, validOrPendingCount, bouncedCount }
 */
function moveBouncedAndBlockedToBottom(sheet) {
  sheet = sheet || getDataSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return { totalRows: 0, validOrPendingCount: 0, bouncedCount: 0 };
  }

  var colMap = ensureStatusColumns(sheet);
  var statusCol = colMap[COL.STATUS];

  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var rows = range.getValues();

  var normalRows = [];
  var bouncedRows = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var status = String(row[statusCol - 1] || '').trim().toLowerCase();

    var isBouncedOrBlocked = (
      status === STATUS.BOUNCED.toLowerCase() ||
      status === STATUS.BLOCKED.toLowerCase() ||
      status === 'bounced' ||
      status === 'blocked'
    );

    if (isBouncedOrBlocked) {
      bouncedRows.push(row);
    } else {
      normalRows.push(row);
    }
  }

  // If no bounced rows found, nothing to rearrange
  if (bouncedRows.length === 0) {
    return {
      totalRows: rows.length,
      validOrPendingCount: normalRows.length,
      bouncedCount: 0
    };
  }

  // Reorder: normal leads first, bounced/blocked moved to the end
  var reordered = normalRows.concat(bouncedRows);
  range.setValues(reordered);

  // Re-apply cell styles for the updated rows
  for (var r = 0; r < reordered.length; r++) {
    var curRowIdx = 2 + r;
    var rowStatus = String(reordered[r][statusCol - 1] || '').trim();
    if (rowStatus) {
      var style = STATUS_COLORS[rowStatus];
      if (style) {
        var cell = sheet.getRange(curRowIdx, statusCol);
        cell.setBackground(style.bg);
        cell.setFontColor(style.text);
        cell.setFontWeight('bold');
      }
    }
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '🔻 Moved ' + bouncedRows.length + ' bounced/blocked contact(s) to the end of the sheet.',
    'SheetMerge List Cleaned',
    5
  );

  return {
    totalRows: rows.length,
    validOrPendingCount: normalRows.length,
    bouncedCount: bouncedRows.length
  };
}

/**
 * Creates or synchronizes a dedicated "✨ Valid Contacts" sheet.
 * Includes all contacts that:
 * 1. Have been sent successfully (Sent, Opened, Clicked, Replied, Positive)
 * 2. Are verified not bounced/blocked
 *
 * @param {Sheet} [sourceSheet]
 * @return {Object} { count: number, sheetName: string }
 */
function buildValidContactsSheet(sourceSheet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  sourceSheet = sourceSheet || getDataSheet();

  var lastRow = sourceSheet.getLastRow();
  var lastCol = sourceSheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return { count: 0, sheetName: VALID_CONTACTS_SHEET_NAME };
  }

  var colMap = ensureStatusColumns(sourceSheet);
  var statusCol = colMap[COL.STATUS];
  var headers = getHeaders(sourceSheet);

  var rawValues = sourceSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var validEntries = [];

  for (var i = 0; i < rawValues.length; i++) {
    var row = rawValues[i];
    var rowIndex = i + 2;
    var status = String(row[statusCol - 1] || '').trim();

    var isValidDelivered = (
      status === STATUS.SENT ||
      status === STATUS.OPENED ||
      status === STATUS.CLICKED ||
      status === STATUS.REPLIED ||
      status === STATUS.POSITIVE ||
      status.indexOf('Opened') !== -1 ||
      status.indexOf('Clicked') !== -1 ||
      status.indexOf('Replied') !== -1 ||
      status.indexOf('Positive') !== -1
    );

    if (isValidDelivered) {
      validEntries.push({
        sourceRowIndex: rowIndex,
        rowValues: row.slice(0),
        status: status
      });
    }
  }

  var targetSheet = ss.getSheetByName(VALID_CONTACTS_SHEET_NAME);
  if (!targetSheet) {
    targetSheet = ss.insertSheet(VALID_CONTACTS_SHEET_NAME);
  } else {
    targetSheet.clear();
  }

  var targetHeaders = headers.slice(0).concat([
    'Validation Status',
    'Verified At'
  ]);

  var outputData = [targetHeaders];
  var timestamp = new Date().toLocaleString();

  validEntries.forEach(function(entry) {
    var rowData = entry.rowValues.slice(0);
    rowData.push('Verified Valid & Delivered', timestamp);
    outputData.push(rowData);
  });

  if (outputData.length > 0) {
    var range = targetSheet.getRange(1, 1, outputData.length, targetHeaders.length);
    range.setValues(outputData);

    // Format Header Row
    var headerRange = targetSheet.getRange(1, 1, 1, targetHeaders.length);
    headerRange
      .setFontWeight('bold')
      .setBackground('#1e293b') // Slate dark
      .setFontColor('#ffffff')
      .setFontSize(10);

    targetSheet.setFrozenRows(1);

    if (outputData.length > 1) {
      var dataRange = targetSheet.getRange(2, 1, outputData.length - 1, targetHeaders.length);
      dataRange.setFontSize(10);
      dataRange.setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);
    }

    for (var c = 1; c <= Math.min(targetHeaders.length, 15); c++) {
      targetSheet.autoResizeColumn(c);
      var width = targetSheet.getColumnWidth(c);
      if (width < 100) targetSheet.setColumnWidth(c, 110);
      if (width > 300) targetSheet.setColumnWidth(c, 280);
    }
  }

  ss.toast(
    '✨ ' + validEntries.length + ' validated contact(s) added to "' + VALID_CONTACTS_SHEET_NAME + '".',
    'Valid Contacts List Updated',
    5
  );

  return {
    count: validEntries.length,
    sheetName: VALID_CONTACTS_SHEET_NAME
  };
}

/**
 * Reorders the data sheet moving contactable leads to the end.
 */
function moveContactableToBottom(sheet) {
  sheet = sheet || getDataSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) return {};

  var colMap = ensureStatusColumns(sheet);
  var statusCol = colMap[COL.STATUS];

  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var rows = range.getValues();

  var processedRows = [];
  var contactableRows = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var status = String(row[statusCol - 1] || '').trim();

    var isProcessed = (
      status !== '' &&
      status !== STATUS.PENDING
    );

    if (isProcessed) {
      processedRows.push(row);
    } else {
      contactableRows.push(row);
    }
  }

  var reordered = processedRows.concat(contactableRows);
  if (reordered.length > 0) {
    range.setValues(reordered);
  }

  return {
    totalRows: rows.length,
    contactedCount: processedRows.length,
    contactableCount: contactableRows.length
  };
}

/**
 * Moves contacted leads to the end of the sheet.
 */
function moveContactedToBottom(sheet) {
  sheet = sheet || getDataSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) return {};

  var colMap = ensureStatusColumns(sheet);
  var statusCol = colMap[COL.STATUS];

  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var rows = range.getValues();

  var pendingRows = [];
  var contactedRows = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var status = String(row[statusCol - 1] || '').trim();

    if (status === '' || status === STATUS.PENDING) {
      pendingRows.push(row);
    } else {
      contactedRows.push(row);
    }
  }

  var reordered = pendingRows.concat(contactedRows);
  if (reordered.length > 0) {
    range.setValues(reordered);
  }

  return {
    totalRows: rows.length,
    pendingCount: pendingRows.length,
    contactedCount: contactedRows.length
  };
}

function _detectEmailColumnIndex(sheet) {
  var headers = getHeaders(sheet);
  var candidates = ['email', 'e-mail', 'mail', 'email address', 'recipient'];
  for (var i = 0; i < headers.length; i++) {
    if (candidates.indexOf(headers[i].toLowerCase().trim()) !== -1) {
      return i + 1;
    }
  }
  return -1;
}
