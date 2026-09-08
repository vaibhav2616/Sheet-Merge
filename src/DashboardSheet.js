/**
 * DashboardSheet.js — In-Sheet Visual Analytics & Executive Dashboard
 * ====================================================================
 * Generates and maintains a dedicated "📊 SheetMerge Dashboard" tab inside
 * Google Sheets, featuring large descriptive charts, live metric formulas,
 * KPI scorecards, and actionable inference benchmarks to anchor decisions.
 */

var DASHBOARD_SHEET_NAME = '📊 SheetMerge Dashboard';

/**
 * Creates or refreshes the dedicated in-sheet visual dashboard tab.
 *
 * @param {Sheet} [dataSourceSheet]
 * @return {Sheet} The dashboard sheet
 */
function createOrUpdateDashboardSheet(dataSourceSheet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  dataSourceSheet = dataSourceSheet || getDataSheet();

  var dataSheetName = dataSourceSheet.getName();

  // If the active sheet is the dashboard itself, find the actual data sheet
  if (dataSheetName === DASHBOARD_SHEET_NAME || dataSheetName === '_MM_Tracking') {
    var allSheets = ss.getSheets();
    for (var s = 0; s < allSheets.length; s++) {
      var name = allSheets[s].getName();
      if (name !== DASHBOARD_SHEET_NAME && name !== '_MM_Tracking' && name !== '🎯 Positive Responses') {
        dataSourceSheet = allSheets[s];
        dataSheetName = name;
        break;
      }
    }
  }

  // Ensure status columns exist on data sheet so formulas don't break
  var colMap = ensureStatusColumns(dataSourceSheet);
  var lastRowData = Math.max(2, dataSourceSheet.getLastRow());

  // Helper to get column letter from 1-based index
  function toColLetter(colIdx) {
    var temp, letter = '';
    while (colIdx > 0) {
      temp = (colIdx - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      colIdx = (colIdx - temp - 1) / 26;
    }
    return letter;
  }

  var statusColLetter  = toColLetter(colMap[COL.STATUS] || 1);
  var openedColLetter  = toColLetter(colMap[COL.OPENED] || 1);
  var clickedColLetter = toColLetter(colMap[COL.CLICKED] || 1);
  var repliedColLetter = toColLetter(colMap[COL.REPLIED] || 1);
  var positiveColLetter= toColLetter(colMap[COL.POSITIVE] || colMap[COL.REPLIED] || 1);
  var bouncedColLetter = toColLetter(colMap[COL.BOUNCED] || 1);
  var blockedColLetter = toColLetter(colMap[COL.BLOCKED] || 1);

  // Get or create dashboard sheet
  var dashSheet = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  if (!dashSheet) {
    dashSheet = ss.insertSheet(DASHBOARD_SHEET_NAME, 0); // place first
  } else {
    // Remove existing embedded charts before redrawing
    var existingCharts = dashSheet.getCharts();
    for (var c = 0; c < existingCharts.length; c++) {
      dashSheet.removeChart(existingCharts[c]);
    }
    dashSheet.clear();
  }

  // ── 1. Top Header Banner ──
  dashSheet.getRange('A1:L1').merge();
  dashSheet.getRange('A1')
    .setValue('⚡ SHEETMERGE CAMPAIGN INTELLIGENCE & VISUAL ANALYTICS')
    .setFontSize(14)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#1a1d27')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  dashSheet.setRowHeight(1, 44);

  dashSheet.getRange('A2:L2').merge();
  dashSheet.getRange('A2')
    .setValue('Data Source Sheet: "' + dataSheetName + '"  |  Last Synced: ' + new Date().toLocaleString() + '  |  Refresh via menu ✉️ SheetMerge > 📊 Refresh Visual Dashboard Sheet')
    .setFontSize(9)
    .setFontColor('#94a3b8')
    .setBackground('#22263a')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  dashSheet.setRowHeight(2, 24);

  // ── 2. KPI Scorecard Cards (Row 4-5) ──
  // Card 1: Total Leads
  dashSheet.getRange('A4:B4').merge().setValue('TOTAL LEADS').setFontWeight('bold').setFontSize(9).setFontColor('#64748b').setHorizontalAlignment('center');
  dashSheet.getRange('A5:B5').merge().setFormula('=MAX(0, COUNTA(\'' + dataSheetName + '\'!A2:A) )').setFontWeight('bold').setFontSize(18).setFontColor('#0f172a').setHorizontalAlignment('center');

  // Card 2: Sent / Delivered
  dashSheet.getRange('C4:D4').merge().setValue('DELIVERED (SENT)').setFontWeight('bold').setFontSize(9).setFontColor('#16a34a').setHorizontalAlignment('center');
  dashSheet.getRange('C5:D5').merge().setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Sent")').setFontWeight('bold').setFontSize(18).setFontColor('#16a34a').setHorizontalAlignment('center');

  // Card 3: Open Rate
  dashSheet.getRange('E4:F4').merge().setValue('UNIQUE OPENS').setFontWeight('bold').setFontSize(9).setFontColor('#2563eb').setHorizontalAlignment('center');
  dashSheet.getRange('E5:F5').merge().setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + openedColLetter + '2:' + openedColLetter + ', TRUE)').setFontWeight('bold').setFontSize(18).setFontColor('#2563eb').setHorizontalAlignment('center');

  // Card 4: Clicks
  dashSheet.getRange('G4:H4').merge().setValue('LINK CLICKS').setFontWeight('bold').setFontSize(9).setFontColor('#9333ea').setHorizontalAlignment('center');
  dashSheet.getRange('G5:H5').merge().setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + clickedColLetter + '2:' + clickedColLetter + ', TRUE)').setFontWeight('bold').setFontSize(18).setFontColor('#9333ea').setHorizontalAlignment('center');

  // Card 5: Positive Responses
  dashSheet.getRange('I4:J4').merge().setValue('POSITIVE RESPONSES').setFontWeight('bold').setFontSize(9).setFontColor('#059669').setHorizontalAlignment('center');
  dashSheet.getRange('I5:J5').merge().setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + positiveColLetter + '2:' + positiveColLetter + ', TRUE)').setFontWeight('bold').setFontSize(18).setFontColor('#059669').setHorizontalAlignment('center');

  // Card 6: Bounces / Issues
  dashSheet.getRange('K4:L4').merge().setValue('BOUNCES & ISSUES').setFontWeight('bold').setFontSize(9).setFontColor('#dc2626').setHorizontalAlignment('center');
  dashSheet.getRange('K5:L5').merge().setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + bouncedColLetter + '2:' + bouncedColLetter + ', TRUE) + COUNTIF(\'' + dataSheetName + '\'!' + blockedColLetter + '2:' + blockedColLetter + ', TRUE) + COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Failed")').setFontWeight('bold').setFontSize(18).setFontColor('#dc2626').setHorizontalAlignment('center');

  // Style KPI rows
  var kpiHeaderRange = dashSheet.getRange('A4:L4');
  kpiHeaderRange.setBackground('#f8fafc');
  var kpiValueRange = dashSheet.getRange('A5:L5');
  kpiValueRange.setBackground('#ffffff');
  dashSheet.getRange('A4:L5').setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  dashSheet.setRowHeight(4, 22);
  dashSheet.setRowHeight(5, 34);

  // ── 3. Data Tables for Charts & Formulated Inference (Rows 7-16) ──
  // Table 1: Delivery Breakdown
  dashSheet.getRange('A7:B7').merge().setValue('Delivery Breakdown').setFontWeight('bold').setFontColor('#334155').setBackground('#e2e8f0');
  dashSheet.getRange('A8').setValue('Sent');
  dashSheet.getRange('B8').setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Sent")');
  dashSheet.getRange('A9').setValue('Pending');
  dashSheet.getRange('B9').setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Pending") + COUNTBLANK(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + lastRowData + ')');
  dashSheet.getRange('A10').setValue('Duplicate');
  dashSheet.getRange('B10').setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Duplicate")');
  dashSheet.getRange('A11').setValue('Failed');
  dashSheet.getRange('B11').setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Failed")');
  dashSheet.getRange('A12').setValue('Skipped');
  dashSheet.getRange('B12').setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + statusColLetter + '2:' + statusColLetter + ', "Skipped")');
  dashSheet.getRange('A7:B12').setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);

  // Table 2: Engagement Funnel
  dashSheet.getRange('C7:D7').merge().setValue('Engagement Funnel').setFontWeight('bold').setFontColor('#334155').setBackground('#e2e8f0');
  dashSheet.getRange('C8').setValue('1. Total Audience');
  dashSheet.getRange('D8').setFormula('=A5');
  dashSheet.getRange('C9').setValue('2. Delivered (Sent)');
  dashSheet.getRange('D9').setFormula('=C5');
  dashSheet.getRange('C10').setValue('3. Opened');
  dashSheet.getRange('D10').setFormula('=E5');
  dashSheet.getRange('C11').setValue('4. Clicked');
  dashSheet.getRange('D11').setFormula('=G5');
  dashSheet.getRange('C12').setValue('5. Positive Reply');
  dashSheet.getRange('D12').setFormula('=I5');
  dashSheet.getRange('C7:D12').setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);

  // Table 3: Deliverability & Sentiment Quality
  dashSheet.getRange('E7:F7').merge().setValue('Sentiment & Quality').setFontWeight('bold').setFontColor('#334155').setBackground('#e2e8f0');
  dashSheet.getRange('E8').setValue('Positive Responses');
  dashSheet.getRange('F8').setFormula('=I5');
  dashSheet.getRange('E9').setValue('Neutral / Other Replies');
  dashSheet.getRange('F9').setFormula('=MAX(0, COUNTIF(\'' + dataSheetName + '\'!' + repliedColLetter + '2:' + repliedColLetter + ', TRUE) - I5)');
  dashSheet.getRange('E10').setValue('Bounced');
  dashSheet.getRange('F10').setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + bouncedColLetter + '2:' + bouncedColLetter + ', TRUE)');
  dashSheet.getRange('E11').setValue('Blocked');
  dashSheet.getRange('F11').setFormula('=COUNTIF(\'' + dataSheetName + '\'!' + blockedColLetter + '2:' + blockedColLetter + ', TRUE)');
  dashSheet.getRange('E12').setValue('Unopened / Silent');
  dashSheet.getRange('F12').setFormula('=MAX(0, C5 - E5)');
  dashSheet.getRange('E7:F12').setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);

  // Number format counts
  dashSheet.getRange('B8:B12').setNumberFormat('#,##0');
  dashSheet.getRange('D8:D12').setNumberFormat('#,##0');
  dashSheet.getRange('F8:F12').setNumberFormat('#,##0');

  // ── 4. Large Descriptive Visuals (Native Embedded Charts) ──

  // Visual 1: Delivery Distribution Chart (Donut / Pie)
  var deliveryChart = dashSheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(dashSheet.getRange('A8:B12'))
    .setPosition(7, 7, 0, 0) // Row 7, Col 7 (G7)
    .setOption('title', '📊 Delivery Status Distribution')
    .setOption('titleTextStyle', { fontSize: 13, bold: true, color: '#1e293b' })
    .setOption('pieHole', 0.4)
    .setOption('width', 380)
    .setOption('height', 240)
    .setOption('colors', ['#16a34a', '#e2e8f0', '#f59e0b', '#dc2626', '#94a3b8'])
    .build();
  dashSheet.insertChart(deliveryChart);

  // Visual 2: Engagement Funnel Chart (Large Column / Bar Visual)
  var funnelChart = dashSheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dashSheet.getRange('C8:D12'))
    .setPosition(15, 1, 0, 0) // Row 15, Col 1 (A15)
    .setOption('title', '📈 Campaign Engagement Funnel (Audience → Positive Leads)')
    .setOption('titleTextStyle', { fontSize: 14, bold: true, color: '#1e293b' })
    .setOption('width', 580)
    .setOption('height', 310)
    .setOption('legend', { position: 'none' })
    .setOption('colors', ['#3b82f6'])
    .setOption('vAxis', { title: 'Number of Contacts', minValue: 0 })
    .build();
  dashSheet.insertChart(funnelChart);

  // Visual 3: Response Quality & Sentiment Chart (Donut / Pie)
  var sentimentChart = dashSheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(dashSheet.getRange('E8:F12'))
    .setPosition(15, 7, 0, 0) // Row 15, Col 7 (G15)
    .setOption('title', '🎯 Response Quality & Inbound Sentiment')
    .setOption('titleTextStyle', { fontSize: 14, bold: true, color: '#1e293b' })
    .setOption('pieHole', 0.35)
    .setOption('width', 380)
    .setOption('height', 310)
    .setOption('colors', ['#10b981', '#38bdf8', '#ef4444', '#f97316', '#cbd5e1'])
    .build();
  dashSheet.insertChart(sentimentChart);

  // ── 5. Executive Inference & Actionable Anchoring Panel (Rows 32-38) ──
  dashSheet.getRange('A32:L32').merge();
  dashSheet.getRange('A32')
    .setValue('📌 STRATEGIC INFERENCE & ANCHORING GUIDE')
    .setFontWeight('bold')
    .setFontSize(11)
    .setFontColor('#ffffff')
    .setBackground('#1e293b')
    .setVerticalAlignment('middle');
  dashSheet.setRowHeight(32, 28);

  dashSheet.getRange('A33:D33').merge().setValue('Metric Benchmark').setFontWeight('bold').setBackground('#f1f5f9');
  dashSheet.getRange('E33:H33').merge().setValue('Observed Campaign Ratio').setFontWeight('bold').setBackground('#f1f5f9');
  dashSheet.getRange('I33:L33').merge().setValue('Actionable Inference & Recommendation').setFontWeight('bold').setBackground('#f1f5f9');

  // Row 34: Open Rate Inference
  dashSheet.getRange('A34:D34').merge().setValue('Open Rate Benchmark: 21.5%');
  dashSheet.getRange('E34:H34').merge().setFormula('=IF(C5>0, TEXT(E5/C5, "0.0%"), "0.0%")');
  dashSheet.getRange('I34:L34').merge().setFormula('=IF(C5=0, "No emails sent yet.", IF((E5/C5)>=0.25, "🟢 High Interest: Subject line resonates well.", IF((E5/C5)>=0.15, "🟡 Average: Subject line has typical engagement.", "🔴 Low: Consider revising draft subject line.")))');

  // Row 35: CTR Inference
  dashSheet.getRange('A35:D35').merge().setValue('Click-Through Rate Benchmark: 2.8%');
  dashSheet.getRange('E35:H35').merge().setFormula('=IF(C5>0, TEXT(G5/C5, "0.0%"), "0.0%")');
  dashSheet.getRange('I35:L35').merge().setFormula('=IF(C5=0, "No clicks tracked.", IF((G5/C5)>=0.03, "🟢 High Intent: Links are compelling.", "🟡 Average Click Activity: Ensure single clear CTA." ))');

  // Row 36: Positive Conversion Inference
  dashSheet.getRange('A36:D36').merge().setValue('Positive Reply Benchmark: 1.5% - 4.0%');
  dashSheet.getRange('E36:H36').merge().setFormula('=IF(C5>0, TEXT(I5/C5, "0.0%"), "0.0%")');
  dashSheet.getRange('I36:L36').merge().setFormula('=IF(I5>0, "🎯 Positive leads detected! All contact records synced to sheet \'🎯 Positive Responses\'.", "Pending positive inbound replies.")');

  // Row 37: Bounce / Health Inference
  dashSheet.getRange('A37:D37').merge().setValue('Bounce Safety Threshold: < 2.0%');
  dashSheet.getRange('E37:H37').merge().setFormula('=IF(C5>0, TEXT(K5/C5, "0.0%"), "0.0%")');
  dashSheet.getRange('I37:L37').merge().setFormula('=IF((K5/MAX(1, C5))>0.05, "🔴 High Bounce Rate (>5%): Pause sending and scrub your contact list to protect sender reputation.", "🟢 Sender Reputation Healthy: Bounces within safe limit.")');

  // Style inference table
  dashSheet.getRange('A33:L37').setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  dashSheet.getRange('A34:L37').setFontSize(9);

  // Row 39: Quick Navigation Anchors
  dashSheet.getRange('A39:L39').merge();
  dashSheet.getRange('A39')
    .setValue('🔗 Quick Anchors:  [1] Lead Sheet: "' + dataSheetName + '"   |   [2] Positive Responses Sheet: "' + POSITIVE_SHEET_NAME + '"   |   [3] Reorder Leads via Menu: Move Contactable to Bottom')
    .setFontSize(9)
    .setFontColor('#475569')
    .setBackground('#f8fafc')
    .setHorizontalAlignment('center');
  dashSheet.setRowHeight(39, 26);

  // Set column widths
  dashSheet.setColumnWidth(1, 95);
  dashSheet.setColumnWidth(2, 85);
  dashSheet.setColumnWidth(3, 115);
  dashSheet.setColumnWidth(4, 85);
  dashSheet.setColumnWidth(5, 120);
  dashSheet.setColumnWidth(6, 85);
  dashSheet.setColumnWidth(7, 100);
  dashSheet.setColumnWidth(8, 85);
  dashSheet.setColumnWidth(9, 110);
  dashSheet.setColumnWidth(10, 85);
  dashSheet.setColumnWidth(11, 105);
  dashSheet.setColumnWidth(12, 85);

  // Activate dashboard sheet so user sees it right away
  dashSheet.activate();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '📊 Visual Dashboard updated with 3 native charts and KPI inference cards.',
    'SheetMerge Visuals',
    5
  );

  return dashSheet;
}
