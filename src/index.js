import { parseCsv, stringifyCsv } from './csv.js';
import { CANONICAL_FIELDS, detectHeaders } from './headers.js';
import { dedupe } from './dedupe.js';
import {
  cleanText,
  fixNameCase,
  isJunk,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
  splitFullName,
} from './normalize.js';

export { parseCsv, stringifyCsv, detectHeaders, dedupe };
export * from './normalize.js';

/** Flags that make a row unusable for import; these are what --drop-invalid removes. */
export const REJECT_FLAGS = new Set(['invalid_email', 'invalid_phone', 'short_phone', 'long_phone', 'invalid_website', 'no_contact']);

function normalizeRecord(raw, mapping, countryCode, stats) {
  const fields = Object.fromEntries(CANONICAL_FIELDS.map((f) => [f, '']));
  const extra = [];

  mapping.forEach((field, i) => {
    const value = raw[i] ?? '';
    if (field) fields[field] = value;
    else extra.push(isJunk(value) ? '' : cleanText(value));
  });

  fields.first_name = fixNameCase(fields.first_name);
  fields.last_name = fixNameCase(fields.last_name);
  fields.full_name = fixNameCase(fields.full_name);
  if (fields.full_name && !fields.first_name && !fields.last_name) {
    const { first, last } = splitFullName(fields.full_name);
    fields.first_name = first;
    fields.last_name = last;
    fields.full_name = [first, last].filter(Boolean).join(' ');
    stats.namesSplit++;
  } else if (!fields.full_name) {
    fields.full_name = [fields.first_name, fields.last_name].filter(Boolean).join(' ');
  }

  const rawEmail = cleanText(fields.email);
  fields.email = normalizeEmail(rawEmail);
  if (rawEmail && !fields.email) stats.junkEmailsRemoved++;

  fields.phone = normalizePhone(fields.phone, countryCode).value;

  const site = normalizeWebsite(fields.website);
  fields.website = site.website;
  fields.domain = site.domain;

  fields.company = isJunk(fields.company) ? '' : cleanText(fields.company);
  return { fields, extra };
}

/** Flags are derived from the final values so merged rows are judged on what is written. */
export function flagRecord(record, countryCode = '1') {
  const { email, phone, website, domain, full_name: fullName, company } = record.fields;
  const flags = [];
  if (email && !isValidEmail(email)) flags.push('invalid_email');
  if (phone) {
    const { issue } = normalizePhone(phone, countryCode);
    if (issue) flags.push(issue);
  }
  if (website && !domain) flags.push('invalid_website');
  if (!email && !phone) flags.push('no_contact');
  if (!fullName) flags.push('missing_name');
  if (!company) flags.push('missing_company');
  return flags;
}

/**
 * Cleans CSV text and returns { header, rows, rejected, stats }.
 * `rows` and `rejected` are arrays of string arrays ready for stringifyCsv.
 */
export function cleanCsv(text, { countryCode = '1', dedupe: doDedupe = true, dropInvalid = false } = {}) {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error('Input CSV is empty');

  const [headerRow, ...body] = table;
  const mapping = detectHeaders(headerRow);
  const extraHeaders = headerRow.map((h) => cleanText(h)).filter((_, i) => !mapping[i]);
  const header = [...CANONICAL_FIELDS, ...extraHeaders, 'flags'];

  const stats = {
    rowsIn: 0,
    rowsOut: 0,
    rejected: 0,
    duplicatesMerged: 0,
    namesSplit: 0,
    junkEmailsRemoved: 0,
    flagCounts: {},
    columns: Object.fromEntries(
      mapping.flatMap((field, i) => (field ? [[field, cleanText(headerRow[i])]] : [])),
    ),
    unmappedColumns: extraHeaders,
  };

  let records = body
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => normalizeRecord(r, mapping, countryCode, stats));
  stats.rowsIn = records.length;

  if (doDedupe) {
    const result = dedupe(records);
    records = result.records;
    stats.duplicatesMerged = result.merged;
  }

  const rows = [];
  const rejected = [];
  for (const record of records) {
    const flags = flagRecord(record, countryCode);
    for (const f of flags) stats.flagCounts[f] = (stats.flagCounts[f] ?? 0) + 1;
    const line = [...CANONICAL_FIELDS.map((f) => record.fields[f]), ...record.extra, flags.join('; ')];
    if (dropInvalid && flags.some((f) => REJECT_FLAGS.has(f))) rejected.push(line);
    else rows.push(line);
  }
  stats.rowsOut = rows.length;
  stats.rejected = rejected.length;

  return { header, rows, rejected, stats };
}

export function formatSummary(stats, { output, rejectedPath, dryRun } = {}) {
  const lines = [];
  lines.push('lead-csv-cleaner summary');
  lines.push('------------------------');
  lines.push(`Rows read:            ${stats.rowsIn}`);
  lines.push(`Duplicates merged:    ${stats.duplicatesMerged}`);
  lines.push(`Rows written:         ${stats.rowsOut}`);
  if (rejectedPath !== undefined) lines.push(`Rows rejected:        ${stats.rejected}`);
  lines.push(`Names split:          ${stats.namesSplit}`);
  lines.push(`Junk emails removed:  ${stats.junkEmailsRemoved}`);
  lines.push('');
  lines.push('Columns detected:');
  for (const [field, source] of Object.entries(stats.columns)) lines.push(`  ${field.padEnd(11)} <- "${source}"`);
  if (stats.unmappedColumns.length) lines.push(`  (kept as-is: ${stats.unmappedColumns.map((c) => `"${c}"`).join(', ')})`);
  lines.push('');
  const flags = Object.entries(stats.flagCounts).sort((a, b) => b[1] - a[1]);
  lines.push(flags.length ? 'Flags:' : 'Flags: none');
  for (const [flag, count] of flags) lines.push(`  ${flag.padEnd(16)} ${count}`);
  lines.push('');
  if (dryRun) lines.push('Dry run: no files written.');
  else {
    lines.push(`Output:   ${output}`);
    if (rejectedPath !== undefined) lines.push(`Rejected: ${rejectedPath}`);
  }
  return lines.join('\n');
}
