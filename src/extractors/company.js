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
  
  // 2. Mentions légales (pour legalName)
  // Cherche dans les pages legal/mentions-legales
  const legalText = $('body').text();
  const legalMatches = legalText.match(/Raison sociale[:\s]+([^\n]+)/i) || 
                       legalText.match(/Dénomination[:\s]+([^\n]+)/i) ||
                       legalText.match(/Legal name[:\s]+([^\n]+)/i);
  
  if (legalMatches && !company.legalName) {
    company.legalName = legalMatches[1].trim();
  }
  
  // 3. Pays depuis le domaine (fallback)
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
  
  return company;
}
