/**
 * DashboardSheet.js — Visual Analytics Dashboard (v2 Single-Column Edition)
 * =========================================================================
 * Calculates metrics directly from the single 'SheetMerge Status' column,
 * generating descriptive charts, KPI cards, and benchmarks.
 */

var DASHBOARD_SHEET_NAME = '📊 SheetMerge Dashboard';

function createOrUpdateDashboardSheet(dataSourceSheet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  dataSourceSheet = dataSourceSheet || getDataSheet();

  var dataSheetName = dataSourceSheet.getName();

  if (dataSheetName === DASHBOARD_SHEET_NAME || dataSheetName === '_MM_Tracking') {
    var allSheets = ss.getSheets();
    for (var s = 0; s < allSheets.length; s++) {
      var name = allSheets[s].getName();
      if (name !== DASHBOARD_SHEET_NAME && name !== '_MM_Tracking' && name !== '🎯 Positive Responses' && name !== '✨ Valid Contacts') {
        dataSourceSheet = allSheets[s];
        dataSheetName = name;
        break;
      }
    }
  }

  var colMap = ensureStatusColumns(dataSourceSheet);
  var lastRowData = Math.max(2, dataSourceSheet.getLastRow());

  function toColLetter(colIdx) {
    var temp, letter = '';
    while (colIdx > 0) {
      temp = (colIdx - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      colIdx = (colIdx - temp - 1) / 26;
    }
    return letter;
  }

  var statusColLetter = toColLetter(colMap[COL.STATUS] || 1);

  var dashSheet = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  if (!dashSheet) {
    dashSheet = ss.insertSheet(DASHBOARD_SHEET_NAME, 0);
  } else {
    var existingCharts = dashSheet.getCharts();
    for (var c = 0; c < existingCharts.length; c++) {
      dashSheet.removeChart(existingCharts[c]);
    }
    dashSheet.clear();
  }

  // Header Banner
  dashSheet.getRange('A1:L1').merge();
  dashSheet.getRange('A1')
    .setValue('⚡ SHEETMERGE V2 CAMPAIGN INTELLIGENCE')
    .setFontSize(13)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#0f172a') // Slate 900
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  dashSheet.setRowHeight(1, 40);

  dashSheet.getRange('A2:L2').merge();
  dashSheet.getRange('A2')
    .setValue('Data Source: "' + dataSheetName + '"  |  Last Synced: ' + new Date().toLocaleString() + '  |  Unified Status Tracking Active')
    .setFontSize(9)
    .setFontColor('#64748b')
    .setBackground('#f8fafc')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  dashSheet.setRowHeight(2, 22);

  // KPI Scorecard Cards (Row 4-5)
  // Card 1: Total Leads
  dashSheet.getRange('A4:B4').merge().setValue('TOTAL LEADS').setFontWeight('bold').setFontSize(9).setFontColor('#64748b').setHorizontalAlignment('center');
  dashSheet.getRange('A5:B5').merge().setFormula('=MAX(0, COUNTA(\'' + dataSheetName + '\'!A2:A) )').setFontWeight('bold').setFontSize(18).setFontColor('#0f172a').setHorizontalAlignment('center');

  // Card 2: Delivered (Sent)
  dashSheet.getRange('C4:D4').merge().setValue('DELIVERED (SENT)').setFontWeight('bold').setFontSize(9).setFontColor('#166534').setHorizontalAlignment('center');
  dashSheet.getRange('C5:D5').merge().setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Sent*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Opened*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Clicked*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Replied*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Positive*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*EMAIL_SENT*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*EMAIL_OPENED*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*EMAIL_CLICKED*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*EMAIL_RESPONDED*")').setFontWeight('bold').setFontSize(18).setFontColor('#166534').setHorizontalAlignment('center');

  // Card 3: Opens
  dashSheet.getRange('E4:F4').merge().setValue('OPENS').setFontWeight('bold').setFontSize(9).setFontColor('#1e40af').setHorizontalAlignment('center');
  dashSheet.getRange('E5:F5').merge().setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Opened*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Clicked*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*EMAIL_OPENED*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*EMAIL_CLICKED*")').setFontWeight('bold').setFontSize(18).setFontColor('#1e40af').setHorizontalAlignment('center');

  // Card 4: Clicks
  dashSheet.getRange('G4:H4').merge().setValue('CLICKS').setFontWeight('bold').setFontSize(9).setFontColor('#6b21a8').setHorizontalAlignment('center');
  dashSheet.getRange('G5:H5').merge().setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Clicked*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*EMAIL_CLICKED*")').setFontWeight('bold').setFontSize(18).setFontColor('#6b21a8').setHorizontalAlignment('center');

  // Card 5: Positive Responses
  dashSheet.getRange('I4:J4').merge().setValue('POSITIVE RESPONSES').setFontWeight('bold').setFontSize(9).setFontColor('#065f46').setHorizontalAlignment('center');
  dashSheet.getRange('I5:J5').merge().setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Positive*")').setFontWeight('bold').setFontSize(18).setFontColor('#065f46').setHorizontalAlignment('center');

  // Card 6: Bounces / Issues
  dashSheet.getRange('K4:L4').merge().setValue('BOUNCES & BLOCKS').setFontWeight('bold').setFontSize(9).setFontColor('#991b1b').setHorizontalAlignment('center');
  dashSheet.getRange('K5:L5').merge().setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Bounced*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*EMAIL_BOUNCED*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Blocked*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*Failed*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*EMAIL_BLOCKED*") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "*EMAIL_FAILED*")').setFontWeight('bold').setFontSize(18).setFontColor('#991b1b').setHorizontalAlignment('center');

  // Style KPI rows
  dashSheet.getRange('A4:L4').setBackground('#f8fafc');
  dashSheet.getRange('A5:L5').setBackground('#ffffff');
  dashSheet.getRange('A4:L5').setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  dashSheet.setRowHeight(4, 20);
  dashSheet.setRowHeight(5, 32);

  // Delivery Breakdown Table (Rows 7-12)
  dashSheet.getRange('A7:B7').merge().setValue('Status Breakdown').setFontWeight('bold').setFontColor('#334155').setBackground('#e2e8f0');
  dashSheet.getRange('A8').setValue('Sent / Delivered');
  dashSheet.getRange('B8').setFormula('=C5');
  dashSheet.getRange('A9').setValue('Pending');
  dashSheet.getRange('B9').setFormula('=COUNTBLANK(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + lastRowData + ') + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Pending")');
  dashSheet.getRange('A10').setValue('Duplicate');
  dashSheet.getRange('B10').setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Duplicate")');
  dashSheet.getRange('A11').setValue('Bounced');
  dashSheet.getRange('B11').setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Bounced")');
  dashSheet.getRange('A12').setValue('Blocked / Failed');
  dashSheet.getRange('B12').setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Blocked") + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Failed")');
  dashSheet.getRange('A7:B12').setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);

  // Engagement Funnel Table
  dashSheet.getRange('C7:D7').merge().setValue('Engagement Funnel').setFontWeight('bold').setFontColor('#334155').setBackground('#e2e8f0');
  dashSheet.getRange('C8').setValue('1. Total Audience');
  dashSheet.getRange('D8').setFormula('=A5');
  dashSheet.getRange('C9').setValue('2. Delivered');
  dashSheet.getRange('D9').setFormula('=C5');
  dashSheet.getRange('C10').setValue('3. Opened');
  dashSheet.getRange('D10').setFormula('=E5');
  dashSheet.getRange('C11').setValue('4. Clicked');
  dashSheet.getRange('D11').setFormula('=G5');
  dashSheet.getRange('C12').setValue('5. Positive Reply');
  dashSheet.getRange('D12').setFormula('=I5');
  dashSheet.getRange('C7:D12').setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);

  // Embed Funnel Chart
  var funnelChart = dashSheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dashSheet.getRange('C8:D12'))
    .setPosition(14, 1, 0, 0)
    .setOption('title', '📈 Campaign Engagement Pipeline')
    .setOption('titleTextStyle', { fontSize: 13, bold: true, color: '#0f172a' })
    .setOption('width', 540)
    .setOption('height', 280)
    .setOption('colors', ['#3b82f6'])
    .build();
  dashSheet.insertChart(funnelChart);

  // Embed Donut Chart
  var pieChart = dashSheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(dashSheet.getRange('A8:B12'))
    .setPosition(14, 7, 0, 0)
    .setOption('title', '📊 Lead Distribution')
    .setOption('titleTextStyle', { fontSize: 13, bold: true, color: '#0f172a' })
    .setOption('pieHole', 0.4)
    .setOption('width', 400)
    .setOption('height', 280)
    .setOption('colors', ['#16a34a', '#cbd5e1', '#f59e0b', '#dc2626', '#991b1b'])
    .build();
  dashSheet.insertChart(pieChart);

  return dashSheet;
}
