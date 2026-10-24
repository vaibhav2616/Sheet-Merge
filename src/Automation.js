/**
 * Automation.js — Automated Daily Triggers and Time-Driven Execution
 * ===================================================================
 * Configures time-driven triggers so SheetMerge automatically sends
 * 50 successful emails daily without manual intervention.
 */

var AUTOMATION_TRIGGER_FUNCTION = 'dailyAutomatedMerge';

/**
 * Entry point executed by Google Apps Script Time-Driven Trigger.
 * Sends the configured daily quota (e.g. 50 successful emails)
 * starting from where it left off, and moves any bounced/blocked leads.
 */
function dailyAutomatedMerge() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    Logger.log('Automated merge skipped: another instance is running.');
    return;
  }

  try {
    var cfg = getConfig();
    var lastRow = getLastSentRow();
    var startRow = Math.max(2, lastRow + 1);

    Logger.log('Starting automated daily merge from row ' + startRow);

    var params = {
      startRow: startRow,
      endRow: 0,
      emailColumn: cfg.emailColumn || 'Email',
      subjectTemplate: cfg.subjectTemplate || '',
      bodyTemplate: cfg.bodyTemplate || '',
      draftId: cfg.draftId || null,
      senderName: cfg.senderName || '',
      replyToEmail: cfg.replyToEmail || '',
      trackingBackendUrl: cfg.trackingBackendUrl || '',
      enableOpenTracking: cfg.enableOpenTracking !== false,
      enableClickTracking: cfg.enableClickTracking !== false,
      dailyLimit: cfg.dailyLimit || 50,
      sendDelay: cfg.sendDelay || 15,
      randomJitter: true,
      autoMoveBouncedToBottom: true,
      autoBuildValidList: true
    };

    var result = runMailMerge(params);
    Logger.log('Automated daily merge finished: ' + JSON.stringify(result));

    // Check statuses for any recent bounces/replies from previous batch
    try {
      checkEmailStatuses();
    } catch (e) {
      Logger.log('Post-automation checkEmailStatuses note: ' + e.message);
    }

  } catch (err) {
    Logger.log('Error in dailyAutomatedMerge: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Installs or updates a daily trigger at the specified hour (0-23).
 *
 * @param {number} [hour=9] Hour of day in sheet's timezone (default 9 AM)
 * @return {Object} { success: boolean, hour: number, triggerId: string }
 */
function setupDailyTrigger(hour) {
  hour = (hour !== undefined && hour !== null) ? parseInt(hour, 10) : 9;
  if (isNaN(hour) || hour < 0 || hour > 23) hour = 9;

  // Remove any existing automated triggers first
  removeDailyTrigger();

  var trigger = ScriptApp.newTrigger(AUTOMATION_TRIGGER_FUNCTION)
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .create();

  saveConfig({
    dailyTriggerEnabled: true,
    dailyTriggerHour: hour
  });

  return {
    success: true,
    hour: hour,
    triggerId: trigger.getUniqueId()
  };
}

/**
 * Removes all automated daily triggers.
 *
 * @return {Object} { success: boolean, removedCount: number }
 */
function removeDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === AUTOMATION_TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

  saveConfig({
    dailyTriggerEnabled: false
  });

  return {
    success: true,
    removedCount: removed
  };
}

/**
 * Returns the status of the automated daily trigger.
 *
 * @return {Object} { enabled: boolean, hour: number }
 */
function getDailyTriggerStatus() {
  var triggers = ScriptApp.getProjectTriggers();
  var active = false;

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === AUTOMATION_TRIGGER_FUNCTION) {
      active = true;
      break;
    }
  }

  var cfg = getConfig();
  return {
    enabled: active,
    hour: cfg.dailyTriggerHour !== undefined ? cfg.dailyTriggerHour : 9
  };
}
