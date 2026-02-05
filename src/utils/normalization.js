import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { EMAIL_FILTERS, EMAIL_TYPE_PATTERNS } from '../constants.js';

/**
 * Normalise un email (lowercase, trim, strip ponctuation finale)
 */
export function normalizeEmail(email) {
  if (!email) return null;
  
  let normalized = email.trim().toLowerCase();
  
  // Supprime la ponctuation finale (.,;:)
  normalized = normalized.replace(/[.,;:]$/, '');
  
  // Nettoie les préfixes numériques collés (ex: "00hotel@operaliege.com" -> "hotel@operaliege.com")
  // Ces préfixes viennent souvent de numéros de téléphone collés au texte
  // Pattern: un ou plusieurs digits au début, suivis directement d'une lettre
  normalized = normalized.replace(/^\d+([a-z])/, '$1');
  
  return normalized;
}

/**
 * Vérifie si un email doit être filtré
 */
export function shouldFilterEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return true;
  
  return EMAIL_FILTERS.some(filter => normalized.includes(filter));
}

/**
 * Extrait les digits uniquement d'un numéro de téléphone
 */
export function digitsOnly(phone) {
  return phone.replace(/\D/g, '');
}

/**
 * Nettoie un snippet pour l'output (JSON stable et lisible)
 * - supprime les caractères de contrôle
 * - remplace les retours ligne / tabs par des espaces
 * - compacte les espaces
 */
export function cleanSnippet(snippet, maxLen = 240) {
  if (!snippet) return null;
  const cleaned = String(snippet)
    .replace(/[\u0000-\u001F\u007F]/g, ' ') // contrôle ASCII
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

/**
 * Normalise un numéro de téléphone
 * Retourne { valueRaw, valueE164 }
 */
export function normalizePhone(phoneRaw) {
  if (!phoneRaw) return { valueRaw: null, valueE164: null };
  
  let cleaned = phoneRaw.trim();
  let valueE164 = null;
  
  try {
    // Normalisation CONSERVATRICE pour éviter de transformer des IDs en numéros (ex: appId/ovh)
    // 1) Si ça commence par "+", on parse tel quel (format international explicite)
    if (cleaned.startsWith('+')) {
      const phoneNumber = parsePhoneNumber(cleaned);
      if (phoneNumber?.number && isValidPhoneNumber(phoneNumber.number)) valueE164 = phoneNumber.number;
    } else {
      // 2) Si ça commence par "00", on convertit en "+"
      if (/^00\d/.test(cleaned)) cleaned = `+${cleaned.slice(2)}`;

      if (cleaned.startsWith('+')) {
        const phoneNumber = parsePhoneNumber(cleaned);
        if (phoneNumber?.number && isValidPhoneNumber(phoneNumber.number)) valueE164 = phoneNumber.number;
      } else {
        // 3) Sinon, on tente uniquement FR (par défaut v1)
        const phoneNumber = parsePhoneNumber(cleaned, 'FR');
        if (phoneNumber?.number && isValidPhoneNumber(phoneNumber.number)) valueE164 = phoneNumber.number;
      }
    }
  } catch {
    // Ignore les erreurs de parsing
  }
  
  return {
    valueRaw: cleaned,
    valueE164
  };
}

/**
 * Détecte le type d'email depuis sa valeur ou son contexte
 */
export function detectEmailType(email, context = '') {
  const lowerEmail = email.toLowerCase();
  const lowerContext = context.toLowerCase();
  
  const combined = `${lowerEmail} ${lowerContext}`;
  
  for (const [type, patterns] of Object.entries(EMAIL_TYPE_PATTERNS)) {
    if (patterns.some(pattern => combined.includes(pattern))) {
      return type;
    }
  }
  
  return 'general';
}
