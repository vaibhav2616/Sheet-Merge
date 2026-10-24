/**
 * tests/SheetMerge.test.js
 * ========================
 * Jest-based virtual scenario unit tests for Apps Script pure-logic functions.
 * Run: npx jest tests/SheetMerge.test.js
 */

/* ── GAS global stubs ───────────────────────────────────────── */
global.Utilities = {
  base64Encode: (s) => Buffer.from(s).toString('base64'),
  sleep: jest.fn(),
};
global.Logger = { log: jest.fn() };
global.ADDON_NAME = 'SheetMerge';
global.COL = { STATUS: 'SheetMerge Status' };
global.STATUS = {
  PENDING:'Pending',SENT:'Sent',OPENED:'Opened',CLICKED:'Clicked',
  REPLIED:'Replied',POSITIVE:'Positive Reply',BOUNCED:'Bounced',
  BLOCKED:'Blocked',FAILED:'Failed',SKIPPED:'Skipped',DUPLICATE:'Duplicate',
};

/* ── Pure logic extracted for testing ──────────────────────── */
function renderTemplate(template, rowData) {
  if (!template) return '';
  return template.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
    var trimmed = key.trim();
    var match = Object.keys(rowData).find(k => k.toLowerCase() === trimmed.toLowerCase());
    return match !== undefined ? String(rowData[match]) : '';
  });
}
function _isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function _generateTrackId(email, rowIndex) {
  var raw = email + '_' + rowIndex + '_' + Date.now();
  return Utilities.base64Encode(raw).replace(/[^a-zA-Z0-9]/g,'').substring(0,32);
}
function injectTrackingPixel(body, trackId, backendUrl) {
  if (!backendUrl) return body;
  var pixelUrl = backendUrl.replace(/\/$/, '') + '/track/open/' + encodeURIComponent(trackId);
  var pixel = '<img src="' + pixelUrl + '" width="1" height="1" alt="" style="display:none" />';
  if (body.toLowerCase().indexOf('</body>') !== -1)
    return body.replace(/<\/body>/i, pixel + '</body>');
  return body + pixel;
}
function injectClickTracking(body, trackId, backendUrl) {
  if (!backendUrl) return body;
  var base = backendUrl.replace(/\/$/, '') + '/track/click/' + encodeURIComponent(trackId) + '?url=';
  return body.replace(/href="(https?:\/\/[^"]+)"/gi, (_, url) => 'href="' + base + encodeURIComponent(url) + '"');
}
function findDuplicates(dataRows, emailColName) {
  var seen = {}, dupes = {};
  dataRows.forEach(r => {
    var email = String(r.data[emailColName] || '').trim().toLowerCase();
    if (!email) return;
    if (!seen[email]) seen[email] = [r.rowIndex];
    else seen[email].push(r.rowIndex);
  });
  Object.keys(seen).forEach(e => { if (seen[e].length > 1) dupes[e] = seen[e]; });
  return dupes;
}

/* ── Test suites ──────────────────────────────────────────── */
describe('renderTemplate', () => {
  test('MM-TPL-01: single placeholder replaced', () =>
    expect(renderTemplate('Hello {{Name}}!', {Name:'Alice'})).toBe('Hello Alice!'));
  test('MM-TPL-02: case-insensitive key match', () =>
    expect(renderTemplate('Dear {{firstname}}', {FirstName:'Bob'})).toBe('Dear Bob'));
  test('MM-TPL-03: multiple placeholders', () =>
    expect(renderTemplate('{{g}} {{n}}', {g:'Hi',n:'Carol'})).toBe('Hi Carol'));
  test('MM-TPL-04: missing key = empty string', () =>
    expect(renderTemplate('{{Unknown}}', {})).toBe(''));
  test('MM-TPL-05: null template = empty string', () =>
    expect(renderTemplate(null, {})).toBe(''));
  test('MM-TPL-06: numeric values stringified', () =>
    expect(renderTemplate('{{id}}', {id:42})).toBe('42'));
  test('MM-TPL-07: no placeholders unchanged', () =>
    expect(renderTemplate('Plain', {})).toBe('Plain'));
});

