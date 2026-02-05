import * as cheerio from 'cheerio';
import { SOCIAL_PLATFORMS, SOCIAL_SHARE_PATTERNS } from '../constants.js';
import { getRegistrableDomain, isSameDomain, normalizeUrl } from '../utils/url-utils.js';

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
 * Vérifie si un lien social est un lien de service/plateforme (Wix, Dropbox, etc.) à exclure
 */
function isServiceLink(url) {
  const urlLower = url.toLowerCase();
  const servicePatterns = [
    /wixfrancais/i,
    /wixfrance/i,
    /wix\.com/i,
    /facebook\.com\/Wix/i,
    /twitter\.com\/Wix/i,
    /dropbox\.com/i,  // Exclut les liens Dropbox (fichiers PDF, etc.)
    /drive\.google\.com/i,  // Exclut les liens Google Drive
    /onedrive\.live\.com/i  // Exclut les liens OneDrive
  ];
  return servicePatterns.some(pattern => pattern.test(urlLower));
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
        // Exclut les posts individuels (format /p/...)
        if (pathname.includes('/p/') || pathname.includes('/reel/') || pathname.includes('/tv/')) {
          return null;
        }
        // Exclut les liens avec paramètres (ex: ?utm_medium=copy_link)
        if (urlObj.search && urlObj.search.length > 0) {
          // On accepte seulement si c'est le profil principal (pas un post)
          if (!pathname.match(/^\/[^\/]+$/)) {
            return null;
          }
        }
        const igMatch = pathname.match(/^\/([^\/\?]+)/);
        return igMatch && igMatch[1] ? igMatch[1].replace('@', '') : null;
        
      case 'twitter':
      case 'x':
        // Exclut les liens qui ne sont pas vraiment Twitter/X (vérifie le domaine)
        const hostname = urlObj.hostname ? urlObj.hostname.toLowerCase() : '';
        if (!hostname.includes('twitter.com') && !hostname.includes('x.com')) {
          return null;
        }
        const twMatch = pathname.match(/^\/([^\/\?]+)/);
        return twMatch && twMatch[1] ? twMatch[1].replace('@', '') : null;
        
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
  const seen = new Set(); // URLs normalisées vues
  const seenHandles = new Map(); // Platform -> Set of handles (pour déduplication par handle)
  const sourceDomain = getRegistrableDomain(sourceUrl);
  
  // Initialise les sets de handles par plateforme
  for (const platform of Object.keys(socials)) {
    seenHandles.set(platform, new Set());
  }
  
  // Cherche dans tous les liens
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || isShareLink(href)) return;
    
    const url = href.startsWith('http') ? href : new URL(href, sourceUrl).toString();
    
    // Exclut les liens internes (même domaine) - ce ne sont pas des réseaux sociaux
    if (isSameDomain(url, sourceUrl)) return;
    
    // Exclut les liens de paramètres/policies
    if (isSettingsOrPolicyLink(url)) return;
    
    // Exclut les liens de services (Wix, etc.)
    if (isServiceLink(url)) return;
    
    // Normalise l'URL pour la déduplication (supprime trailing slash, paramètres, etc.)
    const normalizedUrl = normalizeUrl(url);
    if (seen.has(normalizedUrl)) return; // Skip this iteration (we're in a callback, not a loop)
    
    const urlLower = url.toLowerCase();
    
    // Vérifie chaque plateforme
    for (const [platform, patterns] of Object.entries(SOCIAL_PLATFORMS)) {
      if (patterns.some(pattern => urlLower.includes(pattern))) {
        seen.add(normalizedUrl);
        
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
            const xHandles = seenHandles.get('x');
            if (!xHandles.has(handle)) {
              xHandles.add(handle);
              if (socials.x.length === 0 && socials.twitter.length === 0) {
                socials.x.push(socialData);
              }
            }
          } else {
            // Déduplique par handle pour éviter les doublons (ex: /company/name/ et /company/name)
            const platformHandles = seenHandles.get(platform);
            if (!platformHandles.has(handle)) {
              platformHandles.add(handle);
              
              if (platform === 'instagram') {
                // Pour Instagram, on ne garde que le profil principal (pas les posts individuels)
                socials[platform].push(socialData);
              } else {
                socials[platform].push(socialData);
              }
            }
          }
        }
        break;
      }
    }
  });
  
  return socials;
}
