import { normalizeEmail, normalizePhone, digitsOnly } from './normalization.js';

/**
 * Déduplique les emails
 */
export function deduplicateEmails(emails) {
  const seen = new Set();
  const deduplicated = [];
  
  for (const email of emails) {
    const normalized = normalizeEmail(email.value);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduplicated.push(email);
    }
  }
  
  return deduplicated;
}

/**
 * Déduplique les phones
 */
export function deduplicatePhones(phones) {
  const seen = new Set();
  const deduplicated = [];
  
  for (const phone of phones) {
    const key = phone.valueE164 || digitsOnly(phone.valueRaw);
    if (key && !seen.has(key)) {
      seen.add(key);
      deduplicated.push(phone);
    }
  }
  
  return deduplicated;
}

