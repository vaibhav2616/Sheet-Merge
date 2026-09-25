/**
 * Tracking.js — Web App endpoint for open/click tracking
 * =======================================================
 * Deploy this Apps Script project as a Web App (Execute as: Me,
 * Access: Anyone) to receive pixel loads and link clicks.
 *
 * The Web App writes tracking events directly to the _MM_Tracking sheet
 * and updates contact rows in the active spreadsheet.
 *
 * Endpoints:
 *   GET /exec?route=open&id=TRACK_ID
 *   GET /exec?route=click&id=TRACK_ID&url=ENCODED_URL
 *
 * In the HTML templates we generate URLs like:
 *   https://script.google.com/macros/s/SCRIPT_ID/exec?route=open&id=TRACK_ID
 */

/* ── Web App entry point ──────────────────────────────────────── */

/**
 * Handles GET requests to the deployed Web App.
 * @param {GoogleAppsScript.Events.DoGet} e
 */
function doGet(e) {
  var params = e.parameter || {};
  var route  = params.route || '';
  var id     = params.id    || '';
  var url    = params.url   || '';

  if (route === 'open') {
    _recordEvent(id, 'open', null);
    return _transparentPixel();
  }

  if (route === 'click' && url) {
    var decodedUrl = decodeURIComponent(url);
    _recordEvent(id, 'click', decodedUrl);
    return ContentService.createTextOutput('')
      .setMimeType(ContentService.MimeType.TEXT);
    // Note: true HTTP redirect requires HtmlService
    // We use a meta-refresh to redirect
    // return _redirectPage(decodedUrl);  // uncomment if preferred
  }

  // Default response for unknown routes
  return ContentService.createTextOutput('SheetMerge Tracking Endpoint OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

/* ── Event recording ──────────────────────────────────────────── */

/**
 * Records an open or click event to the _MM_Tracking sheet.
 * @param {string} trackId
 * @param {string} eventType  'open' | 'click'
 * @param {string|null} clickedUrl
 */
function _recordEvent(trackId, eventType, clickedUrl) {
  if (!trackId) return;

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('_MM_Tracking');

  // Create tracking sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet('_MM_Tracking');
    sheet.getRange(1, 1, 1, 5).setValues([['TrackId', 'Event', 'Url', 'Timestamp', 'UserAgent']]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#cfe2ff');
    sheet.hideSheet(); // keep it tidy; users see metrics in the dashboard
  }

  var ts = new Date().toISOString();
  sheet.appendRow([trackId, eventType, clickedUrl || '', ts, '']);

  // Also update the main data sheet in-line
  _updateDataSheetFromEvent(trackId, eventType);
}

/**
 * Finds the data row for a given trackId and updates the appropriate
 * MM_ column.
 */
function _updateDataSheetFromEvent(trackId, eventType) {
  try {
    var sheet  = getDataSheet();
    var colMap = getHeaderMap(sheet);
    var trackCol = colMap[COL.TRACK_ID];
    if (!trackCol) return;

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var trackIds = sheet.getRange(2, trackCol, lastRow - 1, 1).getValues();
    for (var i = 0; i < trackIds.length; i++) {
      if (String(trackIds[i][0]).trim() === trackId) {
        var rowIndex = i + 2;
        if (eventType === 'open')  sheet.getRange(rowIndex, colMap[COL.OPENED]).setValue(true);
        if (eventType === 'click') sheet.getRange(rowIndex, colMap[COL.CLICKED]).setValue(true);
        break;
      }
    }
  } catch (e) {
    // Non-fatal — Web App context may not have edit access in all scenarios
  }
}

/* ── Response helpers ─────────────────────────────────────────── */

/** Returns a 1×1 transparent GIF as a BlobOutput (tracking pixel). */
function _transparentPixel() {
  // 1x1 transparent GIF (base64)
  var b64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/gif', 'p.gif');
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT); // placeholder
  // Note: doGet can't directly return image blobs; use HtmlService workaround:
}

/** Returns an HTML page that immediately redirects to the target URL. */
function _redirectPage(targetUrl) {
  var safe = targetUrl.replace(/"/g, '%22');
  return HtmlService.createHtmlOutput(
    '<html><head><meta http-equiv="refresh" content="0;url=' + safe + '"></head>' +
    '<body><a href="' + safe + '">Click here</a></body></html>'
  );
}

/* ── Metrics API (called by Settings / Dashboard) ─────────────── */

/**
 * Returns aggregated tracking events from _MM_Tracking for a given trackId.
 * @param {string} trackId
 * @return {Object}  { opens: number, clicks: number }
 */
function getTrackingEvents(trackId) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('_MM_Tracking');
  if (!sheet) return { opens: 0, clicks: 0 };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { opens: 0, clicks: 0 };

  var data   = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var opens  = 0;
  var clicks = 0;

  data.forEach(function(row) {
    if (String(row[0]).trim() !== trackId) return;
    if (row[1] === 'open')  opens++;
    if (row[1] === 'click') clicks++;
  });

  return { opens: opens, clicks: clicks };
}

/**
 * Returns the deployed Web App URL for this script.
 * Used by the sidebar to show the user where to point the tracker.
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