describe('_isValidEmail', () => {
  test('MM-EMAIL-01: valid email', () => expect(_isValidEmail('test@example.com')).toBe(true));
  test('MM-EMAIL-02: no TLD', () => expect(_isValidEmail('test@nodot')).toBe(false));
  test('MM-EMAIL-03: no @', () => expect(_isValidEmail('testexample.com')).toBe(false));
  test('MM-EMAIL-04: space in email', () => expect(_isValidEmail('test @example.com')).toBe(false));
  test('MM-EMAIL-05: empty string', () => expect(_isValidEmail('')).toBe(false));
  test('MM-EMAIL-06: subdomain', () => expect(_isValidEmail('a@b.c.com')).toBe(true));
  test('MM-EMAIL-07: plus addressing', () => expect(_isValidEmail('a+tag@example.com')).toBe(true));
});

describe('_generateTrackId', () => {
  test('MM-TID-01: returns 32-char alphanumeric string', () => {
    var id = _generateTrackId('test@x.com', 5);
    expect(id).toMatch(/^[a-zA-Z0-9]{1,32}$/);
    expect(id.length).toBeLessThanOrEqual(32);
  });
  test('MM-TID-02: different inputs yield different IDs', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1000);
    var id1 = _generateTrackId('a@x.com', 1);
    jest.setSystemTime(2000);
    var id2 = _generateTrackId('b@x.com', 2);
    expect(id1).not.toBe(id2);
    jest.useRealTimers();
  });
});

describe('injectTrackingPixel', () => {
  const URL='https://t.example.com', TID='abc';
  test('MM-TRK-01: pixel appended when no </body>', () => {
    expect(injectTrackingPixel('<p>Hi</p>', TID, URL)).toContain('/track/open/');
  });
  test('MM-TRK-02: pixel before </body>', () => {
    var r = injectTrackingPixel('<html><body>Hi</body></html>', TID, URL);
    expect(r.indexOf('<img')).toBeLessThan(r.indexOf('</body>'));
  });
  test('MM-TRK-03: no backendUrl = unchanged', () => {
    expect(injectTrackingPixel('<p>Hi</p>', TID, '')).toBe('<p>Hi</p>');
  });
});

describe('injectClickTracking', () => {
  const URL='https://t.example.com', TID='click';
  test('MM-CLK-01: http link rewritten', () => {
    var r = injectClickTracking('<a href="https://google.com">link</a>', TID, URL);
    expect(r).toContain('/track/click/');
    expect(r).not.toContain('href="https://google.com"');
  });
  test('MM-CLK-02: mailto not rewritten', () => {
    var html = '<a href="mailto:x@x.com">e</a>';
    expect(injectClickTracking(html, TID, URL)).toBe(html);
  });
  test('MM-CLK-03: no backendUrl = unchanged', () => {
    var html = '<a href="https://google.com">g</a>';
    expect(injectClickTracking(html, TID, '')).toBe(html);
  });
});

describe('findDuplicates', () => {
  test('MM-DUP-01: case-insensitive duplicate detected', () => {
    var rows = [
      {rowIndex:2,data:{Email:'a@x.com'}},
      {rowIndex:3,data:{Email:'b@x.com'}},
      {rowIndex:4,data:{Email:'A@X.COM'}},
    ];
    var dupes = findDuplicates(rows, 'Email');
    expect(Object.keys(dupes)).toContain('a@x.com');
    expect(dupes['a@x.com']).toEqual([2,4]);
  });
  test('MM-DUP-02: unique emails = empty result', () => {
    var unique = [{rowIndex:2,data:{Email:'x@x.com'}},{rowIndex:3,data:{Email:'y@x.com'}}];
    expect(Object.keys(findDuplicates(unique,'Email'))).toHaveLength(0);
  });
  test('MM-DUP-03: empty emails ignored', () => {
    var empty = [{rowIndex:2,data:{Email:''}},{rowIndex:3,data:{Email:''}}];
    expect(Object.keys(findDuplicates(empty,'Email'))).toHaveLength(0);
  });
});

