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
    countryName: null,
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
  // On garde deux versions : normalisée (pour regex simples) et avec sauts de ligne (pour recherche pays)
  const legalTextNormalized = $('body').text().replace(/\s+/g, ' ').trim();
  const legalTextWithNewlines = $('body').text().trim();
  const legalText = legalTextNormalized; // Utilise la version normalisée par défaut

  const legalNameMatches =
    legalText.match(/Raison\s+sociale\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i) ||
    legalText.match(/Dénomination\s+(?:sociale)?\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i) ||
    legalText.match(/Société\s*[:\-]\s*([^.\n]+?)(?:\s{2,}|$)/i) ||
    // "Le site X est la propriété exclusive de SARL Y, qui l'édite."
    legalText.match(/propri[eé]t[eé]\s+exclusive\s+de\s+([^,]+?)(?:\s*,\s*qui|\s+qui)\b/i) ||
    // EN: "owned by [Company Name], a company..."
    legalText.match(/owned\s+by\s+([^,]+?)(?:\s*,\s*a\s+company|\s+\(|$)/i) ||
    // Format: "HORIZON SOFTWARE SAS" ou "COMPANY NAME SAS" (cherche partout, pas juste en début de ligne)
    legalText.match(/\b([A-Z][A-Z\s]{3,}(?:SAS|SARL|SA|SRL|LTD|LLC|INC|GMBH|BV|SPA))\b/) ||
    // Format alternatif: "Legal information HORIZON SOFTWARE SAS" ou "Company: HORIZON SOFTWARE SAS"
    legalText.match(/(?:Legal\s+information|Company|Société|Entreprise)\s*:?\s*([A-Z][A-Z\s]{3,}(?:SAS|SARL|SA|SRL|LTD|LLC|INC|GMBH|BV|SPA))\b/i) ||
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
  // IMPORTANT: Limite la capture pour éviter de capturer du HTML/formulaire
  const addressMatches =
    // EN: "whose registered office is at [address]"
    legalText.match(/whose\s+registered\s+office\s+is\s+at\s+(.+?)(?=\s*,\s*(?:with\s+capital|registered|VAT|$))/i) ||
    // Format simple: "60 rue de Monceau, 75008 Paris, France" (cherche partout, limite à 100 caractères max pour street)
    legalText.match(/(\d+\s+[^,\n]{1,100}?),\s*(\d{5})\s+([^,\n]{1,50}?)(?:,\s*(France|United\s+Kingdom|UK|Germany|Spain|Italy|Belgium|Switzerland|Netherlands|Austria|Portugal|United\s+States|USA|Canada|Australia|Japan|China|India|Brazil|Mexico|South\s+Korea|Singapore|Hong\s+Kong|Ireland|Poland|Sweden|Norway|Denmark|Finland|Greece|Romania|Hungary|Russia|Turkey|South\s+Africa|Israel|UAE|United\s+Arab\s+Emirates|Saudi\s+Arabia))?\b/) ||
    // Format multi-lignes: "60 rue de Monceau\n75008 Paris\nFrance" (limite à 100 caractères max pour street)
    legalText.match(/(\d+\s+[^\n]{1,100}?)\s+(\d{5})\s+([^\n]{1,50}?)(?:\s+(France|United\s+Kingdom|UK|Germany|Spain|Italy|Belgium|Switzerland|Netherlands|Austria|Portugal|United\s+States|USA|Canada|Australia|Japan|China|India|Brazil|Mexico|South\s+Korea|Singapore|Hong\s+Kong|Ireland|Poland|Sweden|Norway|Denmark|Finland|Greece|Romania|Hungary|Russia|Turkey|South\s+Africa|Israel|UAE|United\s+Arab\s+Emirates|Saudi\s+Arabia))?\b/) ||
    // FR: On coupe avant les libellés suivants, très fréquents en mentions légales (limite à 200 caractères max)
    legalText.match(/Si[eè]ge\s+social\s*[:\-]\s*(.{1,200}?)(?=\s+(?:Immatricul|RCS|SIRET|SIREN|Num[eé]ro|N°|Adresse\s+de\s+courrier\s+[eé]lectronique|Email|Courriel|Directeur|H[ée]bergement|H[ée]bergeur|Propri[eé]t[eé]|Phone|View\s+on|Search|Contact|Get\s+in\s+touch|Please\s+enable|Name\s+\*|Email\s+Address|Subject|Request|Application|Country\s+\*|Company\s+\*|Message|Consent|Send\s+Message)\b|$)/i) ||
    legalText.match(/Adresse\s+du\s+si[eè]ge\s*[:\-]\s*(.{1,200}?)(?=\s+(?:Immatricul|RCS|SIRET|SIREN|Num[eé]ro|N°|Adresse\s+de\s+courrier\s+[eé]lectronique|Email|Courriel|Directeur|H[ée]bergement|H[ée]bergeur|Propri[eé]t[eé]|Phone|View\s+on|Search|Contact|Get\s+in\s+touch|Please\s+enable|Name\s+\*|Email\s+Address|Subject|Request|Application|Country\s+\*|Company\s+\*|Message|Consent|Send\s+Message)\b|$)/i) ||
    legalText.match(/Adresse\s+postale\s*[:\-]\s*(.{1,200}?)(?=\s+(?:Immatricul|RCS|SIRET|SIREN|Num[eé]ro|N°|Adresse\s+de\s+courrier\s+[eé]lectronique|Email|Courriel|Directeur|H[ée]bergement|H[ée]bergeur|Propri[eé]t[eé]|Phone|View\s+on|Search|Contact|Get\s+in\s+touch|Please\s+enable|Name\s+\*|Email\s+Address|Subject|Request|Application|Country\s+\*|Company\s+\*|Message|Consent|Send\s+Message)\b|$)/i) ||
    legalText.match(/Adresse\s*[:\-]\s*(.{1,200}?)(?=\s+(?:Immatricul|RCS|SIRET|SIREN|Num[eé]ro|N°|Adresse\s+de\s+courrier\s+[eé]lectronique|Email|Courriel|Directeur|H[ée]bergement|H[ée]bergeur|Propri[eé]t[eé]|Phone|View\s+on|Search|Contact|Get\s+in\s+touch|Please\s+enable|Name\s+\*|Email\s+Address|Subject|Request|Application|Country\s+\*|Company\s+\*|Message|Consent|Send\s+Message)\b|$)/i);

  if (addressMatches && !company.address) {
    // Cas spécial: format "60 rue de Monceau, 75008 Paris, France" ou "60 rue de Monceau\n75008 Paris\nFrance"
    // (match[1]=street, match[2]=CP, match[3]=city, match[4]=country)
    if (addressMatches[2] && addressMatches[3]) {
      let street = addressMatches[1].trim().replace(/\s+/g, ' ');
      const postalCode = addressMatches[2].trim();
      let city = addressMatches[3].trim().replace(/\s+/g, ' ');
      const countryText = addressMatches[4] ? addressMatches[4].trim() : null;
      
      // Nettoie street : enlève les textes parasites avant l'adresse
      // Exemples: "752 808 113 et dont le siège social est situé", "SIRET: 123456789", etc.
      street = street
        // Enlève les numéros SIRET/SIREN/RCS au début (format: "752 808 113" ou "SIRET: 123456789")
        .replace(/^(?:SIRET|SIREN|RCS|Numéro|N°|SIREN|RCS\s+Paris)\s*[:\-]?\s*[\d\s]{8,}/i, '')
        .replace(/^[\d\s]{8,}(?:\s+et\s+dont\s+le\s+siège\s+social)/i, '')
        // Enlève les phrases parasites avant l'adresse (plus agressif)
        .replace(/^(?:et\s+dont\s+le\s+siège\s+social\s+est\s+situé|dont\s+le\s+siège\s+social\s+est\s+situé|siège\s+social\s*[:\-]\s*|représentée\s+par\s+son\s+Président\.?\s*Siège\s+social\s*[:\-]\s*|représentée\s+par|capital\s+de[\s\d,]+euros?|est\s+situé\s*)/i, '')
        // Enlève les numéros de téléphone (format: "33 3 88 22 02 02" ou "+33 1 42 60 94 90")
        .replace(/\b(?:\+33|0|33)\s*[\d\s().-]{8,}\b/g, '')
        // Enlève les numéros longs collés (ex: "58490092871")
        .replace(/^\d{10,}\s+/g, '')
        // Enlève les montants en euros au début (ex: "10 000,00 EUROS et dont")
        .replace(/^[\d\s,]+EUROS?\s+et\s+dont\s+le\s+siège\s+social\s+est\s+situé\s*/i, '')
        // Enlève les mots-clés HTML/formulaire
        .replace(/\s*(Phone|View\s+on|Search|Contact|Get\s+in\s+touch|Please\s+enable|Name\s+\*|Email\s+Address|Subject|Request|Application|Country\s+\*|Company\s+\*|Message|Consent|Send\s+Message).*$/i, '')
        // Nettoie les espaces multiples et les caractères parasites
        .replace(/\s+/g, ' ')
        .replace(/^[,\-.\s]+|[,\-.\s]+$/g, '')
        .trim();
      
      // Si street ne commence pas par un numéro suivi d'une rue, essaie de trouver le début réel
      // Exemple: "33 3 88 22 02 02Origami16 rue du Bataillon" -> "16 rue du Bataillon"
      // Exemple: "est situé 9, rue de Liège" -> "9, rue de Liège"
      if (!/^\d+\s*[,]?\s*[a-zàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/i.test(street)) {
        const realAddressMatch = street.match(/(\d+\s*[,]?\s*[a-zàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ][^,\n]{5,}?)(?:,|\s+\d{5}|$)/i);
        if (realAddressMatch) {
          street = realAddressMatch[1].trim();
        }
      }
      
      // Nettoie encore une fois pour enlever les restes de phrases parasites
      street = street
        .replace(/^(?:est\s+situé\s*|siège\s+social\s*[:\-]\s*|représentée\s+par\s+son\s+Président\.?\s*Siège\s+social\s*[:\-]\s*)/i, '')
        .trim();
      
      // Nettoie city
      city = city
        .replace(/\s*(Phone|View\s+on|Search|Contact|Get\s+in\s+touch|Please\s+enable|Name\s+\*|Email\s+Address|Subject|Request|Application|Country\s+\*|Company\s+\*|Message|Consent|Send\s+Message).*$/i, '')
        .trim();
      
      // Si street ou city contient des caractères suspects (HTML, formulaire), on rejette
      if (street.length > 100 || city.length > 50 || /[<>{}]|form|input|select|button|textarea/i.test(street + city)) {
        // Skip this match, try next
      } else {
        const countryInfo = countryText ? getCountryInfo(countryText) : null;
        
        const finalCountry = countryInfo?.code || null;
        const finalCountryName = countryInfo?.name || null;
        
        company.address = {
          street,
          postalCode,
          city,
          country: finalCountry || null,
          countryName: finalCountryName || null
        };
        
        // PROPAGATION IMMÉDIATE : Si on a un pays dans l'adresse mais pas dans company, on le propage
        if (finalCountry && !company.country) {
          company.country = finalCountry;
          company.countryName = finalCountryName;
        }
      }
    }
    
    // Si on n'a pas encore d'adresse, essaie le format classique
    if (!company.address) {
      // Format classique (une seule chaîne à parser)
      let addr = addressMatches[1].trim().replace(/\s+/g, ' ').replace(/[;,.]$/, '');
      
      // Nettoie addr : enlève les textes parasites au début (plus agressif)
      addr = addr
        // Enlève les numéros SIRET/SIREN/RCS au début
        .replace(/^(?:SIRET|SIREN|RCS|Numéro|N°)\s*[:\-]?\s*[\d\s]{8,}/i, '')
        .replace(/^[\d\s]{8,}(?:\s+et\s+dont\s+le\s+siège\s+social)/i, '')
        // Enlève les phrases parasites (plus complet)
        .replace(/^(?:et\s+dont\s+le\s+siège\s+social\s+est\s+situé|dont\s+le\s+siège\s+social\s+est\s+situé|siège\s+social\s*[:\-]\s*|représentée\s+par\s+son\s+Président\.?\s*Siège\s+social\s*[:\-]\s*|représentée\s+par|est\s+situé\s*)/i, '')
        // Enlève les numéros de téléphone
        .replace(/\b(?:\+33|0|33)\s*[\d\s().-]{8,}\b/g, '')
        // Enlève les numéros longs collés
        .replace(/^\d{10,}\s+/g, '')
        // Enlève les montants en euros au début (ex: "10 000,00 EUROS et dont")
        .replace(/^[\d\s,]+EUROS?\s+et\s+dont\s+le\s+siège\s+social\s+est\s+situé\s*/i, '')
        // Enlève les mots-clés HTML/formulaire
        .replace(/\s*(Phone|View\s+on|Search|Contact|Get\s+in\s+touch|Please\s+enable|Name\s+\*|Email\s+Address|Subject|Request|Application|Country\s+\*|Company\s+\*|Message|Consent|Send\s+Message).*$/i, '')
        // Nettoie les espaces et caractères parasites
        .replace(/\s+/g, ' ')
        .replace(/^[,\-.\s]+|[,\-.\s]+$/g, '')
        .trim();
      
      // Si addr ne commence pas par un numéro suivi d'une rue, essaie de trouver le début réel
      // Exemple: "421 866 344, représentée par son Président.Siège social : 32, rue edmond Rostand" -> "32, rue edmond Rostand"
      if (!/^\d+\s*[,]?\s*[a-zàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/i.test(addr)) {
        // Cherche un pattern d'adresse valide dans le texte
        const realAddressMatch = addr.match(/(\d+\s*[,]?\s*[a-zàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ][^,\n]{5,}?)(?:,|\s+\d{5}|$)/i);
        if (realAddressMatch) {
          addr = realAddressMatch[1].trim();
        }
      }
      
      // Nettoie encore une fois pour enlever les restes de phrases parasites
      addr = addr
        .replace(/^(?:est\s+situé\s*|siège\s+social\s*[:\-]\s*|représentée\s+par\s+son\s+Président\.?\s*Siège\s+social\s*[:\-]\s*|[\d\s]{8,},\s*représentée\s+par\s+son\s+Président\.?\s*Siège\s+social\s*[:\-]\s*)/i, '')
        .trim();
      
      // Si addr contient des caractères suspects (HTML, formulaire), on rejette
      if (addr.length > 200 || /[<>{}]|form|input|select|button|textarea/i.test(addr)) {
        addr = null;
      }
      
      if (addr) {
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
        
        // Extrait le pays depuis cityPart si présent (ex: "Levallois-Perret, France" ou "Paris\nFrance")
        let city = cityPart || null;
        let countryFromCity = null;
        let countryNameFromCity = null;
        
        // Détection du contexte français : code postal français (commence par 75, 77, 78, 91, 92, 93, 94, 95)
        const isFrenchPostalCode = /^(75|77|78|91|92|93|94|95)\d{3}$/.test(postalCode);
        
        // Si contexte français, exclut les pays non-européens de la recherche
        const countryPattern = isFrenchPostalCode 
          ? /\b(France|United\s+Kingdom|UK|Great\s+Britain|Germany|Deutschland|Spain|España|Italy|Italia|Belgium|Belgique|Switzerland|Suisse|Netherlands|Nederland|Austria|Österreich|Portugal|United\s+States|USA|Canada|Australia|New\s+Zealand|Ireland|Poland|Pologne|Czech\s+Republic|Sweden|Suède|Norway|Norvège|Denmark|Danemark|Finland|Finlande|Greece|Grèce|Romania|Roumanie|Hungary|Hongrie|Russia|Russie|Turkey|Turquie)\b/i
          : /\b(France|United\s+Kingdom|UK|Great\s+Britain|Germany|Deutschland|Spain|España|Italy|Italia|Belgium|Belgique|Switzerland|Suisse|Netherlands|Nederland|Austria|Österreich|Portugal|United\s+States|USA|Canada|Australia|New\s+Zealand|Japan|China|India|Brazil|Mexico|South\s+Korea|Korea|Singapore|Hong\s+Kong|Ireland|Poland|Pologne|Czech\s+Republic|Sweden|Suède|Norway|Norvège|Denmark|Danemark|Finland|Finlande|Greece|Grèce|Romania|Roumanie|Hungary|Hongrie|Russia|Russie|Turkey|Turquie|South\s+Africa|Israel|UAE|United\s+Arab\s+Emirates|Saudi\s+Arabia|Arabie\s+Saoudite)\b/i;
        
        const countryMatch = cityPart.match(countryPattern);
        if (countryMatch) {
          const countryInfo = getCountryInfo(countryMatch[1]);
          countryFromCity = countryInfo.code;
          countryNameFromCity = countryInfo.name;
          // Retire le pays de la ville (ex: "Levallois-Perret, France" -> "Levallois-Perret" ou "Paris\nFrance" -> "Paris")
          // On échappe le nom du pays pour la regex
          const countryNameEscaped = countryMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          city = cityPart.replace(new RegExp(`,?\\s*${countryNameEscaped}|\\s+${countryNameEscaped}`, 'i'), '').trim() || null;
        }
        
        // Si pas de pays dans cityPart, cherche dans le texte après l'adresse (format multi-lignes)
        if (!countryFromCity) {
          // Utilise la version avec sauts de ligne pour mieux détecter les pays sur ligne séparée
          const addrIndexInOriginal = legalTextWithNewlines.toLowerCase().indexOf(addr.toLowerCase());
          if (addrIndexInOriginal >= 0) {
            const afterAddress = legalTextWithNewlines.substring(addrIndexInOriginal + addr.length);
            
            // Pattern amélioré : cherche le pays même s'il est seul sur une ligne
            // Si contexte français, exclut les pays non-européens
            const countryPattern = isFrenchPostalCode
              ? /(?:^|\n|\s)(France|United\s+Kingdom|UK|Great\s+Britain|Germany|Deutschland|Spain|España|Italy|Italia|Belgium|Belgique|Switzerland|Suisse|Netherlands|Nederland|Austria|Österreich|Portugal|United\s+States|USA|Canada|Australia|New\s+Zealand|Ireland|Poland|Pologne|Czech\s+Republic|Sweden|Suède|Norway|Norvège|Denmark|Danemark|Finland|Finlande|Greece|Grèce|Romania|Roumanie|Hungary|Hongrie|Russia|Russie|Turkey|Turquie)(?:\s|$|\n|Phone|Tel|Téléphone|RCS|SIRET|SIREN|Immatricul)/gim
              : /(?:^|\n|\s)(France|United\s+Kingdom|UK|Great\s+Britain|Germany|Deutschland|Spain|España|Italy|Italia|Belgium|Belgique|Switzerland|Suisse|Netherlands|Nederland|Austria|Österreich|Portugal|United\s+States|USA|Canada|Australia|New\s+Zealand|Japan|China|India|Brazil|Mexico|South\s+Korea|Korea|Singapore|Hong\s+Kong|Ireland|Poland|Pologne|Czech\s+Republic|Sweden|Suède|Norway|Norvège|Denmark|Danemark|Finland|Finlande|Greece|Grèce|Romania|Roumanie|Hungary|Hongrie|Russia|Russie|Turkey|Turquie|South\s+Africa|Israel|UAE|United\s+Arab\s+Emirates|Saudi\s+Arabia|Arabie\s+Saoudite)(?:\s|$|\n|Phone|Tel|Téléphone|RCS|SIRET|SIREN|Immatricul)/gim;
            
            // ULTRA PRIORITÉ : Cherche d'abord dans les 20 premiers caractères (juste après l'adresse)
            const afterAddressUltraPriority = afterAddress.substring(0, 10);
            let countryMatches = [...afterAddressUltraPriority.matchAll(countryPattern)];
            
            // Si rien dans les 20 premiers, cherche dans les 30 caractères
            if (countryMatches.length === 0) {
              const afterAddressPriority = afterAddress.substring(0, 30);
              countryMatches = [...afterAddressPriority.matchAll(countryPattern)];
            }
            
            // Si rien dans les 100 premiers, cherche dans les 300 caractères
            if (countryMatches.length === 0) {
              const afterAddressExtended = afterAddress.substring(0, 300);
              countryMatches = [...afterAddressExtended.matchAll(countryPattern)];
            }
            
            // Prend le premier pays trouvé (le plus proche de l'adresse)
            if (countryMatches.length > 0) {
              const firstMatch = countryMatches[0];
              const countryInfo = getCountryInfo(firstMatch[1]);
              countryFromCity = countryInfo.code;
              countryNameFromCity = countryInfo.name;
            }
          }
        }
        
        // PROPAGATION IMMÉDIATE : Si on a détecté le pays, on le met dans company.country aussi
        if (countryFromCity && !company.country) {
          company.country = countryFromCity;
          company.countryName = countryNameFromCity;
        }
        
        const street = (before || '').trim().replace(/[,\-]$/, '').trim() || null;
        
        // PROTECTION FINALE : Si on a un code postal français, force FR par défaut si pas de pays trouvé
        // Cela évite que "China" ou d'autres pays soient détectés ailleurs dans le code
        const isFrenchPostalCodeHere = /^(75|77|78|91|92|93|94|95)\d{3}$/.test(postalCode);
        let finalCountry = countryFromCity || company.country || null;
        let finalCountryName = countryNameFromCity || company.countryName || null;
        
        if (isFrenchPostalCodeHere && !finalCountry) {
          finalCountry = 'FR';
          finalCountryName = 'France';
          // Propagation immédiate à company
          if (!company.country) {
            company.country = finalCountry;
            company.countryName = finalCountryName;
          }
        }
        
        company.address = {
          street,
          postalCode,
          city,
          country: finalCountry,
          countryName: finalCountryName
        };
      } else {
        company.address = {
          street: addr || null,
          postalCode: null,
          city: null,
          country: company.country || null,
          countryName: company.countryName || null
        };
      }
      }
    }
  }
  
  // 3. Pays depuis le texte (mentions légales) ou domaine (fallback)
  if (!company.country) {
    // Détection du contexte français : code postal français OU ville française connue
    const isFrenchPostalCode = company.address?.postalCode && /^(75|77|78|91|92|93|94|95)\d{3}$/.test(company.address.postalCode);
    
    // Liste de villes françaises connues (pour détecter le pays même sans code postal)
    const frenchCities = [
      'paris', 'lyon', 'marseille', 'toulouse', 'nice', 'nantes', 'strasbourg', 'montpellier',
      'bordeaux', 'lille', 'rennes', 'reims', 'saint-étienne', 'toulon', 'grenoble', 'dijon',
      'angers', 'villeurbanne', 'saint-denis', 'le havre', 'nîmes', 'aix-en-provence', 'clermont-ferrand',
      'brest', 'tours', 'limoges', 'amiens', 'perpignan', 'metz', 'besançon', 'boulogne-billancourt',
      'orléans', 'mulhouse', 'rouen', 'caen', 'nancy', 'argenteuil', 'montreuil',
      'roubaix', 'tourcoing', 'nanterre', 'avignon', 'créteil', 'dunkirk', 'poitiers', 'asnières-sur-seine',
      'courbevoie', 'versailles', 'vitry-sur-seine', 'aulnay-sous-bois', 'colombes', 'la rochelle',
      'verdun', 'athis', 'hendaye', 'bastia', 'val d\'isère', 'val-d\'isère', 'corsica', 'corse'
    ];
    
    const isFrenchCity = company.address?.city && frenchCities.some(city => 
      company.address.city.toLowerCase().includes(city.toLowerCase()) || 
      city.toLowerCase().includes(company.address.city.toLowerCase())
    );
    
    const isFrenchContext = isFrenchPostalCode || isFrenchCity;
    
    // Cherche le pays dans le texte (ex: "France", "registered in France", "in France")
    // Si contexte français, exclut les pays non-européens
    const countryPattern = isFrenchContext
      ? /\b(?:registered\s+in|in|at)\s+(France|United\s+Kingdom|UK|Great\s+Britain|Germany|Deutschland|Spain|España|Italy|Italia|Belgium|Belgique|Switzerland|Suisse|Netherlands|Nederland|Austria|Österreich|Portugal|United\s+States|USA|Canada|Australia|New\s+Zealand|Ireland|Poland|Pologne|Czech\s+Republic|Sweden|Suède|Norway|Norvège|Denmark|Danemark|Finland|Finlande|Greece|Grèce|Romania|Roumanie|Hungary|Hongrie|Russia|Russie|Turkey|Turquie)\b/i
      : /\b(?:registered\s+in|in|at)\s+(France|United\s+Kingdom|UK|Great\s+Britain|Germany|Deutschland|Spain|España|Italy|Italia|Belgium|Belgique|Switzerland|Suisse|Netherlands|Nederland|Austria|Österreich|Portugal|United\s+States|USA|Canada|Australia|New\s+Zealand|Japan|China|India|Brazil|Mexico|South\s+Korea|Korea|Singapore|Hong\s+Kong|Ireland|Poland|Pologne|Czech\s+Republic|Sweden|Suède|Norway|Norvège|Denmark|Danemark|Finland|Finlande|Greece|Grèce|Romania|Roumanie|Hungary|Hongrie|Russia|Russie|Turkey|Turquie|South\s+Africa|Israel|UAE|United\s+Arab\s+Emirates|Saudi\s+Arabia|Arabie\s+Saoudite)\b/i;
    
    const countryMatches = legalText.match(countryPattern);
    if (countryMatches) {
      const countryInfo = getCountryInfo(countryMatches[1]);
      company.country = countryInfo.code;
      company.countryName = countryInfo.name;
    }
    
    // Cherche n'importe quel nom de pays seul sur une ligne ou après une adresse (universel)
    // MAIS seulement si on a une adresse et que le pays est proche de l'adresse
    if (!company.country) {
      // PRIORITÉ 1 : Si on a déjà un pays dans l'adresse, on l'utilise
      if (company.address && company.address.country) {
        company.country = company.address.country;
        company.countryName = company.address.countryName;
      } else if (company.address && (company.address.street || company.address.postalCode || company.address.city)) {
        // PRIORITÉ 2 : Cherche le pays uniquement dans le contexte de l'adresse (300 caractères après)
        // Liste de tous les noms de pays supportés (en plusieurs langues)
        const countryNames = [
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
        
        // Construit l'adresse complète pour la recherche
        const addressParts = [
          company.address.street,
          company.address.postalCode,
          company.address.city
        ].filter(Boolean).join(' ');
        
        if (addressParts) {
          // Cherche le pays uniquement dans le contexte de l'adresse
          const addrIndexInOriginal = legalTextWithNewlines.toLowerCase().indexOf(addressParts.toLowerCase());
          if (addrIndexInOriginal >= 0) {
            const afterAddress = legalTextWithNewlines.substring(addrIndexInOriginal + addressParts.length);
            
            // Détection du contexte français : code postal français (commence par 75, 77, 78, 91, 92, 93, 94, 95)
            const isFrenchContext = company.address?.postalCode && /^(75|77|78|91|92|93|94|95)\d{3}$/.test(company.address.postalCode);
            
            // PRIORITÉ ABSOLUE : Si contexte français, cherche "France" en premier dans une zone large
            if (isFrenchContext) {
              // PROTECTION FINALE : Si on a un code postal français mais pas encore de pays, on force FR par défaut
              // Cela évite que "China" ou d'autres pays soient détectés ailleurs dans le code
              if (!company.country) {
                company.country = 'FR';
                company.countryName = 'France';
                if (company.address) {
                  company.address.country = 'FR';
                  company.address.countryName = 'France';
                }
              }
              // Cherche "France" dans les 200 premiers caractères (zone large pour capturer même si loin)
              const francePattern = /(?:^|\n|\r\n|\s)\s*(France)\s*(?:\n|$|Phone|Tel|Téléphone|RCS|SIRET|SIREN|Immatricul|[A-Z])/im;
              const franceMatch = afterAddress.substring(0, 200).match(francePattern);
              if (franceMatch) {
                const countryInfo = getCountryInfo('France');
                if (countryInfo.code) {
                  company.country = countryInfo.code;
                  company.countryName = countryInfo.name;
                  // Propagation immédiate à l'adresse
                  if (company.address) {
                    company.address.country = countryInfo.code;
                    company.address.countryName = countryInfo.name;
                  }
                  return; // Sort immédiatement si France trouvé
                }
              }
              
              // Si contexte français mais "France" non trouvé, exclut "China" et autres pays non-européens de la recherche
              const europeanCountries = countryNames.filter(name => {
                const lower = name.toLowerCase();
                return !['china', 'india', 'japan', 'brazil', 'mexico', 'south korea', 'korea', 'singapore', 'hong kong', 'south africa', 'uae', 'united arab emirates', 'saudi arabia', 'arabie saoudite'].includes(lower);
              });
              
              const countryNamesEscaped = europeanCountries.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
              const countryPattern = new RegExp(`(?:^|\\n|\\s)\\s*(${countryNamesEscaped})\\s*(?:\\n|$|Phone|Tel|Téléphone|RCS|SIRET|SIREN|Immatricul|[A-Z])`, 'gim');
              
              // Cherche dans les 30 premiers caractères (zone prioritaire)
              const afterAddressPriority = afterAddress.substring(0, 30);
              let countryMatches = [...afterAddressPriority.matchAll(countryPattern)];
              
              // Si rien dans les 30 premiers, cherche dans les 300 caractères
              if (countryMatches.length === 0) {
                const afterAddressExtended = afterAddress.substring(0, 300);
                countryMatches = [...afterAddressExtended.matchAll(countryPattern)];
              }
              
              // Prend le premier pays trouvé (le plus proche de l'adresse)
              if (countryMatches.length > 0) {
                const firstMatch = countryMatches[0];
                const countryInfo = getCountryInfo(firstMatch[1]);
                if (countryInfo.code) {
                  company.country = countryInfo.code;
                  company.countryName = countryInfo.name;
                  // Propagation immédiate à l'adresse
                  if (company.address) {
                    company.address.country = countryInfo.code;
                    company.address.countryName = countryInfo.name;
                  }
                }
              }
            } else {
              // Contexte non-français : recherche normale avec tous les pays
              // Recherche spécifique France en premier (priorité absolue)
              const francePattern = /(?:^|\n|\s)\s*(France)\s*(?:\n|$|Phone|Tel|Téléphone|RCS|SIRET|SIREN|Immatricul|[A-Z])/im;
              const franceMatch = afterAddress.substring(0, 100).match(francePattern);
              if (franceMatch) {
                const countryInfo = getCountryInfo('France');
                if (countryInfo.code) {
                  company.country = countryInfo.code;
                  company.countryName = countryInfo.name;
                  return; // Sort immédiatement si France trouvé
                }
              }
              
              const countryNamesEscaped = countryNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
              const countryPattern = new RegExp(`(?:^|\\n|\\s)\\s*(${countryNamesEscaped})\\s*(?:\\n|$|Phone|Tel|Téléphone|RCS|SIRET|SIREN|Immatricul|[A-Z])`, 'gim');
              
              // PRIORITÉ : Cherche d'abord dans les 30 premiers caractères (zone prioritaire juste après l'adresse)
              const afterAddressPriority = afterAddress.substring(0, 30);
              let countryMatches = [...afterAddressPriority.matchAll(countryPattern)];
              
              // Si rien dans les 30 premiers, cherche dans les 300 caractères
              if (countryMatches.length === 0) {
                const afterAddressExtended = afterAddress.substring(0, 300);
                countryMatches = [...afterAddressExtended.matchAll(countryPattern)];
              }
              
              // Prend le premier pays trouvé (le plus proche de l'adresse)
              if (countryMatches.length > 0) {
                const firstMatch = countryMatches[0];
                const countryInfo = getCountryInfo(firstMatch[1]);
                if (countryInfo.code) {
                  company.country = countryInfo.code;
                  company.countryName = countryInfo.name;
                }
              }
            }
          }
        }
      } else {
        // PRIORITÉ 3 : Si pas d'adresse, cherche dans tout le texte (mais avec validation)
        // Détection du contexte français : code postal français (commence par 75, 77, 78, 91, 92, 93, 94, 95)
        // Même si on n'a pas d'adresse complète, on peut avoir un code postal dans le texte
        const postalCodeMatch = legalText.match(/\b(75|77|78|91|92|93|94|95)\d{3}\b/);
        const isFrenchContext = !!postalCodeMatch;
        
        // Liste de tous les noms de pays supportés (en plusieurs langues)
        // Si contexte français, exclut les pays non-européens
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
        // Pattern amélioré : cherche le pays même s'il est seul sur une ligne, avec ou sans espace avant
        const countryStandalonePattern = new RegExp(`(?:^|\\n|\\s)\\s*(${countryNamesEscaped})\\s*(?:\\n|$|Phone|Tel|Téléphone|RCS|SIRET|SIREN|Immatricul|[A-Z])`, 'im');
        const countryStandalone = legalTextWithNewlines.match(countryStandalonePattern);
        
        if (countryStandalone) {
          const countryInfo = getCountryInfo(countryStandalone[1]);
          if (countryInfo.code) {
            company.country = countryInfo.code;
            company.countryName = countryInfo.name;
          }
        }
      }
    }
  }
  
  // Fallback 1: Pays depuis la ville française (si pas de code postal mais ville française connue)
  if (!company.country && company.address?.city) {
    const cityLower = company.address.city.toLowerCase();
    // Liste de villes françaises majeures (non exhaustive mais couvre les cas fréquents)
    const frenchCities = [
      'paris', 'lyon', 'marseille', 'toulouse', 'nice', 'nantes', 'strasbourg', 'montpellier',
      'bordeaux', 'lille', 'rennes', 'reims', 'saint-étienne', 'toulon', 'grenoble', 'dijon',
      'angers', 'villeurbanne', 'saint-denis', 'le havre', 'nîmes', 'aix-en-provence', 'clermont-ferrand',
      'brest', 'limoges', 'tours', 'amiens', 'perpignan', 'metz', 'besançon', 'boulogne-billancourt',
      'orléans', 'mulhouse', 'rouen', 'caen', 'argenteuil', 'saint-denis', 'roubaix', 'tourcoing',
      'nancy', 'avignon', 'vitry-sur-seine', 'créteil', 'dunkirk', 'poitiers', 'asnières-sur-seine',
      'courbevoie', 'versailles', 'nanterre', 'aubervilliers', 'colombes', 'aulnay-sous-bois',
      'rueil-malmaison', 'champigny-sur-marne', 'antibes', 'saint-maur-des-fossés', 'cannes',
      'calais', 'béziers', 'drancy', 'mérignac', 'saint-nazaire', 'colmar', 'issy-les-moulineaux',
      'noisy-le-grand', 'évry', 'la rochelle', 'bourges', 'hyères', 'cholet', 'meaux', 'pantin',
      'bondy', 'montauban', 'bayonne', 'sète', 'agen', 'verdun', 'marseille', 'athis', 'hendaye'
    ];
    
    // Vérifie si la ville est française (exact match ou contient)
    const isFrenchCity = frenchCities.some(fc => cityLower.includes(fc) || fc.includes(cityLower.split(/[,\s]/)[0]));
    if (isFrenchCity) {
      company.country = 'FR';
      company.countryName = 'France';
      if (company.address) {
        company.address.country = 'FR';
        company.address.countryName = 'France';
      }
    }
  }
  
  // Fallback 2: pays depuis le domaine
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

  // Propagation bidirectionnelle entre company.country/countryName et address.country/countryName
  if (company.address) {
    if (company.country && !company.address.country) {
      company.address.country = company.country;
      company.address.countryName = company.countryName;
    } else if (company.address.country && !company.country) {
      company.country = company.address.country;
      company.countryName = company.address.countryName;
    }
  }
  
  // PROTECTION FINALE ABSOLUE : Si on a un code postal français mais le pays est incorrect, force FR
  // Cette protection s'exécute en dernier pour corriger tout faux positif
  if (company.address?.postalCode) {
    const isFrenchPostalCodeFinal = /^(75|77|78|91|92|93|94|95)\d{3}$/.test(company.address.postalCode);
    if (isFrenchPostalCodeFinal && company.country !== 'FR') {
      // Force FR si code postal français mais pays incorrect (ex: CN, IN, etc.)
      company.country = 'FR';
      company.countryName = 'France';
      if (company.address) {
        company.address.country = 'FR';
        company.address.countryName = 'France';
      }
    }
  }
  
  return company;
}
