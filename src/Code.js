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
var VERSION     = '2.0.0';

/* Single Unified Status column label written into the data sheet */
var COL = {
  STATUS: 'SheetMerge Status'
};

/* Semantic status badge values */
var STATUS = {
  PENDING  : 'Pending',
  SENT     : 'Sent',
  OPENED   : 'Opened',
  CLICKED  : 'Clicked',
  REPLIED  : 'Replied',
  POSITIVE : 'Positive Reply',
  BOUNCED  : 'Bounced',
  BLOCKED  : 'Blocked',
  FAILED   : 'Failed',
  SKIPPED  : 'Skipped',
  DUPLICATE: 'Duplicate'
};

/* Color-coded badge palette (subtle, high-contrast, professional) */
var STATUS_COLORS = {
  'Sent':           { bg: '#dcfce7', text: '#166534' }, // Soft Green
  'Opened':         { bg: '#dbeafe', text: '#1e40af' }, // Soft Blue
  'Clicked':        { bg: '#f3e8ff', text: '#6b21a8' }, // Soft Purple
  'Replied':        { bg: '#e0e7ff', text: '#3730a3' }, // Soft Indigo
  'Positive Reply': { bg: '#d1fae5', text: '#065f46' }, // Rich Emerald
  'Bounced':        { bg: '#fee2e2', text: '#991b1b' }, // Soft Red
  'Blocked':        { bg: '#ffedd5', text: '#9a3412' }, // Soft Orange
  'Failed':         { bg: '#fecaca', text: '#b91c1c' }, // Crimson
  'Duplicate':      { bg: '#fef3c7', text: '#92400e' }, // Amber
  'Skipped':        { bg: '#f1f5f9', text: '#475569' }, // Slate Gray
  'Pending':        { bg: '#f8fafc', text: '#64748b' }  // Neutral
};

/* ── Lifecycle hooks ──────────────────────────────────────────── */

/**
 * Called automatically when the spreadsheet is opened.
 * Builds the SheetMerge menu.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('✉️ ' + ADDON_NAME)
    .addItem('📧 Open Mail Merge Sidebar (v2)',          'showSidebar')
    .addSeparator()
    .addItem('⚡ Run Daily Batch Now (50 Valid Sends)',  'runDailyBatchNow')
    .addItem('⏰ Configure Automated Daily Sending',     'showSettings')
    .addSeparator()
    .addItem('📊 Create / Refresh Visual Dashboard',     'createOrUpdateDashboardSheet')
    .addItem('🎯 Sync Positive Responses to New Sheet',  'syncPositiveResponsesSheet')
    .addItem('✨ Generate / Update Valid Contacts Sheet','buildValidContactsSheet')
    .addItem('🔻 Move Bounced & Blocked to Bottom',      'moveBouncedAndBlockedToBottom')
    .addSeparator()
    .addItem('🔄 Refresh Statuses & Bounces from Inbox', 'checkEmailStatuses')
    .addItem('⭐ Mark Selected Row as Positive',         'markSelectedRowPositive')
    .addItem('🧹 Reset Status Column',                   'clearStatusColumns')
    .addSeparator()
    .addItem('⚙️  Settings & Multi-Account',              'showSettings')
    .addItem('❓ Help & Documentation',                  'showHelp')
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
 * Runs a 50-send daily batch immediately from the menu.
 */
function runDailyBatchNow() {
  dailyAutomatedMerge();
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

