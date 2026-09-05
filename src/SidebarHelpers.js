/**
 * SidebarHelpers.js — Small server-side functions called from the Sidebar UI
 * ===========================================================================
 * Keeps MailMerge.js clean; exposes thin wrappers suitable for
 * google.script.run calls from the sidebar HTML.
 */

/**
 * Called by sidebar's duplicate-check flow.
 * @param {string} emailColName
 * @return {Object}  { 'dup@example.com': [2, 7], … }
 */
function _sidebarFindDuplicates(emailColName) {
  var sheet   = getDataSheet();
  var allRows = getDataRows(sheet, 2);
  return findDuplicates(allRows, emailColName || 'Email');
}

/**
 * Returns a sample row rendered as a preview for the sidebar Preview tab.
 * Wrapper for MailMerge.previewEmail with param validation and draft support.
 */
function _sidebarPreviewEmail(previewRow, subjectTpl, bodyTpl, draftId) {
  var row = Math.max(2, parseInt(previewRow) || 2);
  return previewEmail(row, subjectTpl || '', bodyTpl || '', draftId || null);
}

/**
 * Returns all Gmail drafts for the draft picker dropdown in the sidebar.
 */
function _sidebarGetGmailDrafts() {
  return getGmailDraftsList();
}

/**
 * Validates a selected Gmail draft against the current sheet's columns.
 */
function _sidebarValidateDraft(draftId) {
  return validateDraftPlaceholders(draftId);
}

/**
 * Moves contactable email addresses to the last of the list.
 */
function _sidebarMoveContactableToBottom() {
  return moveContactableToBottom();
}

/**
 * Moves contacted email addresses to the bottom of the list.
 */
function _sidebarMoveContactedToBottom() {
  return moveContactedToBottom();
}

/**
 * Synchronizes positive responses into the dedicated sheet.
 */
function _sidebarSyncPositiveResponses() {
  return syncPositiveResponsesSheet();
}

/**
 * Generates or refreshes the in-sheet visual dashboard tab.
 */
function _sidebarCreateDashboardSheet() {
  createOrUpdateDashboardSheet();
  return { success: true };
}

/**
 * Aggregates metrics and returns them to the sidebar.
 */
function getSidebarMetrics() {
  return computeMetrics();
}

/**
 * Returns progress info for display in sidebar.
 */
function getProgressInfo() {
  var cfg = getConfig();
  var lastRow = getLastSentRow();
  return {
    lastSentRow: lastRow,
    nextRow    : Math.max(2, lastRow + 1),
    startRow   : cfg.startRow   || 2,
    dailyLimit : cfg.dailyLimit || 50
  };
}
