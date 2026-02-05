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

/**
 * Détecte le code pays ISO depuis un snippet de texte (contexte autour d'un numéro)
 * Cherche des indices comme : indicatifs téléphoniques, noms de villes/capitales, noms de pays
 * Retourne le code pays ISO (ex: 'FR', 'BE', 'CH') ou null si non détecté
 */
export function detectCountryFromSnippet(snippet) {
  if (!snippet) return null;
  
  const snippetLower = snippet.toLowerCase();
  
  // Mapping indicatifs téléphoniques -> code pays ISO
  const countryCodeToCountry = {
    '+33': 'FR', '0033': 'FR', '33': 'FR',
    '+32': 'BE', '0032': 'BE', '32': 'BE',
    '+41': 'CH', '0041': 'CH', '41': 'CH',
    '+44': 'UK', '0044': 'UK', '44': 'UK',
    '+49': 'DE', '0049': 'DE', '49': 'DE',
    '+39': 'IT', '0039': 'IT', '39': 'IT',
    '+34': 'ES', '0034': 'ES', '34': 'ES',
    '+31': 'NL', '0031': 'NL', '31': 'NL',
    '+351': 'PT', '00351': 'PT', '351': 'PT',
    '+48': 'PL', '0048': 'PL', '48': 'PL',
    '+420': 'CZ', '00420': 'CZ', '420': 'CZ',
    '+353': 'IE', '00353': 'IE', '353': 'IE',
    '+45': 'DK', '0045': 'DK', '45': 'DK',
    '+46': 'SE', '0046': 'SE', '46': 'SE',
    '+47': 'NO', '0047': 'NO', '47': 'NO',
    '+358': 'FI', '00358': 'FI', '358': 'FI',
    '+1': 'US', '001': 'US',
    '+1': 'CA', '001': 'CA', // Canada partage +1 avec US, on détecte via villes
  };
  
  // Cherche les indicatifs téléphoniques dans le snippet
  for (const [code, country] of Object.entries(countryCodeToCountry)) {
    // Cherche le code avec ou sans espace après
    if (new RegExp(`\\+?${code.replace('+', '\\+')}\\s*\\d`).test(snippet)) {
      return country;
    }
  }
  
  // Mapping villes/capitales -> code pays ISO (indicateurs forts)
  const cityToCountry = {
    // France
    'paris': 'FR', 'lyon': 'FR', 'marseille': 'FR', 'toulouse': 'FR', 'nice': 'FR',
    'nantes': 'FR', 'strasbourg': 'FR', 'montpellier': 'FR', 'bordeaux': 'FR', 'lille': 'FR',
    'rennes': 'FR', 'reims': 'FR', 'saint-étienne': 'FR', 'toulon': 'FR', 'grenoble': 'FR',
    'dijon': 'FR', 'angers': 'FR', 'villeurbanne': 'FR', 'saint-denis': 'FR', 'nîmes': 'FR',
    'le havre': 'FR', 'saint-paul': 'FR', 'aix-en-provence': 'FR', 'clermont-ferrand': 'FR',
    'brest': 'FR', 'limoges': 'FR', 'tours': 'FR', 'amiens': 'FR', 'perpignan': 'FR',
    'metz': 'FR', 'besançon': 'FR', 'boulogne-billancourt': 'FR', 'orléans': 'FR', 'mulhouse': 'FR',
    'rouen': 'FR', 'caen': 'FR', 'nancy': 'FR', 'saint-denis': 'FR', 'argenteuil': 'FR',
    
    // Belgique
    'bruxelles': 'BE', 'brussels': 'BE', 'anvers': 'BE', 'antwerp': 'BE', 'gand': 'BE', 'ghent': 'BE',
    'charleroi': 'BE', 'liège': 'BE', 'liege': 'BE', 'bruges': 'BE', 'brugge': 'BE', 'namur': 'BE',
    'leuven': 'BE', 'mons': 'BE', 'aalst': 'BE', 'mechelen': 'BE', 'la louvière': 'BE',
    
    // Suisse
    'zurich': 'CH', 'genève': 'CH', 'geneva': 'CH', 'bâle': 'CH', 'basel': 'CH', 'berne': 'CH', 'bern': 'CH',
    'lausanne': 'CH', 'winterthur': 'CH', 'saint-gall': 'CH', 'st. gallen': 'CH', 'lucerne': 'CH', 'lugano': 'CH',
    'biel': 'CH', 'thun': 'CH', 'köniz': 'CH', 'schaffhausen': 'CH', 'fribourg': 'CH', 'chur': 'CH',
    
    // UK
    'london': 'UK', 'londres': 'UK', 'birmingham': 'UK', 'manchester': 'UK', 'glasgow': 'UK',
    'liverpool': 'UK', 'leeds': 'UK', 'edinburgh': 'UK', 'bristol': 'UK', 'cardiff': 'UK',
    'belfast': 'UK', 'newcastle': 'UK', 'nottingham': 'UK', 'sheffield': 'UK', 'leicester': 'UK',
    
    // Allemagne
    'berlin': 'DE', 'hamburg': 'DE', 'munich': 'DE', 'münchen': 'DE', 'cologne': 'DE', 'köln': 'DE',
    'frankfurt': 'DE', 'stuttgart': 'DE', 'düsseldorf': 'DE', 'dortmund': 'DE', 'essen': 'DE',
    'leipzig': 'DE', 'bremen': 'DE', 'dresden': 'DE', 'hannover': 'DE', 'nuremberg': 'DE', 'nürnberg': 'DE',
    
    // Italie
    'rome': 'IT', 'roma': 'IT', 'milan': 'IT', 'milano': 'IT', 'naples': 'IT', 'napoli': 'IT',
    'turin': 'IT', 'torino': 'IT', 'palerme': 'IT', 'palermo': 'IT', 'genoa': 'IT', 'genova': 'IT',
    'bologne': 'IT', 'bologna': 'IT', 'florence': 'IT', 'firenze': 'IT', 'bari': 'IT', 'catania': 'IT',
    
    // Espagne
    'madrid': 'ES', 'barcelone': 'ES', 'barcelona': 'ES', 'valence': 'ES', 'valencia': 'ES',
    'séville': 'ES', 'sevilla': 'ES', 'zaragoza': 'ES', 'málaga': 'ES', 'murcia': 'ES', 'palma': 'ES',
    
    // Pays-Bas
    'amsterdam': 'NL', 'rotterdam': 'NL', 'la haye': 'NL', 'den haag': 'NL', 'utrecht': 'NL',
    'eindhoven': 'NL', 'groningen': 'NL', 'tilburg': 'NL', 'almere': 'NL', 'breda': 'NL',
    
    // Canada (pour distinguer de US avec +1)
    'toronto': 'CA', 'montreal': 'CA', 'montréal': 'CA', 'vancouver': 'CA', 'calgary': 'CA',
    'ottawa': 'CA', 'edmonton': 'CA', 'winnipeg': 'CA', 'quebec': 'CA', 'québec': 'CA',
  };
  
  // Cherche les villes dans le snippet
  for (const [city, country] of Object.entries(cityToCountry)) {
    // Cherche le nom de la ville (mot complet, pas juste une partie)
    const cityRegex = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (cityRegex.test(snippet)) {
      return country;
    }
  }
  
  // Mapping noms de pays -> code pays ISO
  const countryNameToCountry = {
    'france': 'FR', 'français': 'FR', 'française': 'FR',
    'belgique': 'BE', 'belgium': 'BE', 'belge': 'BE', 'belgisch': 'BE',
    'suisse': 'CH', 'switzerland': 'CH', 'schweiz': 'CH', 'svizzera': 'CH', 'suisse': 'CH',
    'royaume-uni': 'UK', 'united kingdom': 'UK', 'uk': 'UK', 'angleterre': 'UK', 'england': 'UK',
    'allemagne': 'DE', 'germany': 'DE', 'deutschland': 'DE', 'allemand': 'DE',
    'italie': 'IT', 'italy': 'IT', 'italia': 'IT', 'italien': 'IT',
    'espagne': 'ES', 'spain': 'ES', 'españa': 'ES', 'espagnol': 'ES',
    'pays-bas': 'NL', 'netherlands': 'NL', 'hollande': 'NL', 'néerlandais': 'NL',
    'portugal': 'PT', 'portugais': 'PT',
    'pologne': 'PL', 'poland': 'PL', 'polonais': 'PL',
    'république tchèque': 'CZ', 'czech republic': 'CZ', 'tchèque': 'CZ',
    'irlande': 'IE', 'ireland': 'IE', 'irlandais': 'IE',
    'danemark': 'DK', 'denmark': 'DK', 'danois': 'DK',
    'suède': 'SE', 'sweden': 'SE', 'suédois': 'SE',
    'norvège': 'NO', 'norway': 'NO', 'norvégien': 'NO',
    'finlande': 'FI', 'finland': 'FI', 'finlandais': 'FI',
  };
  
  // Cherche les noms de pays dans le snippet
  for (const [name, country] of Object.entries(countryNameToCountry)) {
    const nameRegex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (nameRegex.test(snippet)) {
      return country;
    }
  }
  
  return null;
}