/* ── Status Parsing & YAMM Normalization Tests ─────────────── */
function parseStatusString(raw) {
  if (!raw) return '';
  var s = String(raw).trim();
  var u = s.toUpperCase();
  if (u.indexOf('POSITIVE') !== -1) return STATUS.POSITIVE;
  if (u.indexOf('BOUNCE') !== -1)   return STATUS.BOUNCED;
  if (u.indexOf('BLOCK') !== -1)    return STATUS.BLOCKED;
  if (u.indexOf('REPL') !== -1 || u.indexOf('RESPOND') !== -1) return STATUS.REPLIED;
  if (u.indexOf('CLICK') !== -1)   return STATUS.CLICKED;
  if (u.indexOf('OPEN') !== -1)    return STATUS.OPENED;
  if (u.indexOf('SENT') !== -1)    return STATUS.SENT;
  if (u.indexOf('FAIL') !== -1)    return STATUS.FAILED;
  if (u.indexOf('DUPLICATE') !== -1) return STATUS.DUPLICATE;
  if (u.indexOf('SKIP') !== -1)    return STATUS.SKIPPED;
  return s;
}

function isProcessedStatus(raw) {
  var std = parseStatusString(raw);
  return (
    std === STATUS.SENT ||
    std === STATUS.OPENED ||
    std === STATUS.CLICKED ||
    std === STATUS.REPLIED ||
    std === STATUS.POSITIVE ||
    std === STATUS.BOUNCED ||
    std === STATUS.BLOCKED
  );
}

describe('parseStatusString (YAMM & SheetMerge Compatibility)', () => {
  test('MM-STAT-01: parses standard Sent', () => {
    expect(parseStatusString('Sent')).toBe('Sent');
  });
  test('MM-STAT-02: parses YAMM EMAIL_SENT token', () => {
    expect(parseStatusString('EMAIL_SENT')).toBe('Sent');
  });
  test('MM-STAT-03: parses YAMM EMAIL_SENT with timestamp', () => {
    expect(parseStatusString('EMAIL_SENT on Oct 24, 2026, 6:00 PM')).toBe('Sent');
  });
  test('MM-STAT-04: parses YAMM EMAIL_OPENED', () => {
    expect(parseStatusString('EMAIL_OPENED')).toBe('Opened');
  });
  test('MM-STAT-05: parses YAMM EMAIL_CLICKED', () => {
    expect(parseStatusString('EMAIL_CLICKED')).toBe('Clicked');
  });
  test('MM-STAT-06: parses YAMM EMAIL_RESPONDED', () => {
    expect(parseStatusString('EMAIL_RESPONDED')).toBe('Replied');
  });
  test('MM-STAT-07: parses YAMM EMAIL_BOUNCED', () => {
    expect(parseStatusString('EMAIL_BOUNCED')).toBe('Bounced');
  });
  test('MM-STAT-08: parses Positive Reply', () => {
    expect(parseStatusString('Positive Reply')).toBe('Positive Reply');
  });
  test('MM-STAT-09: empty or null returns empty string', () => {
    expect(parseStatusString('')).toBe('');
    expect(parseStatusString(null)).toBe('');
  });
});

describe('isProcessedStatus', () => {
  test('MM-PROC-01: Sent is processed', () => {
    expect(isProcessedStatus('Sent')).toBe(true);
    expect(isProcessedStatus('EMAIL_SENT')).toBe(true);
  });
  test('MM-PROC-02: Bounced is processed (should not be re-sent)', () => {
    expect(isProcessedStatus('Bounced')).toBe(true);
    expect(isProcessedStatus('EMAIL_BOUNCED')).toBe(true);
  });
  test('MM-PROC-03: Pending is not processed', () => {
    expect(isProcessedStatus('Pending')).toBe(false);
    expect(isProcessedStatus('')).toBe(false);
  });
});

