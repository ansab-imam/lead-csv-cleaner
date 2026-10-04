import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanCsv, parseCsv } from '../src/index.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'lead-csv-clean.js');
const example = path.join(root, 'examples', 'messy-leads.csv');
const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

const byEmail = (rows, header, email) => {
  const i = header.indexOf('email');
  return Object.fromEntries(header.map((h, j) => [h, rows.find((r) => r[i] === email)?.[j]]));
};

test('end-to-end on the example file', () => {
  const { header, rows, stats } = cleanCsv(readFileSync(example, 'utf8'));
  assert.equal(stats.rowsIn, 25);
  assert.equal(stats.duplicatesMerged, 6);
  assert.equal(rows.length, 19);
  assert.deepEqual(header.slice(-2), ['Job Title', 'flags']);

  const john = byEmail(rows, header, 'john.oneil@example.com');
  assert.equal(john.full_name, "John O'Neil");
  assert.equal(john.phone, '+12125550101');
  assert.equal(john.website, 'https://brightwater.example');

  const priya = byEmail(rows, header, 'priya@northgate.example');
  assert.equal(priya.flags, '');

  const emma = byEmail(rows, header, 'emma.hartley@example.com');
  assert.equal(emma.first_name, 'Emma');
  assert.equal(emma.last_name, 'Hartley');

  const grace = byEmail(rows, header, 'grace.turner@@example.com');
  assert.equal(grace.flags, 'invalid_email; invalid_website');

  assert.equal(stats.columns.email, 'E-mail');
});

test('--no-dedupe keeps every row', () => {
  const { rows } = cleanCsv(readFileSync(example, 'utf8'), { dedupe: false });
  assert.equal(rows.length, 25);
});

test('first/last columns build full name', () => {
  const { header, rows } = cleanCsv('First Name,Last Name,Email\nANN,mcbride,ann@example.com\n');
  assert.equal(rows[0][header.indexOf('full_name')], 'Ann McBride');
});

test('CLI writes output and rejected files', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lcc-'));
  try {
    const out = path.join(dir, 'out.csv');
    const res = run(example, '-o', out, '--drop-invalid');
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Rows rejected:\s+\d+/);
    const kept = parseCsv(readFileSync(out, 'utf8'));
    const rejected = parseCsv(readFileSync(path.join(dir, 'rejected.csv'), 'utf8'));
    assert.equal(kept.length - 1 + rejected.length - 1, 19);
    assert.ok(rejected.length > 1);
    for (const r of kept.slice(1)) assert.doesNotMatch(r.at(-1), /invalid|short|long|no_contact/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --dry-run writes nothing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lcc-'));
  try {
    const out = path.join(dir, 'out.csv');
    const res = run(example, '-o', out, '--dry-run');
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Dry run/);
    assert.ok(!existsSync(out));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI usage errors exit with 1', () => {
  assert.equal(run().status, 1);
  const missing = run('does-not-exist.csv');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /not found/);
  assert.match(run(example, '--bogus').stderr, /Unknown option/);
  assert.equal(run(example, '--country-code', 'abc').status, 1);
});

test('CLI --help and --version', () => {
  assert.match(run('--help').stdout, /Usage: lead-csv-clean/);
  assert.match(run('--version').stdout, /^\d+\.\d+\.\d+\n$/);
});
