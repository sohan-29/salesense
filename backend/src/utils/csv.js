/**
 * Tiny CSV serializer for the BI export endpoints. No external dependency.
 *
 * `columns` is an ordered list of { key, label } pairs; rows are plain objects.
 * Values are stringified, quoted when they contain commas/quotes/newlines, and
 * embedded quotes are doubled (RFC 4180). Numeric/undefined/null handled.
 */
function escapeCell(value) {
  if (value == null) return '';
  let s = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCell(row[c.key])).join(','))
    .join('\n');
  // Trailing newline so file consumers get a clean final line.
  return `${header}\n${body}\n`;
}

/**
 * Express helper: send `rows` as a CSV download with a given filename.
 */
export function sendCsv(res, rows, columns, filename) {
  const csv = toCsv(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
