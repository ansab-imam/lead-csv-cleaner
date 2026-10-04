const JUNK = new Set(['n/a', 'na', 'none', 'null', 'nil', '-', '--', '.', '?', 'unknown', 'tbd', 'x', 'test']);

export function isJunk(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '' || JUNK.has(v);
}

export function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function capitalise(part) {
  if (!part) return part;
  const lower = part.toLowerCase();
  // Only "Mc" is treated as a prefix: "Mac" is too ambiguous (Mack, Macy, Machado).
  if (lower.length > 2 && lower.startsWith('mc')) {
    return 'Mc' + lower[2].toUpperCase() + lower.slice(3);
  }
  // Skip leading punctuation so nicknames like "tom" in quotes still get capitalised.
  return lower.replace(/\p{L}/u, (c) => c.toUpperCase());
}

export function fixNameCase(value) {
  const name = cleanText(value);
  if (isJunk(name)) return '';
  return name
    .split(' ')
    .map((word) =>
      word
        .split(/([-'’])/)
        .map((part, i, arr) => {
          if (part === '-' || part === "'" || part === '’') return part;
          // A single letter after an apostrophe is a possessive or contraction ("Jones's").
          if (i > 0 && arr[i - 1] !== '-' && part.length === 1) return part.toLowerCase();
          return capitalise(part);
        })
        .join(''),
    )
    .join(' ');
}

/** Splits on the first space; "Last, First" (common in CRM exports) is reordered first. */
export function splitFullName(full) {
  const name = cleanText(full);
  const comma = name.split(',');
  if (comma.length === 2 && comma[0].trim() && comma[1].trim()) {
    return { first: cleanText(comma[1]), last: cleanText(comma[0]) };
  }
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

/** Lowercases and trims; obvious placeholders ("n/a", "none", "-") become empty. */
export function normalizeEmail(value) {
  const email = cleanText(value).toLowerCase().replace(/^mailto:/, '').replace(/^<|>$/g, '');
  if (isJunk(email)) return '';
  return email.replace(/\s/g, '');
}

export function isValidEmail(email) {
  if (!EMAIL_RE.test(email)) return false;
  const local = email.split('@')[0];
  return !local.startsWith('.') && !local.endsWith('.') && !email.includes('..');
}

/**
 * Returns { value, issue }. Valid numbers come back as "+<country><number>".
 * Numbers that already start with "+" or "00" keep their own country code;
 * national numbers get `countryCode` prepended (after dropping a trunk "0").
 * Invalid numbers keep their bare digits so nothing is lost.
 */
export function normalizePhone(value, countryCode = '1') {
  let raw = cleanText(value);
  if (isJunk(raw)) return { value: '', issue: null };
  raw = raw.replace(/\s*(?:ext\.?|extension|x|#)\s*\d+$/i, '');

  const international = raw.startsWith('+') || raw.startsWith('00');
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (digits === '') return { value: raw, issue: 'invalid_phone' };

  if (!international) {
    if (countryCode === '1') {
      // NANP numbers are exactly 10 digits, so the length check can be strict.
      if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
      if (digits.length !== 10) {
        return { value: digits, issue: digits.length < 10 ? 'short_phone' : 'long_phone' };
      }
      digits = '1' + digits;
    } else {
      if (digits.startsWith('0')) digits = digits.slice(1);
      if (!digits.startsWith(countryCode)) digits = countryCode + digits;
    }
  }

  // E.164 caps numbers at 15 digits; nothing dialable is shorter than 8.
  if (digits.length < 8) return { value: digits, issue: 'short_phone' };
  if (digits.length > 15) return { value: digits, issue: 'long_phone' };
  return { value: '+' + digits, issue: null };
}

/**
 * Returns { website, domain, issue }. The website is reduced to
 * "https://<host>" with "www." removed; paths, query strings and tracking
 * parameters are discarded because CRMs match accounts on the domain.
 */
export function normalizeWebsite(value) {
  const raw = cleanText(value);
  if (isJunk(raw)) return { website: '', domain: '', issue: null };
  if (raw.includes('@') && !raw.includes('/')) return { website: raw, domain: '', issue: 'invalid_website' };

  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { website: raw, domain: '', issue: 'invalid_website' };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host)) {
    return { website: raw, domain: '', issue: 'invalid_website' };
  }
  return { website: `https://${host}`, domain: host, issue: null };
}
