import * as cheerio from 'cheerio';
import { PHONE_REGEX, PHONE_EXCLUSIONS } from '../constants.js';
import { normalizePhone } from '../utils/normalization.js';

/**
 * Vérifie si un numéro doit être exclu
 */
function shouldExcludePhone(phone, snippet = '') {
  const digits = phone.replace(/\D/g, '');
  const s = (snippet || '').toLowerCase();

  // Exclure les dates / timestamps (ex: 2023-03-19, 2023-03-19T15:24:21)
  if (/^\d{4}[-/]\d{2}[-/]\d{2}(?:[tT].*)?$/.test(phone.trim())) return true;

  // Exclure les strings trop courtes (souvent dates, IDs, fragments JSON)
  // Un téléphone “utile” a quasi toujours >= 9 digits (FR: 10, E.164 max 15)
  if (digits.length < 9) return true;
  if (digits.length > 15) return true;

  // Exclure SIRET / TVA via mots-clés proches
  if (/(siret|siren|tva|vat|rcs|capital social)/i.test(s)) return true;

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
      const text = $(el).text().trim();
      if (!shouldExcludePhone(phoneValue, text)) {
        const normalized = normalizePhone(phoneValue);
        
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
    // Trouve le contexte autour du phone (avant filtrage, pour keywords)
    const index = textContent.indexOf(phoneMatch);
    const snippet = textContent.substring(Math.max(0, index - 80), index + phoneMatch.length + 80).trim();

    if (!shouldExcludePhone(phoneValue, snippet)) {
      const normalized = normalizePhone(phoneValue);

      // Si libphonenumber n'arrive pas à normaliser, on garde quand même (valueE164 = null),
      // mais uniquement si ça ressemble à un numéro (>= 9 digits déjà vérifié ci-dessus).

      // Vérifie si déjà trouvé via tel:
      const alreadyFound = phones.some(p => {
        if (p.valueE164 && normalized.valueE164) {
          return p.valueE164 === normalized.valueE164;
        }
        return p.valueRaw === normalized.valueRaw;
      });
      
      if (!alreadyFound) {
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
