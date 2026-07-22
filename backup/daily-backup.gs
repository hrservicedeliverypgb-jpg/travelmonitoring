/**
 * PGB Travel Monitoring — Daily Records Backup (Google Apps Script)
 * ----------------------------------------------------------------------------
 * Emails a full backup of ALL travel records once per day to the recipient
 * below. It reads the live data straight from the app's cloud database, so the
 * backup always matches what everyone sees in the web app.
 *
 * ── ONE-TIME SETUP (takes ~3 minutes) ──────────────────────────────────────
 *   1. Sign in to Gmail as  hrservicedeliverypgb@gmail.com
 *   2. Open  https://script.google.com  →  New project
 *   3. Delete the sample code, paste ALL of this file, and click  Save  (💾)
 *   4. In the toolbar function dropdown pick  sendBackupNow  →  Run.
 *      Google will ask for permission (to fetch a URL and send email as you) —
 *      click  Review permissions  →  choose the account  →  Allow.
 *      You should receive one backup email right away. ✅
 *   5. Pick  createDailyTrigger  in the dropdown  →  Run  (just once).
 *      This schedules the email to go out automatically every day.
 *
 *   Done. From now on a backup lands in the inbox every morning.
 *
 * ── TO CHANGE ANYTHING ──────────────────────────────────────────────────────
 *   • Recipient .......... edit RECIPIENT below
 *   • Time of day ........ edit TRIGGER_HOUR (24-hour clock), then re-run
 *                          createDailyTrigger
 *   • Stop the daily email  run  deleteDailyTrigger
 * ----------------------------------------------------------------------------
 */

// ── Settings ────────────────────────────────────────────────────────────────
var FIREBASE_URL = 'https://carltress-8263a-default-rtdb.firebaseio.com/pgb_travel.json';
var RECIPIENT    = 'hrservicedeliverypgb@gmail.com';
var TRIGGER_HOUR = 7; // daily email fires between 7:00–8:00 in the account's time zone

// Preferred column order + friendly headers. Any extra fields found in the data
// are appended automatically, so new fields never get silently dropped.
var COLUMNS = [
  ['id',         'Record ID'],
  ['dr',         'Date Received'],
  ['dep',        'Departure Date'],
  ['arr',        'Arrival Date'],
  ['lvl',        'Employee Level'],
  ['emp',        'Employee Name'],
  ['travellers', 'Travelling Employee/s'],
  ['aff',        'Affiliate'],
  ['chargeAff',  'Charge to Affiliate'],
  ['chg',        'Charging'],
  ['proc',       'Process'],
  ['dest',       'Destination'],
  ['ldest',      'Local Destination'],
  ['perDiem',    'Per Diem'],
  ['trans',      'Transportation'],
  ['total',      'Total Amount'],
  ['bkType',     'Booking Type'],
  ['hAccom',     'Hotel / Accommodation'],
  ['bkAmt',      'Booking Amount'],
  ['purpose',    'Purpose'],
  ['handled',    'Handled By'],
  ['status',     'Status'],
  ['dateAccomp', 'Date Accomplished'],
  ['payStatus',  'Payment Status'],
  ['bkStatus',   'Booking Status'],
  ['payRef',     'Payment Ref'],
  ['payMethod',  'Payment Method'],
  ['payBy',      'Paid By'],
  ['payRemarks', 'Payment Remarks']
];

