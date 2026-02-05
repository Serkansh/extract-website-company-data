import * as cheerio from 'cheerio';
import { PHONE_REGEX, PHONE_EXCLUSIONS } from '../constants.js';
import { normalizePhone, cleanSnippet } from '../utils/normalization.js';

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
  if (/(siret|siren|tva|vat|rcs|capital social|registre du commerce|immatricul)/i.test(s)) return true;
  // Exclure IDs/refs d'hébergement / tracking (cas datawords: ovh etablissement)
  if (/(ovh|societe\.com\/etablissement|appId|tracking|initApollo|data center)/i.test(snippet || '')) return true;
  
  // Exclure les numéros RCS/SIRET (format: XXX XXX XXX ou XXX.XXX.XXX avec 9 digits)
  // Exemples: "752 808 113", "522.921.634", "424 761 419"
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length === 9) {
    // Si le snippet contient "RCS", "SIRET", "immatricul", "registre", c'est probablement un numéro RCS
    if (/(rcs|siret|siren|immatricul|registre|commerce|soci[eé]t[eé]s?)/i.test(s)) return true;
    // Si le format est XXX XXX XXX ou XXX.XXX.XXX (avec espaces ou points), c'est souvent un RCS
    if (/^\d{3}[\s.]\d{3}[\s.]\d{3}$/.test(phone.trim())) {
      // Vérifie le contexte : si c'est proche de "RCS", "SIRET", "n°", "numéro", c'est un RCS
      if (/(rcs|siret|siren|n[°º]|num[eé]ro|immatricul|registre)/i.test(s)) return true;
    }
  }

  return PHONE_EXCLUSIONS.some(pattern => pattern.test(phone) || pattern.test(digits));
}

/**
 * Extrait les phones depuis une page HTML
 */
export function extractPhones(html, sourceUrl) {
  const phones = [];
  const $ = cheerio.load(html);

  // IMPORTANT: ne pas parser le texte des scripts/styles (beaucoup de faux positifs: ids, appId, etc.)
  $('script, style, noscript').remove();
  
  // 1. Liens tel:
  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr('href');
    const phoneMatch = href.match(/tel:([^\?&]+)/i);
    if (phoneMatch) {
      const phoneValue = phoneMatch[1].trim();
      const text = $(el).text().trim();
      const context = $(el).closest('section, div, article, p').text().substring(0, 200).toLowerCase();
      
      // Exclut les fax (détectés dans le contexte ou le texte)
      if (/(fax|télécopie|facsimile)/i.test(text + ' ' + context)) {
        return; // Skip ce numéro, c'est un fax
      }
      
      if (!shouldExcludePhone(phoneValue, text)) {
        const normalized = normalizePhone(phoneValue);
        
        phones.push({
          valueRaw: normalized.valueRaw,
          valueE164: normalized.valueE164,
          priority: 'secondary',
          signals: ['tel'],
          sourceUrl,
          snippet: cleanSnippet(text) || normalized.valueRaw
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

    // Heuristique anti-ID: si c'est juste une suite de digits sans séparateurs ni +,
    // on n'accepte que si c'est clairement FR (0xxxxxxxxx / 0x xx xx xx xx) ou si libphonenumber valide.
    const hasTypicalSeparators = /[+\s().-]/.test(phoneValue);
    const digits = phoneValue.replace(/\D/g, '');
    const looksLikeFrenchNational = /^0\d{9}$/.test(digits);

    if (!hasTypicalSeparators && !looksLikeFrenchNational) {
      // très souvent des IDs (appId, css ids, etc.)
      continue;
    }

    // Exclut les fax (détectés dans le snippet)
    if (/(fax|télécopie|facsimile)\s*[=:]\s*/i.test(snippet)) {
      continue; // Skip ce numéro, c'est un fax
    }
    
    if (!shouldExcludePhone(phoneValue, snippet)) {
      const normalized = normalizePhone(phoneValue);

      // Pour les numéros trouvés dans le texte (pas tel:), on exige une normalisation E.164
      // afin d'éviter que des IDs passent (libphonenumber validant parfois des suites de digits).
      if (!normalized.valueE164) continue;

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
          snippet: cleanSnippet(snippet) || normalized.valueRaw
        });
      }
    }
  }
  
  return phones;
}
