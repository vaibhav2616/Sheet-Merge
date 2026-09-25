/**
 * Config.js — Configuration management via PropertiesService (v2)
 * ===============================================================
 * Stores persistent user configurations, automation schedules,
 * anti-spam humanization preferences, and multi-account metadata.
 */

var DEFAULTS = {
  emailColumn           : 'Email',       // Header name for recipient email
  trackingBackendUrl    : '',            // Optional tracking endpoint (Apps Script Web App or custom URL)
  sendDelay             : 15,            // Natural seconds between sends (12-30s recommended)
  randomJitter          : true,          // Add +/- 35% random timing jitter to prevent spam pattern
  dailyLimit            : 50,            // Daily target for successful sends
  dailyTriggerEnabled   : false,         // Daily automatic trigger toggle
  dailyTriggerHour      : 9,             // 9 AM daily
  subjectTemplate       : '',            // Subject with {{placeholders}}
  bodyTemplate          : '',            // Body with {{placeholders}}
  draftId               : '',            // Selected Gmail draft ID
  senderName            : '',            // Display name
  replyToEmail          : '',            // Reply-To header
  enableOpenTracking    : true,
  enableClickTracking   : true,
  startRow              : 2,             // 1-indexed start row
  lastSentRow           : 1,             // Progress marker
  activeAccountIndex    : 0,             // Multi-account rotation pointer
  configuredAccounts    : ''             // Comma-separated list or JSON of registered accounts
};

function _getProps() {
  return PropertiesService.getScriptProperties();
}

function _key(k) {
  return ADDON_NAME + '_' + k;
}

function getConfig() {
  var props = _getProps();
  var cfg   = {};
  Object.keys(DEFAULTS).forEach(function(k) {
    var stored = props.getProperty(_key(k));
    if (stored === null || stored === undefined) {
      cfg[k] = DEFAULTS[k];
    } else {
      if (stored === 'true')  cfg[k] = true;
      else if (stored === 'false') cfg[k] = false;
      else if (!isNaN(stored) && stored.trim() !== '') cfg[k] = Number(stored);
      else cfg[k] = stored;
    }
  });
  return cfg;
}

function saveConfig(partial) {
  var props = _getProps();
  Object.keys(partial).forEach(function(k) {
    if (k in DEFAULTS) {
      props.setProperty(_key(k), String(partial[k]));
    }
  });
}

function resetAllConfig() {
  var props = _getProps();
  Object.keys(DEFAULTS).forEach(function(k) {
    props.setProperty(_key(k), String(DEFAULTS[k]));
  });
}

function exportConfigJson() {
  return JSON.stringify(getConfig(), null, 2);
}

function importConfigJson(jsonStr) {
  try {
    var parsed = JSON.parse(jsonStr);
    saveConfig(parsed);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