// ── Core: fetch the live data ────────────────────────────────────────────────
function fetchData_() {
  var res = UrlFetchApp.fetch(FIREBASE_URL, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('Data source returned HTTP ' + code);
  var data = JSON.parse(res.getContentText() || '{}');
  return {
    records:   (data && Array.isArray(data.records))   ? data.records   : [],
    changelog: (data && Array.isArray(data.changelog)) ? data.changelog : [],
    nid:       (data && data.nid) ? data.nid : null
  };
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
function csvEscape_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function buildCsv_(records) {
  var known = COLUMNS.map(function (c) { return c[0]; });
  var extras = [];
  records.forEach(function (r) {
    Object.keys(r || {}).forEach(function (k) {
      if (known.indexOf(k) === -1 && extras.indexOf(k) === -1) extras.push(k);
    });
  });
  var cols = COLUMNS.concat(extras.map(function (k) { return [k, k]; }));

  var header = cols.map(function (c) { return csvEscape_(c[1]); }).join(',');
  var rows = records.map(function (r) {
    return cols.map(function (c) { return csvEscape_(r ? r[c[0]] : ''); }).join(',');
  });
  // Prepend a UTF-8 BOM so Excel opens Filipino names (ñ, etc.) correctly.
  return '﻿' + [header].concat(rows).join('\r\n');
}

function peso_(n) {
  var v = Math.round((Number(n) || 0) * 100) / 100;
  var parts = v.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return 'PHP ' + parts.join('.');
}

function tally_(records, key, fallback) {
  var out = {};
  records.forEach(function (r) {
    var k = (r && r[key]) ? r[key] : (fallback || 'Unspecified');
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function tallyHtml_(obj) {
  var keys = Object.keys(obj).sort();
  if (!keys.length) return '&mdash;';
  return keys.map(function (k) {
    return '<b>' + k + '</b>: ' + obj[k];
  }).join(' &nbsp;&bull;&nbsp; ');
}

// ── Main: build and send the backup email ─────────────────────────────────────
function sendBackupNow() {
  var tz    = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd_HHmm');

  var d = fetchData_();
  var records = d.records;

  var csvBlob = Utilities.newBlob(buildCsv_(records), 'text/csv',
                                  'PGB_Travel_Records_' + stamp + '.csv');
  var jsonBlob = Utilities.newBlob(
    JSON.stringify({ records: records, nid: d.nid, changelog: d.changelog }, null, 2),
    'application/json', 'PGB_Travel_Backup_' + stamp + '.json');

  var total     = records.length;
  var totalCost = records.reduce(function (s, r) { return s + (Number(r.total) || 0); }, 0);
  var byStatus  = tally_(records, 'status');
  var byProc    = tally_(records, 'proc');

  var subject = 'PGB Travel Monitoring — Daily Backup (' + today + ') — ' + total + ' records';

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1a2a3a;max-width:620px">' +
      '<div style="background:#1E3A5F;border-radius:12px 12px 0 0;padding:18px 22px">' +
        '<div style="color:#fff;font-size:18px;font-weight:800">PGB Travel Monitoring &mdash; Daily Backup</div>' +
        '<div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:3px">Automated snapshot for ' + today + '</div>' +
      '</div>' +
      '<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:20px 22px">' +
        '<table style="border-collapse:collapse;font-size:14px;margin-bottom:6px">' +
          '<tr><td style="padding:4px 16px 4px 0;color:#5a7090">Total records</td>' +
              '<td style="font-weight:800;color:#1E3A5F">' + total + '</td></tr>' +
          '<tr><td style="padding:4px 16px 4px 0;color:#5a7090">Total travel cost</td>' +
              '<td style="font-weight:800;color:#1E3A5F">' + peso_(totalCost) + '</td></tr>' +
        '</table>' +
        '<p style="margin:14px 0 3px;font-weight:700;color:#1E3A5F;font-size:13px">By status</p>' +
        '<p style="margin:0 0 8px;font-size:13px">' + tallyHtml_(byStatus) + '</p>' +
        '<p style="margin:12px 0 3px;font-weight:700;color:#1E3A5F;font-size:13px">By process</p>' +
        '<p style="margin:0 0 14px;font-size:13px">' + tallyHtml_(byProc) + '</p>' +
        '<p style="font-size:13px;color:#5a7090;border-top:1px solid #eef2f7;padding-top:12px">' +
          'Attached: a spreadsheet-ready <b>CSV</b> of all records, plus a full <b>JSON</b> backup ' +
          '(the exact snapshot, usable to restore the data if ever needed).</p>' +
        '<p style="font-size:11px;color:#94a3b8;margin-top:16px">Sent automatically by Google Apps Script.</p>' +
      '</div>' +
    '</div>';

  var plain =
    'PGB Travel Monitoring — Daily Backup (' + today + ')\n\n' +
    'Total records: ' + total + '\n' +
    'Total travel cost: ' + peso_(totalCost) + '\n\n' +
    'Attached: CSV of all records + full JSON backup.';

  GmailApp.sendEmail(RECIPIENT, subject, plain, {
    htmlBody: html,
    name: 'PGB Travel Monitoring',
    attachments: [csvBlob, jsonBlob]
  });

  Logger.log('Backup sent to ' + RECIPIENT + ' — ' + total + ' records.');
}

// ── Scheduling ────────────────────────────────────────────────────────────────
/** Run ONCE to schedule the daily email. Safe to re-run — it clears old copies first. */
function createDailyTrigger() {
  deleteDailyTrigger();
  ScriptApp.newTrigger('sendBackupNow')
    .timeBased()
    .everyDays(1)
    .atHour(TRIGGER_HOUR)
    .create();
  Logger.log('Daily backup scheduled at ~' + TRIGGER_HOUR + ':00 (' + Session.getScriptTimeZone() + ').');
}

/** Run to stop the automatic daily email. */
function deleteDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendBackupNow') ScriptApp.deleteTrigger(t);
  });
}
