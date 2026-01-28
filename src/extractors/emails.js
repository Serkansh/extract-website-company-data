import * as cheerio from 'cheerio';
import { EMAIL_REGEX } from '../constants.js';
import { normalizeEmail, shouldFilterEmail, detectEmailType } from '../utils/normalization.js';
import { getRegistrableDomain } from '../utils/url-utils.js';
import { parse as tldtsParse } from 'tldts';

/**
 * Extrait les emails depuis une page HTML
 */
export function extractEmails(html, sourceUrl) {
  const emails = [];
  const $ = cheerio.load(html);
  const domain = getRegistrableDomain(sourceUrl);

  // IMPORTANT: on ignore le contenu des scripts/styles pour éviter de "coller" des tokens
  $('script, style, noscript').remove();

  const isValidEmailDomain = (emailDomain) => {
    if (!emailDomain) return false;
    // Rejette les domaines manifestement invalides (espaces, quotes, etc.)
    if (/[\s"'<>()]/.test(emailDomain)) return false;
    const parsed = tldtsParse(`https://${emailDomain}`);
    // Si tldts ne reconnaît pas le domaine ICANN (ex: "mysmartdigital.frdirecteur"), on rejette
    if (!parsed || !parsed.domain) return false;
    // parsed.domain = registrable domain, doit matcher exactement le domaine email
    return parsed.domain.toLowerCase() === emailDomain.toLowerCase();
  };
  
  // 1. Liens mailto
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href');
    const emailMatch = href.match(/mailto:([^\?&]+)/i);
    if (emailMatch) {
      const emailValue = emailMatch[1].trim();
      if (!shouldFilterEmail(emailValue)) {
        const normalized = normalizeEmail(emailValue);
        const text = $(el).text().trim();
        const context = $(el).closest('section, div, article').text().substring(0, 200);
        
        const emailDomain = normalized.split('@')[1];
        const signals = ['mailto'];
        if (emailDomain === domain) {
          signals.push('same_domain');
        }
        
        emails.push({
          value: normalized,
          type: detectEmailType(normalized, text + ' ' + context),
          priority: 'secondary',
          signals,
          sourceUrl,
          snippet: text || normalized,
          foundIn: 'mailto'
        });
      }
    }
  });
  
  // 2. Texte brut (regex)
  const textContent = $.text();
  const emailMatches = textContent.match(EMAIL_REGEX) || [];
  
  for (const emailMatch of emailMatches) {
    const emailValue = emailMatch.trim();
    if (!shouldFilterEmail(emailValue)) {
      const normalized = normalizeEmail(emailValue);
      const emailDomain = normalized.split('@')[1];
      if (!isValidEmailDomain(emailDomain)) continue;
      
      // Vérifie si déjà trouvé via mailto
      if (!emails.some(e => normalizeEmail(e.value) === normalized)) {
        // Trouve le contexte autour de l'email
        const index = textContent.indexOf(emailMatch);
        const snippet = textContent.substring(Math.max(0, index - 50), index + emailMatch.length + 50).trim();
        const signals = ['text'];
        if (emailDomain === domain) {
          signals.push('same_domain');
        }
        
        emails.push({
          value: normalized,
          type: detectEmailType(normalized, snippet),
          priority: 'secondary',
          signals,
          sourceUrl,
          snippet,
          foundIn: 'text'
        });
      }
    }
  }
  
  // 3. JSON-LD schema.org
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const jsonContent = $(el).html();
      const data = JSON.parse(jsonContent);
      
      function extractFromSchema(obj) {
        if (typeof obj !== 'object' || obj === null) return;
        
        if (Array.isArray(obj)) {
          obj.forEach(item => extractFromSchema(item));
          return;
        }
        
        // Cherche les emails dans les propriétés
        for (const [key, value] of Object.entries(obj)) {
          if (key === 'email' || key === 'contactPoint') {
            if (typeof value === 'string') {
              const emailValue = value.trim();
              if (!shouldFilterEmail(emailValue)) {
                const normalized = normalizeEmail(emailValue);
                if (!emails.some(e => normalizeEmail(e.value) === normalized)) {
                  const emailDomain = normalized.split('@')[1];
                  const signals = ['schema'];
                  if (emailDomain === domain) {
                    signals.push('same_domain');
                  }
                  
                  emails.push({
                    value: normalized,
                    type: detectEmailType(normalized, ''),
                    priority: 'secondary',
                    signals,
                    sourceUrl,
                    snippet: normalized,
                    foundIn: 'schema'
                  });
                }
              }
            } else if (typeof value === 'object' && value.email) {
              extractFromSchema(value);
            }
          } else if (typeof value === 'object') {
            extractFromSchema(value);
          }
        }
      }
      
      extractFromSchema(data);
    } catch (error) {
      // Ignore les erreurs de parsing JSON
    }
  });
  
  return emails;
}
