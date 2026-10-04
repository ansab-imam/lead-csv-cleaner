import { isValidEmail } from './normalize.js';

const values = (record) => [...Object.values(record.fields), ...record.extra];

export function completeness(record) {
  return values(record).filter((v) => v !== '').length;
}

export function dedupeKeys(record) {
  const { email, phone, company, full_name: fullName } = record.fields;
  const keys = [];
  if (email && isValidEmail(email)) keys.push(`email:${email.toLowerCase()}`);
  if (phone && phone.startsWith('+')) keys.push(`phone:${phone.replace(/\D/g, '')}`);
  if (company && fullName) keys.push(`name:${company.toLowerCase()}|${fullName.toLowerCase()}`);
  return keys;
}

const isUsable = {
  email: (v) => isValidEmail(v),
  phone: (v) => v.startsWith('+'),
};

/**
 * The most complete record wins; its blanks are filled from the others in
 * input order. An invalid email or phone is also replaced by a valid one from
 * a duplicate, since the duplicate usually holds the corrected value.
 */
export function mergeRecords(records) {
  let best = records[0];
  for (const r of records) if (completeness(r) > completeness(best)) best = r;

  const merged = { fields: { ...best.fields }, extra: [...best.extra] };
  for (const r of records) {
    if (r === best) continue;
    for (const [k, v] of Object.entries(r.fields)) {
      // Website and domain travel together so they never describe different sites.
      if (k === 'domain') continue;
      const current = merged.fields[k];
      const upgrade = isUsable[k] && current !== '' && !isUsable[k](current) && v !== '' && isUsable[k](v);
      if ((current === '' && v !== '') || upgrade) {
        merged.fields[k] = v;
        if (k === 'website') merged.fields.domain = r.fields.domain;
      }
    }
    r.extra.forEach((v, i) => {
      if (merged.extra[i] === '' && v !== '') merged.extra[i] = v;
    });
  }
  return merged;
}

/**
 * Groups records that share an email, then a phone, then company + full name.
 * Matching is checked in that order against every group seen so far, and the
 * group's keys grow as records join it, so A~B by email and B~C by phone puts
 * all three together. Output order follows each group's first appearance.
 */
export function dedupe(records) {
  const groups = [];
  const index = new Map();

  for (const record of records) {
    const keys = dedupeKeys(record);
    const hit = keys.find((k) => index.has(k));
    let group;
    if (hit) {
      group = index.get(hit);
      group.push(record);
    } else {
      group = [record];
      groups.push(group);
    }
    for (const k of keys) if (!index.has(k)) index.set(k, group);
  }

  return {
    records: groups.map((g) => (g.length === 1 ? g[0] : mergeRecords(g))),
    merged: records.length - groups.length,
  };
}
