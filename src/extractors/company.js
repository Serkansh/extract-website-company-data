import * as cheerio from 'cheerio';
import { getRegistrableDomain } from '../utils/url-utils.js';

/**
 * Retourne le code ISO et le nom du pays depuis un nom de pays
 */
function getCountryInfo(countryName) {
  if (!countryName) return { code: null, name: null };
  
  const countryNameLower = countryName.toLowerCase();
  const countryMap = {
    'france': { code: 'FR', name: 'France' },
    'united kingdom': { code: 'GB', name: 'United Kingdom' },
    'uk': { code: 'GB', name: 'United Kingdom' },
    'great britain': { code: 'GB', name: 'United Kingdom' },
    'germany': { code: 'DE', name: 'Germany' },
    'deutschland': { code: 'DE', name: 'Germany' },
    'spain': { code: 'ES', name: 'Spain' },
    'españa': { code: 'ES', name: 'Spain' },
    'italy': { code: 'IT', name: 'Italy' },
    'italia': { code: 'IT', name: 'Italy' },
    'belgium': { code: 'BE', name: 'Belgium' },
    'belgique': { code: 'BE', name: 'Belgium' },
    'switzerland': { code: 'CH', name: 'Switzerland' },
    'suisse': { code: 'CH', name: 'Switzerland' },
    'netherlands': { code: 'NL', name: 'Netherlands' },
    'nederland': { code: 'NL', name: 'Netherlands' },
    'austria': { code: 'AT', name: 'Austria' },
    'österreich': { code: 'AT', name: 'Austria' },
    'portugal': { code: 'PT', name: 'Portugal' },
    'united states': { code: 'US', name: 'United States' },
    'usa': { code: 'US', name: 'United States' },
    'united states of america': { code: 'US', name: 'United States' },
    'canada': { code: 'CA', name: 'Canada' },
    'australia': { code: 'AU', name: 'Australia' },
    'new zealand': { code: 'NZ', name: 'New Zealand' },
    'japan': { code: 'JP', name: 'Japan' },
    'china': { code: 'CN', name: 'China' },
    'india': { code: 'IN', name: 'India' },
    'brazil': { code: 'BR', name: 'Brazil' },
    'mexico': { code: 'MX', name: 'Mexico' },
    'south korea': { code: 'KR', name: 'South Korea' },
    'korea': { code: 'KR', name: 'South Korea' },
    'singapore': { code: 'SG', name: 'Singapore' },
    'hong kong': { code: 'HK', name: 'Hong Kong' },
    'ireland': { code: 'IE', name: 'Ireland' },
    'poland': { code: 'PL', name: 'Poland' },
    'pologne': { code: 'PL', name: 'Poland' },
    'czech republic': { code: 'CZ', name: 'Czech Republic' },
    'tchéquie': { code: 'CZ', name: 'Czech Republic' },
    'sweden': { code: 'SE', name: 'Sweden' },
    'suède': { code: 'SE', name: 'Sweden' },
    'norway': { code: 'NO', name: 'Norway' },
    'norvège': { code: 'NO', name: 'Norway' },
    'denmark': { code: 'DK', name: 'Denmark' },
    'danemark': { code: 'DK', name: 'Denmark' },
    'finland': { code: 'FI', name: 'Finland' },
    'finlande': { code: 'FI', name: 'Finland' },
    'greece': { code: 'GR', name: 'Greece' },
    'grèce': { code: 'GR', name: 'Greece' },
    'romania': { code: 'RO', name: 'Romania' },
    'roumanie': { code: 'RO', name: 'Romania' },
    'hungary': { code: 'HU', name: 'Hungary' },
    'hongrie': { code: 'HU', name: 'Hungary' },
    'russia': { code: 'RU', name: 'Russia' },
    'russie': { code: 'RU', name: 'Russia' },
    'turkey': { code: 'TR', name: 'Turkey' },
    'turquie': { code: 'TR', name: 'Turkey' },
    'south africa': { code: 'ZA', name: 'South Africa' },
    'israel': { code: 'IL', name: 'Israel' },
    'uae': { code: 'AE', name: 'United Arab Emirates' },
    'united arab emirates': { code: 'AE', name: 'United Arab Emirates' },
    'saudi arabia': { code: 'SA', name: 'Saudi Arabia' },
    'arabie saoudite': { code: 'SA', name: 'Saudi Arabia' }
  };
  
  return countryMap[countryNameLower] || { code: null, name: null };
}

/**
 * Extrait les informations entreprise depuis une page HTML
 */
