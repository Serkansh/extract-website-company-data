import { parse } from 'tldts';
import { ASSET_EXTENSIONS } from '../constants.js';

/**
 * Extrait le domaine enregistrable depuis une URL
 */
export function getRegistrableDomain(url) {
  try {
    const parsed = parse(url);
    return parsed.domain || null;
  } catch (error) {
    return null;
  }
}

/**
 * Normalise une URL (supprime trailing slash, fragements, etc.)
 */
export function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    urlObj.hash = '';
    urlObj.searchParams.sort();
    let normalized = urlObj.toString();
    // Supprime le trailing slash sauf pour la racine
    if (normalized.endsWith('/') && urlObj.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch (error) {
    return url;
  }
}

/**
 * Vérifie si une URL est dans le même domaine enregistrable
 */
export function isSameDomain(url1, url2) {
  const domain1 = getRegistrableDomain(url1);
  const domain2 = getRegistrableDomain(url2);
  return domain1 && domain2 && domain1 === domain2;
}

/**
 * Vérifie si une URL est un asset à ignorer
 */
export function isAsset(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    return ASSET_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Résout une URL relative par rapport à une base
 */
export function resolveUrl(baseUrl, relativeUrl) {
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Détecte le code pays ISO depuis une URL
 * Méthodes utilisées :
 * 1. TLD du domaine (.fr, .uk, .de, .it, .es, etc.)
 * 2. Sous-domaine de pays (fr.example.com, uk.example.com)
 * 3. Chemin de l'URL (/fr/, /en/, etc.)
 * Retourne le code pays ISO (ex: 'FR', 'UK', 'DE') ou null si non détecté
 */
export function detectCountryFromUrl(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    
    // Mapping TLD -> code pays ISO
    const tldToCountry = {
      'fr': 'FR', 'com.fr': 'FR',
      'uk': 'UK', 'co.uk': 'UK', 'org.uk': 'UK',
      'de': 'DE', 'com.de': 'DE',
      'it': 'IT', 'com.it': 'IT',
      'es': 'ES', 'com.es': 'ES',
      'nl': 'NL', 'com.nl': 'NL',
      'be': 'BE', 'com.be': 'BE',
      'ch': 'CH', 'com.ch': 'CH',
      'at': 'AT', 'com.at': 'AT',
      'pt': 'PT', 'com.pt': 'PT',
      'pl': 'PL', 'com.pl': 'PL',
      'cz': 'CZ', 'com.cz': 'CZ',
      'ie': 'IE', 'com.ie': 'IE',
      'dk': 'DK', 'com.dk': 'DK',
      'se': 'SE', 'com.se': 'SE',
      'no': 'NO', 'com.no': 'NO',
      'fi': 'FI', 'com.fi': 'FI',
      'gr': 'GR', 'com.gr': 'GR',
      'ro': 'RO', 'com.ro': 'RO',
      'hu': 'HU', 'com.hu': 'HU',
      'bg': 'BG', 'com.bg': 'BG',
      'hr': 'HR', 'com.hr': 'HR',
      'sk': 'SK', 'com.sk': 'SK',
      'si': 'SI', 'com.si': 'SI',
      'ee': 'EE', 'com.ee': 'EE',
      'lv': 'LV', 'com.lv': 'LV',
      'lt': 'LT', 'com.lt': 'LT',
      'lu': 'LU', 'com.lu': 'LU',
      'mt': 'MT', 'com.mt': 'MT',
      'cy': 'CY', 'com.cy': 'CY',
      'us': 'US', 'com': 'US', // .com par défaut US
      'ca': 'CA', 'com.ca': 'CA',
      'au': 'AU', 'com.au': 'AU',
      'nz': 'NZ', 'com.nz': 'NZ',
      'jp': 'JP', 'co.jp': 'JP',
      'cn': 'CN', 'com.cn': 'CN',
      'kr': 'KR', 'co.kr': 'KR',
      'in': 'IN', 'co.in': 'IN',
      'br': 'BR', 'com.br': 'BR',
      'mx': 'MX', 'com.mx': 'MX',
      'ar': 'AR', 'com.ar': 'AR',
      'za': 'ZA', 'co.za': 'ZA',
      'ae': 'AE', 'com.ae': 'AE',
      'sa': 'SA', 'com.sa': 'SA',
      'il': 'IL', 'co.il': 'IL',
      'tr': 'TR', 'com.tr': 'TR',
      'ru': 'RU', 'com.ru': 'RU',
      'ua': 'UA', 'com.ua': 'UA',
    };
    
    // 1. Vérifie le TLD
    const parsed = parse(url);
    const domain = parsed.domain || '';
    const publicSuffix = parsed.publicSuffix || '';
    
    // Extrait le TLD (dernière partie du domaine)
    const tldParts = publicSuffix.split('.');
    const mainTld = tldParts[tldParts.length - 1];
    const fullTld = publicSuffix;
    
    if (tldToCountry[fullTld]) {
      return tldToCountry[fullTld];
    }
    if (tldToCountry[mainTld]) {
      return tldToCountry[mainTld];
    }
    
    // 2. Vérifie le sous-domaine de pays (fr.example.com, uk.example.com)
    const subdomainParts = hostname.split('.');
    if (subdomainParts.length >= 3) {
      const subdomain = subdomainParts[0];
      const subdomainToCountry = {
        'fr': 'FR', 'france': 'FR',
        'uk': 'UK', 'gb': 'UK', 'england': 'UK',
        'de': 'DE', 'germany': 'DE',
        'it': 'IT', 'italy': 'IT',
        'es': 'ES', 'spain': 'ES',
        'nl': 'NL', 'netherlands': 'NL',
        'be': 'BE', 'belgium': 'BE',
        'ch': 'CH', 'switzerland': 'CH',
        'at': 'AT', 'austria': 'AT',
        'pt': 'PT', 'portugal': 'PT',
        'pl': 'PL', 'poland': 'PL',
        'cz': 'CZ', 'czech': 'CZ',
        'ie': 'IE', 'ireland': 'IE',
        'dk': 'DK', 'denmark': 'DK',
        'se': 'SE', 'sweden': 'SE',
        'no': 'NO', 'norway': 'NO',
        'fi': 'FI', 'finland': 'FI',
        'us': 'US', 'usa': 'US',
        'ca': 'CA', 'canada': 'CA',
        'au': 'AU', 'australia': 'AU',
      };
      if (subdomainToCountry[subdomain]) {
        return subdomainToCountry[subdomain];
      }
    }
    
    // 3. Vérifie le chemin de l'URL (/fr/, /en/, etc.)
    const pathToCountry = {
      '/fr/': 'FR', '/fr': 'FR', '/france/': 'FR', '/france': 'FR',
      '/uk/': 'UK', '/uk': 'UK', '/gb/': 'UK', '/gb': 'UK', '/en/': 'UK', '/en': 'UK',
      '/de/': 'DE', '/de': 'DE', '/germany/': 'DE', '/germany': 'DE',
      '/it/': 'IT', '/it': 'IT', '/italy/': 'IT', '/italy': 'IT',
      '/es/': 'ES', '/es': 'ES', '/spain/': 'ES', '/spain': 'ES',
      '/nl/': 'NL', '/nl': 'NL', '/netherlands/': 'NL', '/netherlands': 'NL',
      '/be/': 'BE', '/be': 'BE', '/belgium/': 'BE', '/belgium': 'BE',
      '/ch/': 'CH', '/ch': 'CH', '/switzerland/': 'CH', '/switzerland': 'CH',
      '/at/': 'AT', '/at': 'AT', '/austria/': 'AT', '/austria': 'AT',
      '/pt/': 'PT', '/pt': 'PT', '/portugal/': 'PT', '/portugal': 'PT',
      '/pl/': 'PL', '/pl': 'PL', '/poland/': 'PL', '/poland': 'PL',
      '/cz/': 'CZ', '/cz': 'CZ', '/czech/': 'CZ', '/czech': 'CZ',
      '/ie/': 'IE', '/ie': 'IE', '/ireland/': 'IE', '/ireland': 'IE',
      '/dk/': 'DK', '/dk': 'DK', '/denmark/': 'DK', '/denmark': 'DK',
      '/se/': 'SE', '/se': 'SE', '/sweden/': 'SE', '/sweden': 'SE',
      '/no/': 'NO', '/no': 'NO', '/norway/': 'NO', '/norway': 'NO',
      '/fi/': 'FI', '/fi': 'FI', '/finland/': 'FI', '/finland': 'FI',
      '/us/': 'US', '/us': 'US', '/usa/': 'US', '/usa': 'US',
      '/ca/': 'CA', '/ca': 'CA', '/canada/': 'CA', '/canada': 'CA',
      '/au/': 'AU', '/au': 'AU', '/australia/': 'AU', '/australia': 'AU',
    };
    
    for (const [path, country] of Object.entries(pathToCountry)) {
      if (pathname.startsWith(path)) {
        return country;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}
