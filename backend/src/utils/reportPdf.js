import PDFDocument from 'pdfkit';

const money = (n) => `Rs. ${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const pct = (n, dp = 1) => (n == null ? '—' : `${Number(n).toFixed(dp)}%`);
const growth = (n) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n}%`);

/**
 * Build a BI report PDF from the revenue-analysis + benchmark payloads.
 * Returns a PDFKit document piped to `res` as application/pdf.
 *
 * Layout: title + generated-at + applied filters, KPI summary table,
 * revenue-by-vendor table, benchmark ranking table. Pure vector/text — no
 * browser rendering, so it's reliable regardless of the chart library.
 */
export function sendReportPdf(res, { analysis, benchmark: bench, filters }) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="shopsense-bi-report.pdf"`);
  doc.pipe(res);

  // --- Header ---
  doc.fontSize(20).fillColor('#1e293b').text('ShopSense BI Report', { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#64748b').text(`Generated: ${new Date().toISOString()}`);
  const activeFilters = Object.entries(filters || {})
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${v}`);
  doc.text(`Filters: ${activeFilters.length ? activeFilters.join('  ·  ') : 'none (all-time)'}`);
  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
  doc.moveDown(0.8);

  // --- KPI summary ---
  doc.fontSize(13).fillColor('#0f172a').text('Revenue summary');
  doc.moveDown(0.4);
  const t = analysis?.totals || {};
  const g = analysis?.growth || {};
  const kpis = [
    ['GMV', money(t.gmv), `growth ${growth(g.gmvPct)}`],
    ['Net revenue', money(t.netRevenue), `margin ${pct(t.marginPct)}`],
    ['Commission', money(t.commission), ''],
    ['Avg order value', money(t.aov), `growth ${growth(g.aovPct)}`],
    ['Orders', String(t.orders ?? 0), `growth ${growth(g.ordersPct)}`],
    ['Units sold', String(t.units ?? 0), ''],
  ];
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569');
  doc.text('Metric', 50, doc.y, { width: 150 });
  doc.text('Value', 200, doc.y - 12, { width: 120 });
  doc.text('Change', 320, doc.y - 12, { width: 150 });
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
  for (const [label, value, change] of kpis) {
    doc.text(label, 50, doc.y, { width: 150 });
    doc.text(value, 200, doc.y - 12, { width: 120 });
    doc.text(change, 320, doc.y - 12, { width: 150 });
    doc.moveDown(0.1);
  }
  doc.moveDown(0.8);

  // --- Revenue by vendor table ---
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text('Revenue by vendor');
  doc.moveDown(0.4);
  drawTable(doc, ['Vendor', 'GMV', 'Net', 'Margin', 'Orders', 'Growth'], (analysis?.byVendor || []).map((v) => [
    v.businessName, money(v.gmv), money(v.netRevenue), pct(v.marginPct), String(v.orders), growth(v.gmvGrowthPct),
  ]), [180, 100, 100, 70, 60, 80]);

  // --- Benchmark ranking table (admin) ---
  if (bench?.ranking?.length) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text('Vendor benchmark ranking');
    doc.moveDown(0.4);
    drawTable(doc, ['#', 'Vendor', 'Revenue', 'Fulfilment', 'Growth', 'Score'], bench.ranking.map((r) => [
      String(r.rank), r.businessName, money(r.revenue), pct(r.fulfilmentRate * 100, 0), growth(r.growthPct), String(r.compositeScore),
    ]), [40, 170, 100, 90, 80, 70]);
    doc.moveDown(0.6);
    const bm = bench.benchmark || {};
    doc.font('Helvetica').fontSize(9).fillColor('#64748b');
    doc.text(`Benchmark averages — revenue ${money(bm.avgRevenue)}, fulfilment ${pct(bm.avgFulfilment * 100, 0)}, growth ${growth(bm.avgGrowth)}. Top vendor: ${bm.topVendor || '—'}.`);
  }

  doc.end();
}

function drawTable(doc, headers, rows, colWidths) {
  const startX = 50;
  let y = doc.y;
  const rowH = 16;

  // Header row
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569');
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x, y, { width: colWidths[i] });
    x += colWidths[i];
  });
  y += rowH;
  doc.moveTo(startX, y - 4).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y - 4).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

  // Data rows
  doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
  rows.forEach((row) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = doc.y;
    }
    x = startX;
    row.forEach((cell, i) => {
      doc.text(String(cell), x, y, { width: colWidths[i] });
      x += colWidths[i];
    });
    y += rowH;
  });
  doc.y = y;
}
