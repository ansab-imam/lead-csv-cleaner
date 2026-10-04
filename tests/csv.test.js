import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, stringifyCsv } from '../src/csv.js';

test('parses simple rows with LF and CRLF line endings', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('strips a UTF-8 BOM', () => {
  assert.deepEqual(parseCsv('﻿email\nx@example.com\n'), [['email'], ['x@example.com']]);
});

test('handles quoted fields with commas, escaped quotes and newlines', () => {
  const text = 'name,note\r\n"Smith, Ann","She said ""hi""\r\nthen left"\r\n';
  assert.deepEqual(parseCsv(text), [
    ['name', 'note'],
    ['Smith, Ann', 'She said "hi"\r\nthen left'],
  ]);
});

test('keeps empty fields, including a trailing empty field', () => {
  assert.deepEqual(parseCsv('a,,c,\n'), [['a', '', 'c', '']]);
  assert.deepEqual(parseCsv('a,""\n'), [['a', '']]);
});

test('skips blank lines', () => {
  assert.deepEqual(parseCsv('a\n\n1\n\n'), [['a'], ['1']]);
});

test('throws on an unterminated quote', () => {
  assert.throws(() => parseCsv('a,"b\n'), /unterminated/);
});

test('stringify quotes only when needed and round-trips', () => {
  const rows = [['plain', 'with,comma', 'with "quote"', 'multi\nline', '']];
  const out = stringifyCsv(rows);
  assert.equal(out, 'plain,"with,comma","with ""quote""","multi\nline",\r\n');
  assert.deepEqual(parseCsv(out), rows);
});
