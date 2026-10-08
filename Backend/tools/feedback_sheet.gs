/**
 * AGNAS feedback sheet -- Google Apps Script web app.
 *
 * Not run by the Python app: paste this into the feedback Google Sheet
 * (Extensions -> Apps Script), then deploy it as a web app (Execute as: Me,
 * Who has access: Anyone) and set the deployment's /exec URL as the server's
 * FEEDBACK_SHEET_URL. The Flask backend (contact_service.record_feedback)
 * POSTs one JSON object per response; this appends it as a row to the
 * sheet's first tab, adding the header row the first time.
 *
 * It also keeps the homepage's visitor count on a "Visitors" tab (created
 * the first time): the backend GETs ?action=visitors to read it and
 * ?action=visit to add one (contact_service._ask_visitor_sheet).
 *
 * After editing this script, publish the change with Deploy -> Manage
 * deployments -> Edit -> Version: New version, or the URL keeps running the
 * old code.
 */

const HEADERS = ['Received', 'Page', 'Rating', 'Score (1-3)', 'Role', 'Comment'];
const VISITORS_SHEET = 'Visitors';
// The count is in A2 and the time of the last new visitor in B2.
const VISITOR_HEADERS = ['Unique visitors', 'Last new visitor'];

function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : '';
  if (action === 'visitors') {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VISITORS_SHEET);
    return reply({ ok: true, count: sheet ? readVisitorCount(sheet) : 0 });
  }
  if (action === 'visit') {
    return reply({ ok: true, count: addVisitor() });
  }
  return reply({ ok: false, error: 'Unknown action.' });
}

function addVisitor() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(VISITORS_SHEET);
    if (!sheet) {
      // Added last, so feedback rows stay on the first tab.
      sheet = spreadsheet.insertSheet(VISITORS_SHEET, spreadsheet.getNumSheets());
      sheet.getRange(1, 1, 1, 2).setValues([VISITOR_HEADERS]);
      sheet.setFrozenRows(1);
    }
    const count = readVisitorCount(sheet) + 1;
    sheet.getRange(2, 1, 1, 2).setValues([[count, new Date()]]);
    return count;
  } finally {
    lock.releaseLock();
  }
}

function readVisitorCount(sheet) {
  const count = Math.floor(Number(sheet.getRange(2, 1).getValue()));
  return count > 0 ? count : 0;
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'Request body is not JSON.' });
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      new Date(),
      cell(data.page),
      cell(data.rating_label),
      data.rating || '',
      cell(data.role),
      cell(data.comment),
    ]);
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

// Text starting with = + - @ would be read by Sheets as a formula; a leading
// apostrophe keeps it plain text.
function cell(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function reply(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
