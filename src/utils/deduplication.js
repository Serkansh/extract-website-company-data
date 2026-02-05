import { normalizeEmail, normalizePhone, digitsOnly } from './normalization.js';

/**
 * Déduplique les emails
 */
export function deduplicateEmails(emails) {
  const seen = new Set();
  const deduplicated = [];
  
  for (const email of emails) {
    const normalized = normalizeEmail(email.value);
    
    // Déduplication stricte : même email exact
    if (seen.has(normalized)) {
      continue;
    }
    
    // Déduplication par domaine : si on a déjà contact@domain.com, on ignore contact@domain.fr
    // (sauf si l'un est primary et l'autre non)
    const emailParts = normalized.split('@');
    if (emailParts.length === 2) {
      const [localPart, domain] = emailParts;
      const domainVariants = [
        domain,
        domain.replace(/\.fr$/, '.com'),
        domain.replace(/\.com$/, '.fr')
      ];
      
      // Vérifie si un variant existe déjà
      let duplicate = false;
      for (const variant of domainVariants) {
        const variantEmail = `${localPart}@${variant}`;
        if (seen.has(variantEmail) && variantEmail !== normalized) {
          // Garde celui qui est primary, sinon garde le premier
          const existing = deduplicated.find(e => normalizeEmail(e.value) === variantEmail);
          if (existing && existing.priority === 'primary' && email.priority !== 'primary') {
            duplicate = true;
            break;
          }
          // Si les deux sont primary ou secondary, garde le premier (celui déjà dans seen)
          duplicate = true;
          break;
        }
      }
      
      if (duplicate) {
        continue;
      }
    }
    
    seen.add(normalized);
    deduplicated.push(email);
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

