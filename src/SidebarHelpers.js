/**
 * SidebarHelpers.js — Server-side functions invoked from Sidebar & Settings UI (v2)
 * =================================================================================
 */

function _sidebarFindDuplicates(emailColName) {
  var sheet   = getDataSheet();
  var allRows = getDataRows(sheet, 2);
  return findDuplicates(allRows, emailColName || 'Email');
}

function _sidebarPreviewEmail(previewRow, subjectTpl, bodyTpl, draftId) {
  var row = Math.max(2, parseInt(previewRow) || 2);
  return previewEmail(row, subjectTpl || '', bodyTpl || '', draftId || null);
}

function _sidebarGetGmailDrafts() {
  return getGmailDraftsList();
}

function _sidebarValidateDraft(draftId) {
  return validateDraftPlaceholders(draftId);
}

function _sidebarMoveBouncedToBottom() {
  return moveBouncedAndBlockedToBottom();
}

function _sidebarBuildValidList() {
  return buildValidContactsSheet();
}

function _sidebarSyncPositiveResponses() {
  return syncPositiveResponsesSheet();
}

function _sidebarCreateDashboardSheet() {
  createOrUpdateDashboardSheet();
  return { success: true };
}

function getSidebarMetrics() {
  return computeMetrics();
}

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

function _sidebarSetupDailyTrigger(hour) {
  return setupDailyTrigger(hour);
}

function _sidebarRemoveDailyTrigger() {
  return removeDailyTrigger();
}

function _sidebarGetDailyTriggerStatus() {
  return getDailyTriggerStatus();
}

function _sidebarStopMerge() {
  return triggerStopMerge();
}

function _sidebarSendTestEmail(params) {
  return sendTestEmail(params);
}

function _sidebarGetQuota() {
  return getMergeQuota();
}

