/**
 * Config.js — Configuration management via PropertiesService
 * ==========================================================
 * All user-configurable values are stored in Script Properties so
 * they persist across sessions and survive sidebar reloads.
 */

/* ── Default values ───────────────────────────────────────────── */
var DEFAULTS = {
  emailColumn       : 'Email',       // Header name for the recipient column
  trackingBackendUrl: '',            // http://localhost:8000  (FastAPI server)
  sendDelay         : 2,            // seconds between sends (throttle)
  batchSize         : 10,           // emails per batch (pause between batches)
  batchPause        : 30,           // seconds to pause between batches
  dailyLimit        : 50,           // max emails per day per account
  subjectTemplate   : '',           // subject with {{placeholders}}
  bodyTemplate      : '',           // HTML body with {{placeholders}}
  senderName        : '',           // "Display Name" shown to recipients
  replyToEmail      : '',           // reply-to address (optional)
  enableOpenTracking : true,
  enableClickTracking: true,
  startRow          : 2,            // 1-indexed row to start from (2 = first data row)
  lastSentRow       : 1            // tracks progress; 1 means nothing sent yet
};

/* ── Private helpers ──────────────────────────────────────────── */

function _getProps() {
  return PropertiesService.getScriptProperties();
}

function _key(k) {
  return ADDON_NAME + '_' + k;
}

/* ── Public API ───────────────────────────────────────────────── */

/**
 * Returns all settings merged with defaults.
 * @return {Object}
 */
function getConfig() {
  var props = _getProps();
  var cfg   = {};
  Object.keys(DEFAULTS).forEach(function(k) {
    var stored = props.getProperty(_key(k));
    if (stored === null || stored === undefined) {
      cfg[k] = DEFAULTS[k];
    } else {
      // Coerce booleans and numbers back to their native types
      if (stored === 'true')  cfg[k] = true;
      else if (stored === 'false') cfg[k] = false;
      else if (!isNaN(stored) && stored.trim() !== '') cfg[k] = Number(stored);
      else cfg[k] = stored;
    }
  });
  return cfg;
}

/**
 * Saves a partial config object. Only keys present in DEFAULTS are accepted.
 * @param {Object} partial
 */
function saveConfig(partial) {
  var props = _getProps();
  Object.keys(partial).forEach(function(k) {
    if (k in DEFAULTS) {
      props.setProperty(_key(k), String(partial[k]));
    }
  });
}

/**
 * Resets a single key to its default value.
 * @param {string} key
 */
function resetConfigKey(key) {
  if (key in DEFAULTS) {
    _getProps().setProperty(_key(key), String(DEFAULTS[key]));
  }
}

/**
 * Resets ALL settings to defaults.
 */
function resetAllConfig() {
  var props = _getProps();
  Object.keys(DEFAULTS).forEach(function(k) {
    props.setProperty(_key(k), String(DEFAULTS[k]));
  });
}

/**
 * Exports config as a JSON string (for backup / cross-account transfer).
 * Does NOT include secrets or OAuth tokens — those are per-account.
 * @return {string} JSON
 */
function exportConfigJson() {
  return JSON.stringify(getConfig(), null, 2);
}

/**
 * Imports config from a JSON string (produced by exportConfigJson).
 * @param {string} jsonStr
 */
function importConfigJson(jsonStr) {
  var parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Invalid JSON: ' + e.message);
  }
  saveConfig(parsed);
}

/* ── Menu-linked wrappers ─────────────────────────────────────── */

function exportConfig() {
  var json = exportConfigJson();
  var html = HtmlService.createHtmlOutput(
    '<textarea style="width:100%;height:260px;font-family:monospace">' +
    json + '</textarea>' +
    '<p style="font-size:12px">Copy the text above, save it as a .json file.</p>'
  ).setWidth(500).setHeight(340);
  SpreadsheetApp.getUi().showModalDialog(html, '📥 Export Config');
}

function importConfig() {
  var html = HtmlService.createHtmlOutput(
    '<p>Paste your exported config JSON below:</p>' +
    '<textarea id="cfg" style="width:100%;height:220px;font-family:monospace"></textarea>' +
    '<br><button onclick="google.script.run' +
    '.withSuccessHandler(function(){google.script.host.close()})' +
    '.withFailureHandler(function(e){alert(e.message)})' +
    '.importConfigJson(document.getElementById(\'cfg\').value)">Import</button>'
  ).setWidth(500).setHeight(320);
  SpreadsheetApp.getUi().showModalDialog(html, '📤 Import Config');
}


