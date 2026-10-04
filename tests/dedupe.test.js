import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupe } from '../src/dedupe.js';

const rec = (fields, extra = []) => ({
  fields: {
    first_name: '',
    last_name: '',
    full_name: '',
    email: '',
    phone: '',
    company: '',
    website: '',
    domain: '',
    ...fields,
  },
  extra,
});

test('merges by email and keeps the most complete row', () => {
  const { records, merged } = dedupe([
    rec({ email: 'a@example.com', full_name: 'Ann Lee' }),
    rec({ email: 'a@example.com', full_name: 'Ann Lee', company: 'Lee Co', phone: '+12125550101' }, ['CEO']),
  ]);
  assert.equal(merged, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].fields.company, 'Lee Co');
  assert.deepEqual(records[0].extra, ['CEO']);
});

test('fills blanks from duplicates', () => {
  const { records } = dedupe([
    rec({ email: 'a@example.com', company: 'Lee Co', full_name: 'Ann Lee' }),
    rec({ email: 'a@example.com', website: 'https://lee.example', domain: 'lee.example' }),
  ]);
  assert.equal(records[0].fields.company, 'Lee Co');
  assert.equal(records[0].fields.website, 'https://lee.example');
  assert.equal(records[0].fields.domain, 'lee.example');
});

test('matches by phone when emails differ or are missing', () => {
  const { records } = dedupe([rec({ phone: '+12125550101', full_name: 'Ann Lee' }), rec({ phone: '+12125550101', email: 'a@example.com' })]);
  assert.equal(records.length, 1);
  assert.equal(records[0].fields.email, 'a@example.com');
});

test('matches by company + full name', () => {
  const { records } = dedupe([
    rec({ company: 'Lee Co', full_name: 'Ann Lee', email: 'a@example.com' }),
    rec({ company: 'lee co', full_name: 'ann lee', phone: '+12125550101' }),
  ]);
  assert.equal(records.length, 1);
});

test('chains matches across different keys', () => {
  const { records } = dedupe([
    rec({ email: 'a@example.com' }),
    rec({ email: 'a@example.com', phone: '+12125550101' }),
    rec({ phone: '+12125550101', company: 'Lee Co' }),
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].fields.company, 'Lee Co');
});

test('replaces an invalid email with a valid one from a duplicate', () => {
  const { records } = dedupe([
    rec({ email: 'ann@lee', phone: '+12125550101', company: 'Lee Co', full_name: 'Ann Lee' }),
    rec({ email: 'ann@lee.example', phone: '+12125550101' }),
  ]);
  assert.equal(records[0].fields.email, 'ann@lee.example');
});

test('does not merge on invalid emails or flagged phones', () => {
  const { records } = dedupe([rec({ email: 'n@x', phone: '5550101' }), rec({ email: 'n@x', phone: '5550101' })]);
  assert.equal(records.length, 2);
});