export function extractCompany(html, sourceUrl) {
  const $ = cheerio.load(html);
  const company = {
    name: null,
    legalName: null,
    country: null,
    countryName: null
  };

  // Ignore scripts/styles pour les extractions textuelles
  $('script, style, noscript').remove();
  
  // 1. Nom de l'entreprise
  // a) og:site_name
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  if (ogSiteName) {
    company.name = ogSiteName.trim();
  }
  
  // b) title
  if (!company.name) {
    const title = $('title').text().trim();
    if (title) {
      // Exclut les titres de pages génériques (mentions légales, privacy, etc.)
      const genericTitles = /^(mentions\s+l[eé]gales?|privacy\s+policy|politique\s+de\s+confidentialit[eé]|legal\s+notice|imprint|cgu|cgv|terms|conditions|contact|accueil|home)$/i;
      if (genericTitles.test(title)) {
        // Ne pas utiliser ce title, on passera au logo ou schema.org
      } else {
        // Nettoie le title (enlève souvent " - Home", " | Company", " · Privacy policy", etc.)
        let cleaned = title.split(/[-|·]/)[0].trim();
        // Enlève aussi les suffixes comme " · Privacy policy", " - Mentions légales"
        cleaned = cleaned.replace(/\s*[·\-]\s*(privacy|mentions|l[eé]gales?|legal|policy|confidentialit[eé])/i, '').trim();
        if (cleaned && cleaned.length > 2) {
          company.name = cleaned;
        }
      }
    }
  }
  
  // c) Logo alt text
  if (!company.name) {
    const logoAlt = $('img[alt*="logo"], .logo img[alt], header img[alt]').first().attr('alt');
    if (logoAlt && logoAlt.length < 100) {
      company.name = logoAlt.trim();
    }
  }
  
  // d) Schema.org Organization
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
        
        if (obj['@type'] === 'Organization' || obj['@type'] === 'LocalBusiness') {
          if (obj.name && !company.name) {
            company.name = obj.name.trim();
          }
          if (obj.legalName && !company.legalName) {
            company.legalName = obj.legalName.trim();
          }
          
          // Pays depuis l'adresse schema.org (sans extraire l'adresse complète)
          if (obj.address && typeof obj.address === 'object') {
            const address = obj.address;
            if (address.addressCountry && !company.country) {
              const countryValue = typeof address.addressCountry === 'object' 
                ? address.addressCountry.name || address.addressCountry
                : address.addressCountry;
              const countryInfo = getCountryInfo(countryValue);
              if (countryInfo.code) {
                company.country = countryInfo.code;
                company.countryName = countryInfo.name;
              }
            }
          }
        }
        
        // Continue la recherche récursive
        for (const value of Object.values(obj)) {
          if (typeof value === 'object') {
            extractFromSchema(value);
          }
        }
      }
      
      extractFromSchema(data);
    } catch (error) {
      // Ignore les erreurs de parsing JSON
    }
  });
  
  // 2. Mentions légales (legalName)
  const legalTextNormalized = $('body').text().replace(/\s+/g, ' ').trim();
  const legalTextWithNewlines = $('body').text().trim();
  const legalText = legalTextNormalized;

  const legalNameMatches =
    legalText.match(/Raison\s+sociale\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i) ||
    legalText.match(/Dénomination\s+(?:sociale)?\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i) ||
    legalText.match(/Société\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i) ||
    legalText.match(/propri[eé]t[eé]\s+exclusive\s+de\s+([^,]+?)(?:\s*,\s*qui|\s+qui)\b/i) ||
    legalText.match(/owned\s+by\s+([^,]+?)(?:\s*,\s*a\s+company|\s+\(|$)/i) ||
    legalText.match(/\b([A-Z][A-Z\s]{3,}(?:SAS|SARL|SA|SRL|LTD|LLC|INC|GMBH|BV|SPA))\b/) ||
    legalText.match(/(?:Legal\s+information|Company|Société|Entreprise)\s*:?\s*([A-Z][A-Z\s]{3,}(?:SAS|SARL|SA|SRL|LTD|LLC|INC|GMBH|BV|SPA))\b/i) ||
    legalText.match(/Legal\s+name\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i);

  if (legalNameMatches && !company.legalName) {
    company.legalName = legalNameMatches[1].trim();
  }

  // Si on n'a pas de "name" mais qu'on a une legalName (cas fréquent en mentions légales)
  if (!company.name && company.legalName) {
    company.name = company.legalName;
  }

  // 3. Pays depuis le texte (mentions légales) ou domaine (fallback)
  if (!company.country) {
    // Détection du contexte français : code postal français dans le texte
    const postalCodeMatch = legalText.match(/\b(75|77|78|91|92|93|94|95)\d{3}\b/);
    const isFrenchContext = !!postalCodeMatch;
    
    // Cherche le pays dans le texte (ex: "France", "registered in France", "in France")
    const countryPattern = isFrenchContext
      ? /\b(?:registered\s+in|in|at)\s+(France|United\s+Kingdom|UK|Great\s+Britain|Germany|Deutschland|Spain|España|Italy|Italia|Belgium|Belgique|Switzerland|Suisse|Netherlands|Nederland|Austria|Österreich|Portugal|United\s+States|USA|Canada|Australia|New\s+Zealand|Ireland|Poland|Pologne|Czech\s+Republic|Sweden|Suède|Norway|Norvège|Denmark|Danemark|Finland|Finlande|Greece|Grèce|Romania|Roumanie|Hungary|Hongrie|Russia|Russie|Turkey|Turquie)\b/i
      : /\b(?:registered\s+in|in|at)\s+(France|United\s+Kingdom|UK|Great\s+Britain|Germany|Deutschland|Spain|España|Italy|Italia|Belgium|Belgique|Switzerland|Suisse|Netherlands|Nederland|Austria|Österreich|Portugal|United\s+States|USA|Canada|Australia|New\s+Zealand|Japan|China|India|Brazil|Mexico|South\s+Korea|Korea|Singapore|Hong\s+Kong|Ireland|Poland|Pologne|Czech\s+Republic|Sweden|Suède|Norway|Norvège|Denmark|Danemark|Finland|Finlande|Greece|Grèce|Romania|Roumanie|Hungary|Hongrie|Russia|Russie|Turkey|Turquie|South\s+Africa|Israel|UAE|United\s+Arab\s+Emirates|Saudi\s+Arabia|Arabie\s+Saoudite)\b/i;
    
    const countryMatches = legalText.match(countryPattern);
    if (countryMatches) {
      const countryInfo = getCountryInfo(countryMatches[1]);
      company.country = countryInfo.code;
      company.countryName = countryInfo.name;
    }
    
    // Cherche n'importe quel nom de pays seul sur une ligne ou après un espace
    if (!company.country) {
      const countryNames = isFrenchContext
        ? [
            'France', 'United Kingdom', 'UK', 'Great Britain', 'Germany', 'Deutschland',
            'Spain', 'España', 'Italy', 'Italia', 'Belgium', 'Belgique', 'Switzerland', 'Suisse',
            'Netherlands', 'Nederland', 'Austria', 'Österreich', 'Portugal',
            'United States', 'USA', 'United States of America', 'Canada', 'Australia', 'New Zealand',
            'Ireland', 'Poland', 'Pologne',
            'Czech Republic', 'Sweden', 'Suède', 'Norway', 'Norvège', 'Denmark', 'Danemark',
            'Finland', 'Finlande', 'Greece', 'Grèce', 'Romania', 'Roumanie',
            'Hungary', 'Hongrie', 'Russia', 'Russie', 'Turkey', 'Turquie'
          ]
        : [
            'France', 'United Kingdom', 'UK', 'Great Britain', 'Germany', 'Deutschland',
            'Spain', 'España', 'Italy', 'Italia', 'Belgium', 'Belgique', 'Switzerland', 'Suisse',
            'Netherlands', 'Nederland', 'Austria', 'Österreich', 'Portugal',
            'United States', 'USA', 'United States of America', 'Canada', 'Australia', 'New Zealand',
            'Japan', 'China', 'India', 'Brazil', 'Mexico', 'South Korea', 'Korea',
            'Singapore', 'Hong Kong', 'Ireland', 'Poland', 'Pologne',
            'Czech Republic', 'Sweden', 'Suède', 'Norway', 'Norvège', 'Denmark', 'Danemark',
            'Finland', 'Finlande', 'Greece', 'Grèce', 'Romania', 'Roumanie',
            'Hungary', 'Hongrie', 'Russia', 'Russie', 'Turkey', 'Turquie',
            'South Africa', 'Israel', 'UAE', 'United Arab Emirates', 'Saudi Arabia', 'Arabie Saoudite'
          ];
      
      // Utilise la version avec sauts de ligne pour mieux détecter les pays sur ligne séparée
      const countryNamesEscaped = countryNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const countryStandalonePattern = new RegExp(`(?:^|\\n|\\s)\\s*(${countryNamesEscaped})\\s*(?:\\n|$|Phone|Tel|Téléphone|RCS|SIRET|SIREN|Immatricul|[A-Z])`, 'im');
      const countryStandalone = legalTextWithNewlines.match(countryStandalonePattern);
      
      if (countryStandalone) {
        const countryInfo = getCountryInfo(countryStandalone[1]);
        if (countryInfo.code) {
          company.country = countryInfo.code;
          company.countryName = countryInfo.name;
        }
      }
      
      // Si contexte français et pas de pays trouvé, force FR
      if (!company.country && isFrenchContext) {
        company.country = 'FR';
        company.countryName = 'France';
      }
    }
  }
  
  // Fallback: pays depuis le domaine
  if (!company.country) {
    const domain = getRegistrableDomain(sourceUrl);
    if (domain) {
      const tld = domain.split('.').pop();
      const tldToCountry = {
        'fr': 'FR', 'com': null, 'org': null, 'net': null,
        'de': 'DE', 'uk': 'GB', 'co.uk': 'GB',
        'es': 'ES', 'it': 'IT', 'be': 'BE', 'ch': 'CH',
        'nl': 'NL', 'at': 'AT', 'pt': 'PT'
      };
      company.country = tldToCountry[tld] || null;
      if (company.country) {
        const countryInfo = getCountryInfo(company.country === 'FR' ? 'France' : company.country);
        company.countryName = countryInfo.name;
      }
    }
  }
  
  return company;
}
