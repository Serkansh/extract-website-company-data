import * as cheerio from 'cheerio';
import { PHONE_REGEX, PHONE_EXCLUSIONS } from '../constants.js';
import { normalizePhone } from '../utils/normalization.js';

/**
 * Vérifie si un numéro doit être exclu
 */
function shouldExcludePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return PHONE_EXCLUSIONS.some(pattern => pattern.test(phone) || pattern.test(digits));
}

/**
 * Extrait les phones depuis une page HTML
 */
export function extractPhones(html, sourceUrl) {
  const phones = [];
  const $ = cheerio.load(html);
  
  // 1. Liens tel:
  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr('href');
    const phoneMatch = href.match(/tel:([^\?&]+)/i);
    if (phoneMatch) {
      const phoneValue = phoneMatch[1].trim();
      if (!shouldExcludePhone(phoneValue)) {
        const normalized = normalizePhone(phoneValue);
        const text = $(el).text().trim();
        
        phones.push({
          valueRaw: normalized.valueRaw,
          valueE164: normalized.valueE164,
          priority: 'secondary',
          signals: ['tel'],
          sourceUrl,
          snippet: text || normalized.valueRaw
        });
      }
    }
  });
  
  // 2. Texte brut (regex)
  const textContent = $.text();
  const phoneMatches = textContent.match(PHONE_REGEX) || [];
  
  for (const phoneMatch of phoneMatches) {
    const phoneValue = phoneMatch.trim();
    if (!shouldExcludePhone(phoneValue)) {
      const normalized = normalizePhone(phoneValue);
      
      // Vérifie si déjà trouvé via tel:
      const alreadyFound = phones.some(p => {
        if (p.valueE164 && normalized.valueE164) {
          return p.valueE164 === normalized.valueE164;
        }
        return p.valueRaw === normalized.valueRaw;
      });
      
      if (!alreadyFound) {
        // Trouve le contexte autour du phone
        const index = textContent.indexOf(phoneMatch);
        const snippet = textContent.substring(Math.max(0, index - 50), index + phoneMatch.length + 50).trim();
        
        // Détecte si dans footer ou contact
        const signals = ['text'];
        const parentText = $(`*:contains("${phoneMatch}")`).first().closest('footer, .footer, .contact, #contact').length > 0;
        if (parentText) {
          signals.push('footer_or_contact');
        }
        
        phones.push({
          valueRaw: normalized.valueRaw,
          valueE164: normalized.valueE164,
          priority: 'secondary',
          signals,
          sourceUrl,
          snippet
        });
      }
    }
  }
  
  return phones;
}
