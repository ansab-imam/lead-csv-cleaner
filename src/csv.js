// RFC 4180 CSV parsing and serialisation.

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
  }

  if (inQuotes) throw new Error('Malformed CSV: unterminated quoted field');
  // A trailing newline must not produce an extra empty record.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Spreadsheet exports often end with blank lines; they carry no data.
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function escapeField(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function stringifyCsv(rows) {
  return rows.map((r) => r.map(escapeField).join(',')).join('\r\n') + '\r\n';
}
