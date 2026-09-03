/**
 * SheetMerge - Open Source Mail Merge for Google Sheets
 * =====================================================
 * Main entry point: menu creation and dialog launchers.
 *
 * License: MIT
 * Author:  SheetMerge Contributors
 * Repo:    https://github.com/yourusername/sheetmerge
 */

/* ── Constants ────────────────────────────────────────────────── */
var ADDON_NAME  = 'SheetMerge';
var VERSION     = '1.0.0';

/* Status column labels written into the data sheet */
var COL = {
  STATUS    : 'MM_Status',
  SENT_AT   : 'MM_SentAt',
  MESSAGE_ID: 'MM_MessageId',
  TRACK_ID  : 'MM_TrackId',
  OPENED    : 'MM_Opened',
  CLICKED   : 'MM_Clicked',
  REPLIED   : 'MM_Replied',
  POSITIVE  : 'MM_Positive',
  BOUNCED   : 'MM_Bounced',
  BLOCKED   : 'MM_Blocked',
  ERROR     : 'MM_Error'
};

/* Possible values for MM_Status */
var STATUS = {
  PENDING  : 'Pending',
  SENT     : 'Sent',
  FAILED   : 'Failed',
  SKIPPED  : 'Skipped',
  DUPLICATE: 'Duplicate'
};

/* ── Lifecycle hooks ──────────────────────────────────────────── */

/**
 * Called automatically when the spreadsheet is opened.
 * Builds the SheetMerge menu.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('✉️ ' + ADDON_NAME)
    .addItem('📧 Open Mail Merge Sidebar', 'showSidebar')
    .addSeparator()
    .addItem('📊 Create / Refresh Visual Dashboard Sheet', 'createOrUpdateDashboardSheet')
    .addItem('🎯 Sync Positive Responses to New Sheet',    'syncPositiveResponsesSheet')
    .addItem('📋 Move Contactable Leads to Bottom',        'moveContactableToBottom')
    .addItem('📋 Move Contacted Leads to Bottom',          'moveContactedToBottom')
    .addSeparator()
    .addItem('📈 Popup Metrics Dashboard',                'showDashboard')
    .addItem('⚙️  Settings',                              'showSettings')
    .addSeparator()
    .addItem('🔄 Refresh Email Statuses',                 'checkEmailStatuses')
    .addItem('⭐ Mark Selected Row as Positive Response',  'markSelectedRowPositive')
    .addItem('🧹 Reset Status Columns',                   'clearStatusColumns')
    .addSeparator()
    .addItem('📥 Export Config (JSON)',                   'exportConfig')
    .addItem('📤 Import Config (JSON)',                   'importConfig')
    .addSeparator()
    .addItem('❓ Help & Documentation',                   'showHelp')
    .addToUi();
}

/**
 * Runs when the add-on is installed (not needed for direct Scripts, but
 * kept for future packaging as a Google Workspace Add-on).
 */
function onInstall() {
  onOpen();
}

/* ── Dialog / sidebar launchers ──────────────────────────────── */

function createTemplate(filename) {
  try {
    return HtmlService.createTemplateFromFile(filename);
  } catch (e) {
    try {
      return HtmlService.createTemplateFromFile('html/' + filename);
    } catch (e2) {
      throw new Error('Could not find HTML template: ' + filename);
    }
  }
}

function showSidebar() {
  var html = createTemplate('Sidebar')
    .evaluate()
    .setTitle('✉️ ' + ADDON_NAME + ' v' + VERSION)
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

function showDashboard() {
  var html = createTemplate('Dashboard')
    .evaluate()
    .setWidth(960)
    .setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, '📊 ' + ADDON_NAME + ' — Metrics Dashboard');
}

function showSettings() {
  var html = createTemplate('Settings')
    .evaluate()
    .setWidth(620)
    .setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, '⚙️ ' + ADDON_NAME + ' — Settings');
}

function showHelp() {
  var html = HtmlService.createHtmlOutput(
    '<html><body style="font-family:sans-serif;padding:20px">' +
    '<h2>SheetMerge Help</h2>' +
    '<p>Full documentation: <a href="https://github.com/yourusername/sheetmerge#readme" target="_blank">GitHub README</a></p>' +
    '<p>Report bugs: <a href="https://github.com/yourusername/sheetmerge/issues" target="_blank">GitHub Issues</a></p>' +
    '</body></html>'
  ).setWidth(420).setHeight(180);
  SpreadsheetApp.getUi().showModalDialog(html, 'Help');
}

/**
 * Helper used by HTML templates to inline other HTML files.
 * Usage inside a template: <?!= include('Styles') ?>
 *
 * @param {string} filename  Name of the .html file without extension.
 * @return {string}          Raw HTML content.
 */
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    return HtmlService.createTemplateFromFile('html/' + filename).getContent();
  }
}
