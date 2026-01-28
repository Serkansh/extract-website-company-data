import * as cheerio from 'cheerio';
import { normalizeEmail } from '../utils/normalization.js';

/**
 * Extrait les membres d'équipe depuis une page HTML
 */
export function extractTeam(html, sourceUrl) {
  const teamMembers = [];
  const $ = cheerio.load(html);
  
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
  }
  
  // Extrait les informations de chaque card
  teamCards.each((_, card) => {
    const $card = $(card);
    const cardText = $card.text();
    
    // Nom (pattern: Prénom Nom)
    const nameMatch = cardText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    if (!nameMatch) return;
    
    const name = nameMatch[1].trim();
    
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
    
    if (name && signals.length >= 2) {
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
