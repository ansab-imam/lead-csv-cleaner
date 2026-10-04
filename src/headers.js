const ALIASES = {
  email: ['email', 'e-mail', 'email address', 'e-mail address', 'mail', 'work email', 'business email', 'contact email'],
  phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'mobile number', 'cell', 'cell phone', 'tel', 'telephone', 'work phone', 'contact number'],
  company: ['company', 'company name', 'business', 'business name', 'organization', 'organisation', 'account name', 'employer'],
  first_name: ['first name', 'firstname', 'first', 'given name', 'forename'],
  last_name: ['last name', 'lastname', 'last', 'surname', 'family name'],
  full_name: ['full name', 'fullname', 'name', 'contact name', 'contact'],
  website: ['website', 'url', 'domain', 'web', 'site', 'web site', 'company website', 'homepage', 'company domain'],
};

const key = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const LOOKUP = new Map();
for (const [field, names] of Object.entries(ALIASES)) {
  for (const name of names) LOOKUP.set(key(name), field);
}

export const CANONICAL_FIELDS = ['first_name', 'last_name', 'full_name', 'email', 'phone', 'company', 'website', 'domain'];

/**
 * Maps each header index to a canonical field, or null when unrecognised.
 * Only the first column matching a field wins, so a second "Phone" column is
 * passed through untouched rather than silently overwriting the first.
 */
export function detectHeaders(headers) {
  const used = new Set();
  return headers.map((h) => {
    const field = LOOKUP.get(key(h.trim()));
    if (!field || used.has(field)) return null;
    used.add(field);
    return field;
  });
}
