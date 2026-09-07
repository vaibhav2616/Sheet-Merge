/**
 * GmailDraftManager.js — Gmail Drafts integration for SheetMerge
 * ===============================================================
 * Allows users to select an existing Gmail draft with rich styling,
 * formatting, attachments, inline images, and {{placeholders}} to use
 * as the mail merge template.
 */

/**
 * Returns a list of all Gmail drafts in the user's account with metadata
 * and extracted merge tags.
 *
 * @return {Array<Object>} List of draft summaries
 */
function getGmailDraftsList() {
  try {
    var drafts = GmailApp.getDrafts();
    if (!drafts || drafts.length === 0) {
      return [];
    }

    var list = [];
    // Limit to latest 30 drafts for performance
    var maxDrafts = Math.min(drafts.length, 30);

    for (var i = 0; i < maxDrafts; i++) {
      var draft = drafts[i];
      var msg = draft.getMessage();
      var subject = msg.getSubject() || '(No Subject)';
      var bodyHtml = msg.getBody() || '';
      var plainSnippet = msg.getPlainBody() || '';
      if (plainSnippet.length > 140) {
        plainSnippet = plainSnippet.substring(0, 140) + '...';
      }

      var attachments = msg.getAttachments();
      var attachmentNames = attachments.map(function(att) {
        return att.getName();
      });

      // Extract {{Placeholders}} from subject and body
      var combinedText = subject + ' ' + bodyHtml;
      var matches = combinedText.match(/\{\{([^}]+)\}\}/g) || [];
      var uniqueTags = [];
      matches.forEach(function(tag) {
        var clean = tag.replace(/[\{\}]/g, '').trim();
        if (clean && uniqueTags.indexOf(clean) === -1) {
          uniqueTags.push(clean);
        }
      });

      list.push({
        id: draft.getId(),
        subject: subject,
        snippet: plainSnippet,
        date: msg.getDate() ? msg.getDate().toLocaleString() : '',
        hasAttachments: attachmentNames.length > 0,
        attachmentCount: attachmentNames.length,
        attachmentNames: attachmentNames,
        tags: uniqueTags
      });
    }

    return list;
  } catch (e) {
    Logger.log('Error fetching Gmail drafts: ' + e.message);
    throw new Error('Could not fetch Gmail drafts: ' + e.message);
  }
}

/**
 * Retrieves the full subject, HTML body, attachments, and inline images
 * of a specific Gmail draft by its draft ID.
 *
 * @param {string} draftId
 * @return {Object}
 */
function getDraftDetails(draftId) {
  if (!draftId) throw new Error('Draft ID is required.');

  var draft = GmailApp.getDraft(draftId);
  if (!draft) throw new Error('Draft not found for ID: ' + draftId);

  var msg = draft.getMessage();
  var subject = msg.getSubject() || '';
  var bodyHtml = msg.getBody() || '';
  var plainBody = msg.getPlainBody() || '';

  // Extract placeholders
  var combinedText = subject + ' ' + bodyHtml;
  var matches = combinedText.match(/\{\{([^}]+)\}\}/g) || [];
  var uniqueTags = [];
  matches.forEach(function(tag) {
    var clean = tag.replace(/[\{\}]/g, '').trim();
    if (clean && uniqueTags.indexOf(clean) === -1) {
      uniqueTags.push(clean);
    }
  });

  var attachments = msg.getAttachments();

  return {
    id: draftId,
    subject: subject,
    bodyHtml: bodyHtml,
    plainBody: plainBody,
    tags: uniqueTags,
    attachments: attachments.map(function(att) {
      return { name: att.getName(), size: att.getSize(), contentType: att.getContentType() };
    })
  };
}

/**
 * Validates whether all {{tags}} in a draft exist in the data sheet columns.
 *
 * @param {string} draftId
 * @param {Array<string>} [sheetHeaders]
 * @return {Object}  { valid: boolean, matched: string[], missing: string[] }
 */
function validateDraftPlaceholders(draftId, sheetHeaders) {
  var details = getDraftDetails(draftId);
  var headers = sheetHeaders || getHeaders(getDataSheet());
  var headersLower = headers.map(function(h) { return String(h).trim().toLowerCase(); });

  var matched = [];
  var missing = [];

  details.tags.forEach(function(tag) {
    if (headersLower.indexOf(tag.toLowerCase()) !== -1) {
      matched.push(tag);
    } else {
      missing.push(tag);
    }
  });

  return {
    draftId: draftId,
    subject: details.subject,
    allTags: details.tags,
    matched: matched,
    missing: missing,
    isValid: missing.length === 0
  };
}
