/**
 * PositiveResponsesSheet.js — Positive leads synchronization
 * ==========================================================
 * Reflects positive responses into a dedicated "🎯 Positive Responses"
 * sheet with ALL original contact data, response timestamp, sentiment,
 * and follow-up fields.
 */

var POSITIVE_SHEET_NAME = '🎯 Positive Responses';

/**
 * Scans the data sheet for contacts who responded positively,
 * and synchronizes all their data into the dedicated sheet.
 *
 * @param {Sheet} [sourceSheet]
 * @return {Object}  { count: number, sheetName: string }
 */
function syncPositiveResponsesSheet(sourceSheet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  sourceSheet = sourceSheet || getDataSheet();

  var lastRow = sourceSheet.getLastRow();
  var lastCol = sourceSheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return { count: 0, sheetName: POSITIVE_SHEET_NAME };
  }

  var colMap = ensureStatusColumns(sourceSheet);
  var headers = getHeaders(sourceSheet);

  var positiveCol = colMap[COL.POSITIVE];
  var repliedCol  = colMap[COL.REPLIED];
  var emailColIdx = _detectEmailColumnIndex(sourceSheet);

  // Read all data rows
  var rawValues = sourceSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var positiveEntries = [];

  for (var i = 0; i < rawValues.length; i++) {
    var row = rawValues[i];
    var rowIndex = i + 2;

    var isPositiveExplicit = positiveCol && (row[positiveCol - 1] === true || String(row[positiveCol - 1]).toLowerCase() === 'true');
    var isReplied = repliedCol && (row[repliedCol - 1] === true || String(row[repliedCol - 1]).toLowerCase() === 'true');
    var statusStr = String(row[colMap[COL.STATUS] - 1] || '').trim().toLowerCase();

    // Check if explicitly marked positive or replied with positive intent
    if (isPositiveExplicit || statusStr === 'positive' || (isReplied && isPositiveExplicit)) {
      var email = emailColIdx > 0 ? String(row[emailColIdx - 1] || '') : '';
      var sentAt = colMap[COL.SENT_AT] ? row[colMap[COL.SENT_AT] - 1] : '';

      positiveEntries.push({
        sourceRowIndex: rowIndex,
        originalRowValues: row.slice(0), // copy of all columns
        email: email,
        sentAt: sentAt,
        syncedAt: new Date().toLocaleString()
      });
    }
  }

  // Get or create the dedicated sheet
  var targetSheet = ss.getSheetByName(POSITIVE_SHEET_NAME);
  if (!targetSheet) {
    targetSheet = ss.insertSheet(POSITIVE_SHEET_NAME);
  } else {
    targetSheet.clear();
  }

  // Build target headers: all original headers PLUS response intelligence headers
  var targetHeaders = headers.slice(0).concat([
    'Response Status',
    'Detected Sentiment',
    'Sync Timestamp',
    'Source Sheet Row',
    'Follow-up Status'
  ]);

  var outputData = [targetHeaders];

  positiveEntries.forEach(function(entry) {
    var rowData = entry.originalRowValues.slice(0);
    rowData.push(
      'Interested / Positive',
      'High Intent',
      entry.syncedAt,
      entry.sourceRowIndex,
      'Pending Outreach'
    );
    outputData.push(rowData);
  });

  if (outputData.length > 0 && targetHeaders.length > 0) {
    var range = targetSheet.getRange(1, 1, outputData.length, targetHeaders.length);
    range.setValues(outputData);

    // Format Header Row
    var headerRange = targetSheet.getRange(1, 1, 1, targetHeaders.length);
    headerRange
      .setFontWeight('bold')
      .setBackground('#137333')
      .setFontColor('#ffffff')
      .setFontSize(10);

    targetSheet.setFrozenRows(1);

    // Format alternating rows and borders if data rows exist
    if (outputData.length > 1) {
      var dataRange = targetSheet.getRange(2, 1, outputData.length - 1, targetHeaders.length);
      dataRange.setFontSize(10);
      dataRange.setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
    }

    // Auto-fit column widths (with safety bounds)
    for (var c = 1; c <= Math.min(targetHeaders.length, 18); c++) {
      targetSheet.autoResizeColumn(c);
      var width = targetSheet.getColumnWidth(c);
      if (width < 100) targetSheet.setColumnWidth(c, 110);
      if (width > 300) targetSheet.setColumnWidth(c, 300);
    }
  }

  ss.toast(
    '🎯 ' + positiveEntries.length + ' positive response(s) synchronized to "' + POSITIVE_SHEET_NAME + '".',
    'SheetMerge Positive Leads Sync',
    6
  );

  return {
    count: positiveEntries.length,
    sheetName: POSITIVE_SHEET_NAME
  };
}

/**
 * Marks the user's currently active/selected row(s) in the sheet as
 * POSITIVE response and immediately syncs them to the Positive Responses sheet.
 */
function markSelectedRowPositive() {
  var sheet = getDataSheet();
  var colMap = ensureStatusColumns(sheet);
  var positiveCol = colMap[COL.POSITIVE];
  var repliedCol  = colMap[COL.REPLIED];

  var selection = sheet.getActiveRange();
  if (!selection) {
    SpreadsheetApp.getUi().alert('Please select a row to mark as positive response.');
    return;
  }

  var startRow = selection.getRow();
  var numRows  = selection.getNumRows();

  if (startRow < 2) {
    SpreadsheetApp.getUi().alert('Cannot mark header row (row 1). Please select contact data rows.');
    return;
  }

  var markedCount = 0;
  for (var r = 0; r < numRows; r++) {
    var curRow = startRow + r;
    if (positiveCol) sheet.getRange(curRow, positiveCol).setValue(true);
    if (repliedCol)  sheet.getRange(curRow, repliedCol).setValue(true);
    markedCount++;
  }

  // Trigger sync to the Positive Responses sheet
  syncPositiveResponsesSheet(sheet);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '⭐ Marked ' + markedCount + ' contact(s) as Positive Response and updated ' + POSITIVE_SHEET_NAME + '.',
    'Success',
    5
  );
}
