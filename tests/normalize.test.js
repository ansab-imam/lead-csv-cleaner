import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fixNameCase,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
  splitFullName,
} from '../src/normalize.js';
import { detectHeaders } from '../src/headers.js';

test('name casing', () => {
  assert.equal(fixNameCase("  JOHN   o'NEIL "), "John O'Neil");
  assert.equal(fixNameCase('sarah mcdonald'), 'Sarah McDonald');
  assert.equal(fixNameCase('DAVID MACKENZIE'), 'David Mackenzie');
  assert.equal(fixNameCase('mary-jane watson-reed'), 'Mary-Jane Watson-Reed');
  assert.equal(fixNameCase("JONES'S"), "Jones's");
  assert.equal(fixNameCase('thomas "tom" hughes'), 'Thomas "Tom" Hughes');
  assert.equal(fixNameCase('n/a'), '');
});

test('full name splitting', () => {
  assert.deepEqual(splitFullName('Emma Hartley'), { first: 'Emma', last: 'Hartley' });
  assert.deepEqual(splitFullName('Anna de la Cruz'), { first: 'Anna', last: 'de la Cruz' });
  assert.deepEqual(splitFullName('Hartley, Emma'), { first: 'Emma', last: 'Hartley' });
  assert.deepEqual(splitFullName('Cher'), { first: 'Cher', last: '' });
});

test('email normalisation and validation', () => {
  assert.equal(normalizeEmail('  John.ONeil@Example.COM '), 'john.oneil@example.com');
  assert.equal(normalizeEmail('mailto:a@example.com'), 'a@example.com');
  for (const junk of ['n/a', 'None', '-', '', 'null']) assert.equal(normalizeEmail(junk), '');
  assert.ok(isValidEmail('a.b+tag@sub.example.com'));
  assert.ok(!isValidEmail('priya.shah@example'));
  assert.ok(!isValidEmail('a@@example.com'));
  assert.ok(!isValidEmail('a..b@example.com'));
  assert.ok(!isValidEmail('.a@example.com'));
});

test('phone normalisation with default country code 1', () => {
  assert.deepEqual(normalizePhone('(212) 555-0101'), { value: '+12125550101', issue: null });
  assert.deepEqual(normalizePhone('1-212-555-0105'), { value: '+12125550105', issue: null });
  assert.deepEqual(normalizePhone('212-555-0105 ext. 12'), { value: '+12125550105', issue: null });
  assert.deepEqual(normalizePhone('+44 20 7946 0958'), { value: '+442079460958', issue: null });
  assert.deepEqual(normalizePhone('555-0104'), { value: '5550104', issue: 'short_phone' });
  assert.deepEqual(normalizePhone('212-555-01100000'), { value: '21255501100000', issue: 'long_phone' });
  assert.deepEqual(normalizePhone('-'), { value: '', issue: null });
  assert.equal(normalizePhone('call me').issue, 'invalid_phone');
});

test('phone normalisation with another country code', () => {
  assert.deepEqual(normalizePhone('020 7946 0958', '44'), { value: '+442079460958', issue: null });
  assert.deepEqual(normalizePhone('0044 20 7946 0958', '44'), { value: '+442079460958', issue: null });
  assert.equal(normalizePhone('123', '44').issue, 'short_phone');
});

test('normalisation is idempotent for valid phones', () => {
  assert.deepEqual(normalizePhone('+12125550101'), { value: '+12125550101', issue: null });
});

test('website normalisation strips www, paths and tracking', () => {
  assert.deepEqual(normalizeWebsite('https://www.Brightwater.example/contact?utm_source=apollo'), {
    website: 'https://brightwater.example',
    domain: 'brightwater.example',
    issue: null,
  });
  assert.equal(normalizeWebsite('greenleaf.example/about').website, 'https://greenleaf.example');
  assert.equal(normalizeWebsite('http://oakridge.example').website, 'https://oakridge.example');
  assert.equal(normalizeWebsite('turner studio').issue, 'invalid_website');
  assert.equal(normalizeWebsite('someone@example.com').issue, 'invalid_website');
  assert.deepEqual(normalizeWebsite('n/a'), { website: '', domain: '', issue: null });
});

test('header detection', () => {
  assert.deepEqual(
    detectHeaders(['E-mail', 'Phone Number', 'Company Name', 'Full Name', 'Website', 'Notes', 'Mobile']),
    ['email', 'phone', 'company', 'full_name', 'website', null, null],
  );
  assert.deepEqual(detectHeaders(['Email Address', 'Tel', 'Business', 'First Name', 'Last Name', 'Domain']), [
    'email',
    'phone',
    'company',
    'first_name',
    'last_name',
    'website',
  ]);
});
