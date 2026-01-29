import * as cheerio from 'cheerio';
import { normalizeEmail } from '../utils/normalization.js';
import { normalizePhone } from '../utils/normalization.js';
import { cleanSnippet } from '../utils/normalization.js';

/**
 * Extrait les membres d'équipe depuis une page HTML
 */
export function extractTeam(html, sourceUrl) {
  const teamMembers = [];
  const $ = cheerio.load(html);

  // Ignore scripts/styles
  $('script, style, noscript').remove();

  // 0) Cas "mentions légales" / "disclaimer": contacts labellisés
  // Exemple:
  // Head of publication: Alexandre Crazover
  // E-mail: dpo@datawords.com
  // Tel: +33 1 75 33 80 80
  const bodyTextRaw = $('body').text();
  const bodyText = bodyTextRaw.replace(/\r/g, '');

  const headPubMatch = bodyText.match(/Head of publication\s*:\s*([^\n]+)\n/i) || bodyText.match(/Directeur(?:\s+de\s+la)?\s+publication\s*:\s*([^\n]+)\n/i);
  if (headPubMatch) {
    const name = headPubMatch[1].trim();

    const emailMatch = bodyText.match(/E-?mail\s*:\s*([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24})/i) ||
      bodyText.match(/Adresse de courrier électronique\s*:\s*([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24})/i);
    const telMatch = bodyText.match(/\bTel(?:\.|ephone)?\s*:\s*([+0-9][0-9\s().-]{6,}[0-9])\b/i);

    const email = emailMatch ? normalizeEmail(emailMatch[1]) : null;
    const phoneNormalized = telMatch ? normalizePhone(telMatch[1]) : { valueRaw: null, valueE164: null };
    const phone = phoneNormalized.valueE164 || phoneNormalized.valueRaw || null;

    const signals = ['legal_labeled_contact'];
    if (email) signals.push('has_email');
    if (phone) signals.push('has_phone');

    teamMembers.push({
      name,
      role: /head of publication/i.test(headPubMatch[0]) ? 'Head of publication' : 'Directeur de la publication',
      email,
      phone,
      linkedin: null,
      sourceUrl,
      signals
    });
  }
  
  // Détecte les blocs répétés (cards de membres d'équipe)
  // Cherche des structures communes : div.team-member, .person-card, etc.
  const teamSelectors = [
    '.team-member', '.team-member-card', '.person-card', '.member-card',
    '.staff-member', '.employee', '.team-item', '[class*="team"]',
    '[class*="member"]', '[class*="person"]'
  ];
  
  let teamCards = $();
  for (const selector of teamSelectors) {
    const found = $(selector);
    if (found.length > 0) {
      teamCards = found;
      break;
    }
  }
  
  // Si pas de structure spécifique, cherche des patterns répétés
  if (teamCards.length === 0) {
    // Cherche des divs avec des images et du texte (pattern commun pour les cards)
    $('div, article, section').each((_, el) => {
      const $el = $(el);
      const hasImage = $el.find('img').length > 0;
      const hasText = $el.text().trim().length > 20;
      const hasName = /[A-Z][a-z]+\s+[A-Z][a-z]+/.test($el.text());
      
      if (hasImage && hasText && hasName) {
        teamCards = teamCards.add($el);
      }
    });
    
    // Si toujours rien, cherche dans les listes (li) - structure très commune pour les teams
    if (teamCards.length === 0) {
      $('li').each((_, el) => {
        const $el = $(el);
        const hasImage = $el.find('img').length > 0;
        const hasText = $el.text().trim().length > 15;
        const hasName = /[A-Z][a-z]+\s+[A-Z][a-z]+/.test($el.text());
        
        if ((hasImage || hasText) && hasName) {
          teamCards = teamCards.add($el);
        }
      });
    }
    
    // Si toujours rien, cherche des headings (h2, h3, h4) avec des noms suivis d'un rôle
    if (teamCards.length === 0) {
      $('h2, h3, h4, h5, h6').each((_, el) => {
        const $el = $(el);
        const text = $el.text().trim();
        const nameMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
        if (nameMatch) {
          // Cherche le parent ou le suivant qui contient le rôle
          const $parent = $el.parent();
          if ($parent.length > 0) {
            teamCards = teamCards.add($parent);
          }
        }
      });
    }
    
    // Dernière tentative: cherche tous les éléments avec un nom (Prénom Nom) et une image ou un LinkedIn
    if (teamCards.length === 0) {
      $('div, article, section, li').each((_, el) => {
        const $el = $(el);
        const text = $el.text().trim();
        const hasName = /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text);
        const hasImage = $el.find('img').length > 0;
        const hasLinkedIn = $el.find('a[href*="linkedin.com/in/"]').length > 0;
        
        // Si on a un nom ET (une image OU un LinkedIn), c'est probablement un membre d'équipe
        if (hasName && (hasImage || hasLinkedIn) && text.length > 10) {
          teamCards = teamCards.add($el);
        }
      });
    }
  }
  
  // Extrait les informations de chaque card
  teamCards.each((_, card) => {
    const $card = $(card);
    const cardText = $card.text();
    
    // Nom (pattern: Prénom Nom) - cherche aussi dans les headings (h2, h3, h4)
    // Amélioration: cherche TOUS les noms possibles dans la card, pas juste le premier
    let nameMatch = null;
    
    // Priorité 1: headings (h2, h3, h4, h5, h6)
    const heading = $card.find('h2, h3, h4, h5, h6').first();
    if (heading.length > 0) {
      const headingText = heading.text();
      nameMatch = headingText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    }
    
    // Priorité 2: texte de la card (cherche le premier nom valide, en évitant "Leadership", "Team", etc.)
    if (!nameMatch) {
      const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g;
      let match;
      while ((match = namePattern.exec(cardText)) !== null) {
        const potentialName = match[1].trim();
        // Exclut les mots-clés communs qui ne sont pas des noms
        if (!/^(Leadership|Team|Our|About|Contact|Company|Business|Services|Products|Solutions|Welcome|Home|Menu|Navigation|Footer|Header)$/i.test(potentialName)) {
          nameMatch = match;
          break;
        }
      }
    }
    
    if (!nameMatch) return;
    
    // Nettoie le nom (supprime tabs, retours ligne, espaces multiples)
    let name = nameMatch[1].trim();
    name = name.replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Supprime les préfixes comme "Leadership" qui peuvent être collés au nom
    name = name.replace(/^(Leadership|Team|Our|About)\s+/i, '').trim();
    
    // Role/Position
    const rolePatterns = [
      /(?:CEO|CTO|CFO|CMO|COO|Founder|Co-founder|Directeur|Directrice|Président|Présidente|Manager|Chef|Lead)/i,
      /(?:([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Manager|Director|Lead|Head|Chef|Responsable))/i
    ];
    
    let role = null;
    for (const pattern of rolePatterns) {
      const match = cardText.match(pattern);
      if (match) {
        role = match[1] || match[0];
        break;
      }
    }
    
    // Email (mailto proche dans la card)
    let email = null;
    const mailtoLink = $card.find('a[href^="mailto:"]').first();
    if (mailtoLink.length > 0) {
      const href = mailtoLink.attr('href');
      const emailMatch = href.match(/mailto:([^\?&]+)/i);
      if (emailMatch) {
        email = normalizeEmail(emailMatch[1]);
      }
    }
    
    // LinkedIn personnel (/in/)
    let linkedin = null;
    const linkedinLink = $card.find('a[href*="linkedin.com/in/"]').first();
    if (linkedinLink.length > 0) {
      const href = linkedinLink.attr('href');
      const linkedinMatch = href.match(/linkedin\.com\/in\/([^\/\?]+)/i);
      if (linkedinMatch) {
        linkedin = `https://linkedin.com/in/${linkedinMatch[1]}`;
      }
    }
    
    // Signaux de détection
    const signals = [];
    if ($card.find('img').length > 0) signals.push('has_image');
    if (email) signals.push('has_email');
    if (linkedin) signals.push('has_linkedin');
    if (role) signals.push('has_role');
    
    // Accepte si on a un nom ET au moins un signal (image, email, linkedin, ou role)
    // Réduit le seuil de 2 à 1 pour capturer plus de membres
    if (name && signals.length >= 1) {
      teamMembers.push({
        name,
        role: role || null,
        email,
        linkedin,
        sourceUrl,
        signals
      });
    }
  });
  
  return teamMembers;
}
