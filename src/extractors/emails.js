import * as cheerio from 'cheerio';
import { EMAIL_REGEX } from '../constants.js';
import { normalizeEmail, shouldFilterEmail, detectEmailType, cleanSnippet } from '../utils/normalization.js';
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
    // On exige un suffixe ICANN reconnu, sinon on rejette (ex: "mysmartdigital.frdirecteur")
    if (!parsed || !parsed.domain || parsed.isIcann !== true) return false;
    const registrable = parsed.domain.toLowerCase();
    const full = emailDomain.toLowerCase();
    // Accepte le registrable domain ou un sous-domaine de celui-ci
    return full === registrable || full.endsWith(`.${registrable}`);
  };

  /**
   * Vérifie si un email est concaténé avec un numéro de téléphone ou d'autres éléments
   * Exemples à rejeter : "555-555-5555mymail@mailservice.com", "123email@domain.com"
   */
  const isConcatenatedEmail = (emailValue, context) => {
    if (!emailValue || !context) return false;
    
    // Trouve la position de l'email dans le contexte
    const emailIndex = context.toLowerCase().indexOf(emailValue.toLowerCase());
    if (emailIndex === -1) return false;
    
    // Vérifie les caractères avant l'email (sur une fenêtre de 20 caractères)
    const beforeEmail = context.substring(Math.max(0, emailIndex - 20), emailIndex);
    
    // Pattern pour détecter un numéro de téléphone avant l'email
    // Exemples : "555-555-5555", "+1 555 555 5555", "(555) 555-5555", etc.
    const phonePattern = /[\d\s\-+().]{7,}$/;
    if (phonePattern.test(beforeEmail.trim())) {
      // Vérifie si le dernier caractère avant l'email est un chiffre ou un séparateur de téléphone
      const lastChar = beforeEmail.trim().slice(-1);
      if (/\d[\-+().]/.test(beforeEmail.trim().slice(-2))) {
        return true; // Probablement un numéro de téléphone collé à l'email
      }
    }
    
    // Vérifie si l'email commence directement après des chiffres sans séparateur
    // Exemple : "5555555555email@domain.com"
    const digitsBefore = beforeEmail.match(/\d+$/);
    if (digitsBefore && digitsBefore[0].length >= 7) {
      // Si on a 7+ chiffres consécutifs juste avant l'email, c'est suspect
      return true;
    }
    
    return false;
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
        
        // Utilise l'email normalisé comme snippet si le texte du lien ne contient pas l'email
        // ou si le texte contient un autre email (cas de hospedajenuevanumancia.com)
        let snippet = cleanSnippet(text) || normalized;
        if (!text.toLowerCase().includes(normalized.toLowerCase())) {
          // Si le texte du lien ne contient pas l'email, utilise l'email lui-même
          snippet = normalized;
        } else {
          // Sinon, utilise le contexte autour du lien pour avoir plus d'infos
          snippet = cleanSnippet(context) || normalized;
        }
        
        emails.push({
          value: normalized,
          type: detectEmailType(normalized, text + ' ' + context),
          priority: 'secondary',
          signals,
          sourceUrl,
          snippet: snippet,
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
      
      // Trouve le contexte autour de l'email pour vérifier les concaténations
      const index = textContent.indexOf(emailMatch);
      const snippet = textContent.substring(Math.max(0, index - 50), index + emailMatch.length + 50).trim();
      
      // Vérifie si l'email est concaténé avec un numéro de téléphone ou d'autres éléments
      if (isConcatenatedEmail(emailValue, snippet)) {
        continue; // Ignore cet email car il est concaténé
      }
      
      // Vérifie si déjà trouvé via mailto
      if (!emails.some(e => normalizeEmail(e.value) === normalized)) {
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
          snippet: cleanSnippet(snippet) || normalized,
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
