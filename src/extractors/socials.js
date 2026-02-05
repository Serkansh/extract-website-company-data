import * as cheerio from 'cheerio';
import { SOCIAL_PLATFORMS, SOCIAL_SHARE_PATTERNS } from '../constants.js';

/**
 * Vérifie si un lien social est un lien de partage (à exclure)
 */
function isShareLink(url) {
  return SOCIAL_SHARE_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Vérifie si un lien social est une page de paramètres/policies (à exclure)
 */
function isSettingsOrPolicyLink(url) {
  const urlLower = url.toLowerCase();
  const excludedPatterns = [
    /\/policies\//,
    /\/settings\//,
    /\/help\//,
    /\/rules/,
    /\/terms/,
    /\/privacy/,
    /\/legal/,
    /\/cookies/,
    /\/ads/,
    /\/about\/ads/,
    /\/privacy\/checkup/,
    /\/account\/settings/,
    /\/settings\?tab=/,
    /\/policies\/cookies/,
    /\/rules-and-policies/
  ];
  return excludedPatterns.some(pattern => pattern.test(urlLower));
}

/**
 * Extrait le handle/ID depuis une URL de réseau social
 */
function extractSocialHandle(url, platform) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    
    switch (platform) {
      case 'linkedin':
        // linkedin.com/company/company-name ou linkedin.com/in/person-name
        const linkedinMatch = pathname.match(/\/(company|in)\/([^\/]+)/);
        if (linkedinMatch && linkedinMatch[1] === 'company') {
          return linkedinMatch[2];
        }
        return null; // Ignore les profils personnels pour les socials entreprise
        
      case 'facebook':
        const fbMatch = pathname.match(/\/([^\/\?]+)/);
        return fbMatch ? fbMatch[1] : null;
        
      case 'instagram':
        const igMatch = pathname.match(/\/([^\/\?]+)/);
        return igMatch ? igMatch[1].replace('@', '') : null;
        
      case 'twitter':
      case 'x':
        const twMatch = pathname.match(/\/([^\/\?]+)/);
        return twMatch ? twMatch[1].replace('@', '') : null;
        
      case 'tiktok':
        const ttMatch = pathname.match(/@([^\/\?]+)/);
        return ttMatch ? ttMatch[1] : null;
        
      case 'youtube':
        // youtube.com/channel/... ou youtube.com/@... ou youtube.com/c/...
        if (pathname.includes('/channel/')) {
          const channelMatch = pathname.match(/\/channel\/([^\/\?]+)/);
          return channelMatch ? channelMatch[1] : null;
        }
        if (pathname.includes('/@')) {
          const handleMatch = pathname.match(/\/@([^\/\?]+)/);
          return handleMatch ? handleMatch[1] : null;
        }
        if (pathname.includes('/c/')) {
          const cMatch = pathname.match(/\/c\/([^\/\?]+)/);
          return cMatch ? cMatch[1] : null;
        }
        return null;
        
      case 'pinterest':
        const pinMatch = pathname.match(/\/([^\/\?]+)/);
        return pinMatch ? pinMatch[1] : null;
        
      case 'google':
        // Pour Google Maps, on garde l'URL complète
        return url;
        
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Extrait les réseaux sociaux depuis une page HTML
 */
export function extractSocials(html, sourceUrl) {
  const socials = {
    linkedin: [],
    facebook: [],
    instagram: [],
    x: [],
    twitter: [],
    tiktok: [],
    youtube: [],
    pinterest: [],
    google: []
  };
  
  const $ = cheerio.load(html);
  const seen = new Set();
  
  // Cherche dans tous les liens
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || isShareLink(href)) return;
    
    const url = href.startsWith('http') ? href : new URL(href, sourceUrl).toString();
    
    // Exclut les liens de paramètres/policies
    if (isSettingsOrPolicyLink(url)) return;
    
    const urlLower = url.toLowerCase();
    
    // Vérifie chaque plateforme
    for (const [platform, patterns] of Object.entries(SOCIAL_PLATFORMS)) {
      if (patterns.some(pattern => urlLower.includes(pattern))) {
        // Évite les doublons
        if (seen.has(url)) continue;
        seen.add(url);
        
        const handle = extractSocialHandle(url, platform);
        // Exclut les handles qui sont des mots-clés de paramètres
        if (handle && !['policies', 'settings', 'help', 'rules', 'terms', 'privacy', 'legal', 'cookies', 'ads', 'es', 'fr', 'en'].includes(handle.toLowerCase())) {
          const socialData = {
            url,
            handle,
            sourceUrl
          };
          
          // Gère twitter/x comme une seule entité
          if (platform === 'twitter' || platform === 'x') {
            if (socials.x.length === 0 && socials.twitter.length === 0) {
              socials.x.push(socialData);
            }
          } else {
            socials[platform].push(socialData);
          }
        }
        break;
      }
    }
  });
  
  return socials;
}
