/**
 * ContactManager.js — Contact list ordering and lead classification
 * ==================================================================
 * Handles list organization: moving contactable addresses to the end of
 * the sheet, grouping sent/completed leads, and row-level classification.
 */

/**
 * Reorders the data sheet so that all email addresses that CAN BE CONTACTED
 * (empty status, Pending, not yet processed) are moved to the LAST of the list.
 *
 * Rows already processed (Sent, Failed, Bounced, Duplicate, Skipped) remain
 * at the top. This allows users to easily anchor where completed batches end
 * and where new contactable leads begin.
 *
 * @param {Sheet} [sheet]
 * @return {Object}  { totalRows, contactedCount, contactableCount, startRowOfContactable }
 */
function moveContactableToBottom(sheet) {
  sheet = sheet || getDataSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    throw new Error('The active sheet contains no data rows to reorder.');
  }

  var colMap = ensureStatusColumns(sheet);
  var statusCol = colMap[COL.STATUS];
  var emailColIndex = _detectEmailColumnIndex(sheet);

  // Read all data rows (excluding row 1 header)
  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var rows = range.getValues();

  var processedRows = [];
  var contactableRows = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var status = String(row[statusCol - 1] || '').trim().toLowerCase();
    var email = emailColIndex > 0 ? String(row[emailColIndex - 1] || '').trim() : '';

    // Contactable criteria: has an email address and status is neither Sent, Duplicate, Failed, nor Bounced
    var isProcessed = (
      status === STATUS.SENT.toLowerCase() ||
      status === STATUS.DUPLICATE.toLowerCase() ||
      status === STATUS.FAILED.toLowerCase() ||
      status === 'bounced' ||
      status === 'blocked'
    );

    if (isProcessed) {
      processedRows.push(row);
    } else {
      contactableRows.push(row);
    }
  }

  // Combine: processed rows first, contactable rows moved to the last of the list
  var reordered = processedRows.concat(contactableRows);

  if (reordered.length > 0) {
    range.setValues(reordered);
  }

  var startRowContactable = 2 + processedRows.length;

  var result = {
    totalRows: rows.length,
    contactedCount: processedRows.length,
    contactableCount: contactableRows.length,
    startRowOfContactable: contactableRows.length > 0 ? startRowContactable : null
  };

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '✅ Reordered: ' + contactableRows.length + ' contactable leads moved to bottom (Row ' + startRowContactable + '+).',
    'SheetMerge List Reordered',
    5
  );

  return result;
}

/**
 * Alternative ordering: moves already-contacted / sent rows to the bottom,
 * placing pending contactable leads at the top.
 *
 * @param {Sheet} [sheet]
 * @return {Object}
 */
function moveContactedToBottom(sheet) {
  sheet = sheet || getDataSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    throw new Error('The active sheet contains no data rows to reorder.');
  }

  var colMap = ensureStatusColumns(sheet);
  var statusCol = colMap[COL.STATUS];

  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var rows = range.getValues();

  var contactableRows = [];
  var processedRows = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var status = String(row[statusCol - 1] || '').trim().toLowerCase();

    var isProcessed = (
      status === STATUS.SENT.toLowerCase() ||
      status === STATUS.DUPLICATE.toLowerCase() ||
      status === STATUS.FAILED.toLowerCase() ||
      status === 'bounced' ||
      status === 'blocked'
    );

    if (isProcessed) {
      processedRows.push(row);
    } else {
      contactableRows.push(row);
    }
  }

  var reordered = contactableRows.concat(processedRows);
  if (reordered.length > 0) {
    range.setValues(reordered);
  }

  var result = {
    totalRows: rows.length,
    contactableCount: contactableRows.length,
    contactedCount: processedRows.length
  };

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '✅ Reordered: ' + processedRows.length + ' contacted leads moved to bottom.',
    'SheetMerge List Reordered',
    5
  );

  return result;
}

/**
 * Detects the 1-based index of the email column in the given sheet.
 * @param {Sheet} sheet
 * @return {number}
 */
function _detectEmailColumnIndex(sheet) {
  var headers = getHeaders(sheet);
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].trim().toLowerCase();
    if (h === 'email' || h === 'email address' || h === 'e-mail' || h === 'mail') {
      return i + 1;
    }
  }
  return 1;
}
