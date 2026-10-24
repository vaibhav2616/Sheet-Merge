/**
 * PositiveResponsesSheet.js — Positive leads synchronization (v2 Unified Status)
 * ==============================================================================
 * Synchronizes positive replies and high-intent leads into "🎯 Positive Responses"
 * with all original row columns and response analytics.
 */

var POSITIVE_SHEET_NAME = '🎯 Positive Responses';

/**
 * Scans the data sheet for contacts who responded positively,
 * and synchronizes all their data into the dedicated sheet.
 *
 * @param {Sheet} [sourceSheet]
 * @return {Object} { count: number, sheetName: string }
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
  var statusCol = colMap[COL.STATUS];
  var emailColIdx = _detectEmailColumnIndex(sourceSheet);

  var rawValues = sourceSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var positiveEntries = [];

  for (var i = 0; i < rawValues.length; i++) {
    var row = rawValues[i];
    var rowIndex = i + 2;
    var statusStr = String(row[statusCol - 1] || '').trim();

    if (
      statusStr === STATUS.POSITIVE ||
      statusStr.toLowerCase().indexOf('positive') !== -1
    ) {
      var email = emailColIdx > 0 ? String(row[emailColIdx - 1] || '') : '';

      positiveEntries.push({
        sourceRowIndex: rowIndex,
        originalRowValues: row.slice(0),
        email: email,
        syncedAt: new Date().toLocaleString()
      });
    }
  }

  var targetSheet = ss.getSheetByName(POSITIVE_SHEET_NAME);
  if (!targetSheet) {
    targetSheet = ss.insertSheet(POSITIVE_SHEET_NAME);
  } else {
    targetSheet.clear();
  }

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

  if (outputData.length > 0) {
    var range = targetSheet.getRange(1, 1, outputData.length, targetHeaders.length);
    range.setValues(outputData);

    var headerRange = targetSheet.getRange(1, 1, 1, targetHeaders.length);
    headerRange
      .setFontWeight('bold')
      .setBackground('#065f46') // Rich emerald
      .setFontColor('#ffffff')
      .setFontSize(10);

    targetSheet.setFrozenRows(1);

    if (outputData.length > 1) {
      var dataRange = targetSheet.getRange(2, 1, outputData.length - 1, targetHeaders.length);
      dataRange.setFontSize(10);
      dataRange.setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);
    }

    for (var c = 1; c <= Math.min(targetHeaders.length, 16); c++) {
      targetSheet.autoResizeColumn(c);
      var width = targetSheet.getColumnWidth(c);
      if (width < 100) targetSheet.setColumnWidth(c, 110);
      if (width > 300) targetSheet.setColumnWidth(c, 280);
    }
  }

  ss.toast(
    '🎯 ' + positiveEntries.length + ' positive response(s) synchronized to "' + POSITIVE_SHEET_NAME + '".',
    'SheetMerge Positive Leads Sync',
    5
  );

  return {
    count: positiveEntries.length,
    sheetName: POSITIVE_SHEET_NAME
  };
}

/**
 * Marks the user's currently active row as positive response.
 */
function markSelectedRowPositive() {
  var sheet = getDataSheet();
  var colMap = ensureStatusColumns(sheet);

  var selection = sheet.getActiveRange();
  if (!selection) {
    SpreadsheetApp.getUi().alert('Please select a row to mark as positive response.');
    return;
  }

  var startRow = selection.getRow();
  var numRows  = selection.getNumRows();

  if (startRow < 2) {
    SpreadsheetApp.getUi().alert('Cannot mark header row. Please select contact rows.');
    return;
  }

  for (var r = 0; r < numRows; r++) {
    var curRow = startRow + r;
    setCellStatus(sheet, curRow, STATUS.POSITIVE, {
      details: 'Marked positive manually by user',
      timestamp: new Date().toISOString()
    });
  }

  syncPositiveResponsesSheet(sheet);
  createOrUpdateDashboardSheet(sheet);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '⭐ Marked ' + numRows + ' contact(s) as Positive Reply.',
    'Status Updated',
    4
  );
}
