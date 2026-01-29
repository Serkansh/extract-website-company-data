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
  
  // Liste des titres de sections à ignorer (pas des noms de personnes)
  const sectionTitles = [
    'Leadership', 'Team', 'Our Team', 'About', 'Contact', 'Company', 'Business',
    'Services', 'Products', 'Solutions', 'Welcome', 'Home', 'Menu', 'Navigation',
    'Footer', 'Header', 'Sales', 'Marketing', 'Sales & Marketing',
    'Company Support Department', 'Product & Engineering', 'Client Management',
    'Support', 'Engineering', 'Product', 'Management', 'Department'
  ];
  
  // Fonction pour vérifier si un texte est un titre de section (pas un nom de personne)
  function isSectionTitle(text) {
    if (!text) return false;
    const cleanText = text.trim().toLowerCase();
    // Vérifie si c'est exactement un titre de section
    if (sectionTitles.some(title => cleanText === title.toLowerCase())) return true;
    // Vérifie si c'est un titre de section suivi d'un autre mot (ex: "Leadership Team")
    if (sectionTitles.some(title => cleanText.startsWith(title.toLowerCase() + ' '))) return true;
    // Vérifie si le texte contient "&" ou "Department" (souvent des titres de sections)
    if (/\s*&\s*|Department|Management\s*$/.test(cleanText)) return true;
    return false;
  }
  
  // Fonction pour extraire TOUS les membres depuis un élément (peut contenir plusieurs noms)
  function extractMembersFromElement($el) {
    const text = $el.text().trim();
    if (!text || text.length < 5) return [];
    
    // Ignore les titres de sections
    if (isSectionTitle(text)) return [];
    
    const members = [];
    
    // Cherche TOUS les noms dans le texte (pattern: Prénom Nom, 2-3 mots max chacun)
    // Pattern amélioré: cherche plusieurs noms séparés par des espaces ou des séparateurs
    const namePattern = /\b([A-Z][a-zÀ-ÿ]+(?:\s+[A-Z][a-zÀ-ÿ]+){1,2})\b/g;
    const nameMatches = [...text.matchAll(namePattern)];
    
    // Filtre les noms valides (ignore les titres de sections, limite à 3 mots)
    const validNames = [];
    for (const match of nameMatches) {
      let name = match[1].trim();
      name = name.replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Ignore si le nom contient des mots de section
      if (isSectionTitle(name)) continue;
      
      // Ignore si le nom est trop long (probablement plusieurs noms regroupés)
      const nameWords = name.split(/\s+/);
      if (nameWords.length > 3) continue;
      
      // Ignore les doublons
      if (validNames.some(n => n.toLowerCase() === name.toLowerCase())) continue;
      
      validNames.push(name);
    }
    
    // Si on a plusieurs noms valides, crée un membre pour chacun
    if (validNames.length > 0) {
      for (const name of validNames) {
        // Cherche le rôle et LinkedIn pour ce membre spécifique
        // (cherche dans l'élément parent ou dans les éléments enfants)
        let role = null;
        let linkedin = null;
        let email = null;
        
        // Cherche le rôle dans le texte proche du nom
        const nameIndex = text.indexOf(name);
        const contextAroundName = text.substring(Math.max(0, nameIndex - 50), nameIndex + name.length + 100);
        
        const rolePatterns = [
          /(?:CEO|CTO|CFO|CMO|COO|Founder|Co-founder|Directeur|Directrice|Président|Présidente|Manager|Chef|Lead|Head|Director|VP|Vice\s+President)/i,
          /([A-Z][a-zÀ-ÿ]+(?:\s+[A-Z][a-zÀ-ÿ]+)*)\s+(?:Manager|Director|Lead|Head|Chef|Responsable|President|VP)/i
        ];
        
        for (const pattern of rolePatterns) {
          const match = contextAroundName.match(pattern);
          if (match) {
            role = (match[1] || match[0]).trim();
            if (!isSectionTitle(role)) {
              break;
            } else {
              role = null;
            }
          }
        }
        
        // Cherche LinkedIn dans l'élément
        const linkedinLink = $el.find('a[href*="linkedin.com/in/"]').first();
        if (linkedinLink.length > 0) {
          const href = linkedinLink.attr('href');
          const linkedinMatch = href.match(/linkedin\.com\/in\/([^\/\?]+)/i);
          if (linkedinMatch) {
            linkedin = `https://linkedin.com/in/${linkedinMatch[1]}`;
          }
        }
        
        // Email (mailto proche dans l'élément)
        const mailtoLink = $el.find('a[href^="mailto:"]').first();
        if (mailtoLink.length > 0) {
          const href = mailtoLink.attr('href');
          const emailMatch = href.match(/mailto:([^\?&]+)/i);
          if (emailMatch) {
            email = normalizeEmail(emailMatch[1]);
          }
        }
        
        // Signaux de détection
        const signals = [];
        if ($el.find('img').length > 0) signals.push('has_image');
        if (email) signals.push('has_email');
        if (linkedin) signals.push('has_linkedin');
        if (role) signals.push('has_role');
        
        // Accepte si on a un nom ET au moins un signal (image, email, linkedin, ou role)
        if (name && signals.length >= 1) {
          members.push({
            name,
            role: role || null,
            email,
            linkedin,
            sourceUrl,
            signals
          });
        }
      }
    }
    
    return members;
  }
  
  // Fonction pour extraire un membre individuel depuis un élément (compatibilité)
  function extractMemberFromElement($el) {
    const members = extractMembersFromElement($el);
    return members.length > 0 ? members[0] : null;
  }
  
  // Stratégie 1: Cherche des sélecteurs spécifiques de team
  const teamSelectors = [
    '.team-member', '.team-member-card', '.person-card', '.member-card',
    '.staff-member', '.employee', '.team-item', '[class*="team"]',
    '[class*="member"]', '[class*="person"]'
  ];
  
  let foundMembers = false;
  for (const selector of teamSelectors) {
    const found = $(selector);
      if (found.length > 0) {
        found.each((_, el) => {
          const members = extractMembersFromElement($(el));
          if (members.length > 0) {
            teamMembers.push(...members);
            foundMembers = true;
          }
        });
        if (foundMembers) break;
      }
  }
  
  // Stratégie 2: Si pas de sélecteurs spécifiques, cherche des patterns répétés
  if (!foundMembers) {
    // Cherche des divs/articles/sections avec image + texte court (probablement des cards individuelles)
    $('div, article, section, li').each((_, el) => {
      const $el = $(el);
      const hasImage = $el.find('img').length > 0;
      const text = $el.text().trim();
      const hasLinkedIn = $el.find('a[href*="linkedin.com/in/"]').length > 0;
      
      // Si on a (une image OU un LinkedIn) ET un texte court (probablement un membre individuel)
      if ((hasImage || hasLinkedIn) && text.length > 5 && text.length < 200) {
        const members = extractMembersFromElement($el);
        if (members.length > 0) {
          teamMembers.push(...members);
          foundMembers = true;
        }
      }
    });
  }
  
  // Stratégie 3: Cherche dans les headings suivis d'un texte court (nom + rôle)
  if (!foundMembers) {
    $('h2, h3, h4, h5, h6').each((_, el) => {
      const $heading = $(el);
      const headingText = $heading.text().trim();
      
      // Si le heading contient un nom (pas un titre de section)
      if (!isSectionTitle(headingText)) {
        const $parent = $heading.parent();
        const members = extractMembersFromElement($parent);
        if (members.length > 0) {
          teamMembers.push(...members);
        }
      }
    });
  }
  
  return teamMembers;
}
