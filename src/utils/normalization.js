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
  
  const cleaned = phoneRaw.trim();
  let valueE164 = null;
  
  try {
    // Essaie de parser avec libphonenumber-js
    // On essaie plusieurs pays courants
    const countries = ['FR', 'US', 'GB', 'DE', 'ES', 'IT', 'BE', 'CH'];
    
    for (const country of countries) {
      try {
        const phoneNumber = parsePhoneNumber(cleaned, country);
        if (isValidPhoneNumber(phoneNumber.number)) {
          valueE164 = phoneNumber.number;
          break;
        }
      } catch {
        // Continue avec le pays suivant
      }
    }
    
    // Si aucun pays ne fonctionne, essaie sans pays
    if (!valueE164) {
      try {
        const phoneNumber = parsePhoneNumber(cleaned);
        if (isValidPhoneNumber(phoneNumber.number)) {
          valueE164 = phoneNumber.number;
        }
      } catch {
        // Ignore les erreurs de parsing
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
