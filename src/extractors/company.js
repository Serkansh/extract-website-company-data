import * as cheerio from 'cheerio';
import { getRegistrableDomain } from '../utils/url-utils.js';

/**
 * Extrait les informations entreprise depuis une page HTML
 */
export function extractCompany(html, sourceUrl) {
  const $ = cheerio.load(html);
  const company = {
    name: null,
    legalName: null,
    country: null,
    address: null,
    openingHours: null
  };

  // Ignore scripts/styles pour les extractions textuelles (mentions légales, adresse)
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
      // Nettoie le title (enlève souvent " - Home" ou " | Company")
      company.name = title.split(/[-|]/)[0].trim();
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
          
          // Adresse
          if (obj.address) {
            const address = obj.address;
            if (typeof address === 'object') {
              company.address = {
                street: address.streetAddress || address.street || null,
                postalCode: address.postalCode || null,
                city: address.addressLocality || address.city || null,
                country: address.addressCountry || null
              };
              
              // Pays depuis l'adresse
              if (address.addressCountry && !company.country) {
                company.country = typeof address.addressCountry === 'object' 
                  ? address.addressCountry.name || address.addressCountry
                  : address.addressCountry;
              }
            }
          }
          
          // Horaires d'ouverture
          if (obj.openingHoursSpecification && !company.openingHours) {
            company.openingHours = obj.openingHoursSpecification;
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
  
  // 2. Mentions légales (legalName + siège social / adresse)
  const legalText = $('body').text().replace(/\s+/g, ' ').trim();

  const legalNameMatches =
    legalText.match(/Raison\s+sociale\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i) ||
    legalText.match(/Dénomination\s+(?:sociale)?\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i) ||
    legalText.match(/Société\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i) ||
    // "Le site X est la propriété exclusive de SARL Y, qui l'édite."
    legalText.match(/propri[eé]t[eé]\s+exclusive\s+de\s+([^,]+?)(?:\s*,\s*qui|\s+qui)\b/i) ||
    // EN: "owned by [Company Name], a company..."
    legalText.match(/owned\s+by\s+([^,]+?)(?:\s*,\s*a\s+company|\s+\(|$)/i) ||
    legalText.match(/Legal\s+name\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i);

  if (legalNameMatches && !company.legalName) {
    company.legalName = legalNameMatches[1].trim();
  }

  // Si on n'a pas de "name" mais qu'on a une legalName (cas fréquent en mentions légales)
  if (!company.name && company.legalName) {
    company.name = company.legalName;
  }

  // Adresse / siège social (best-effort FR + EN)
  // On capture une "phrase" après le label, puis on tente de parser CP/ville
  const addressMatches =
    // EN: "whose registered office is at [address]"
    legalText.match(/whose\s+registered\s+office\s+is\s+at\s+(.+?)(?=\s*,\s*(?:with\s+capital|registered|VAT|$))/i) ||
    // FR: On coupe avant les libellés suivants, très fréquents en mentions légales
    legalText.match(/Si[eè]ge\s+social\s*[:\-]\s*(.+?)(?=\s+(?:Immatricul|RCS|SIRET|SIREN|Num[eé]ro|N°|Adresse\s+de\s+courrier\s+[eé]lectronique|Email|Courriel|Directeur|H[ée]bergement|H[ée]bergeur|Propri[eé]t[eé])\b|$)/i) ||
    legalText.match(/Adresse\s+du\s+si[eè]ge\s*[:\-]\s*(.+?)(?=\s+(?:Immatricul|RCS|SIRET|SIREN|Num[eé]ro|N°|Adresse\s+de\s+courrier\s+[eé]lectronique|Email|Courriel|Directeur|H[ée]bergement|H[ée]bergeur|Propri[eé]t[eé])\b|$)/i) ||
    legalText.match(/Adresse\s+postale\s*[:\-]\s*(.+?)(?=\s+(?:Immatricul|RCS|SIRET|SIREN|Num[eé]ro|N°|Adresse\s+de\s+courrier\s+[eé]lectronique|Email|Courriel|Directeur|H[ée]bergement|H[ée]bergeur|Propri[eé]t[eé])\b|$)/i) ||
    legalText.match(/Adresse\s*[:\-]\s*(.+?)(?=\s+(?:Immatricul|RCS|SIRET|SIREN|Num[eé]ro|N°|Adresse\s+de\s+courrier\s+[eé]lectronique|Email|Courriel|Directeur|H[ée]bergement|H[ée]bergeur|Propri[eé]t[eé])\b|$)/i);

  if (addressMatches && !company.address) {
    const addr = addressMatches[1].trim().replace(/\s+/g, ' ').replace(/[;,.]$/, '');
    const cpMatch = addr.match(/\b(\d{5})\b/);
    if (cpMatch) {
      const postalCode = cpMatch[1];
      const [before, after] = addr.split(postalCode);
      // La partie après le CP contient parfois des libellés collés (ex: "Paris Immatriculée ...").
      // On coupe au premier libellé connu et on ne garde que le début (souvent 1-3 mots).
      const afterClean0 = (after || '').trim().replace(/^[,\-]/, '').trim();
      // Cas fréquent: concaténation sans espace, ex "ParisImmatriculée..."
      const afterClean = afterClean0.replace(/([a-zÀ-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2');
      // On ne met PAS de bornes de mot, car on peut avoir "ParisImmatriculée" (pas de \b)
      const stopAt = afterClean.search(/(Immatricul|RCS|SIRET|SIREN|Num[eé]ro|N°|Adresse|Email|Courriel|Directeur|H[ée]bergement|H[ée]bergeur|Propri[eé]t[eé])/i);
      let cityPart = (stopAt >= 0 ? afterClean.slice(0, stopAt) : afterClean).trim();
      
      // Extrait le pays depuis cityPart si présent (ex: "Levallois-Perret, France")
      let city = cityPart || null;
      let countryFromCity = null;
      const countryPattern = /\b(France|United\s+Kingdom|UK|Germany|Deutschland|Spain|España|Italy|Italia|Belgium|Belgique|Switzerland|Suisse|Netherlands|Nederland|Austria|Österreich|Portugal)\b/i;
      const countryMatch = cityPart.match(countryPattern);
      if (countryMatch) {
        const countryName = countryMatch[1].toLowerCase();
        const countryMap = {
          'france': 'FR', 'united kingdom': 'GB', 'uk': 'GB',
          'germany': 'DE', 'deutschland': 'DE',
          'spain': 'ES', 'españa': 'ES',
          'italy': 'IT', 'italia': 'IT',
          'belgium': 'BE', 'belgique': 'BE',
          'switzerland': 'CH', 'suisse': 'CH',
          'netherlands': 'NL', 'nederland': 'NL',
          'austria': 'AT', 'österreich': 'AT',
          'portugal': 'PT'
        };
        countryFromCity = countryMap[countryName] || null;
        // Retire le pays de la ville (ex: "Levallois-Perret, France" -> "Levallois-Perret")
        // On échappe le nom du pays pour la regex
        const countryNameEscaped = countryMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        city = cityPart.replace(new RegExp(`,?\\s*${countryNameEscaped}`, 'i'), '').trim() || null;
      }
      
      const street = (before || '').trim().replace(/[,\-]$/, '').trim() || null;
      company.address = {
        street,
        postalCode,
        city,
        country: countryFromCity || company.country || null
      };
    } else {
      company.address = {
        street: addr || null,
        postalCode: null,
        city: null,
        country: company.country || null
      };
    }
  }
  
  // 3. Pays depuis le texte (mentions légales) ou domaine (fallback)
  if (!company.country) {
    // Cherche le pays dans le texte (ex: "France", "registered in France", "in France")
    const countryMatches = legalText.match(/\b(?:registered\s+in|in|at)\s+(France|United\s+Kingdom|UK|Germany|Deutschland|Spain|España|Italy|Italia|Belgium|Belgique|Switzerland|Suisse|Netherlands|Nederland|Austria|Österreich|Portugal)\b/i);
    if (countryMatches) {
      const countryName = countryMatches[1].toLowerCase();
      const countryMap = {
        'france': 'FR', 'united kingdom': 'GB', 'uk': 'GB',
        'germany': 'DE', 'deutschland': 'DE',
        'spain': 'ES', 'españa': 'ES',
        'italy': 'IT', 'italia': 'IT',
        'belgium': 'BE', 'belgique': 'BE',
        'switzerland': 'CH', 'suisse': 'CH',
        'netherlands': 'NL', 'nederland': 'NL',
        'austria': 'AT', 'österreich': 'AT',
        'portugal': 'PT'
      };
      company.country = countryMap[countryName] || null;
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
    }
  }

  // Si on a déterminé le pays après coup, on le propage dans l'adresse
  if (company.country && company.address && !company.address.country) {
    company.address.country = company.country;
  }
  
  return company;
}
