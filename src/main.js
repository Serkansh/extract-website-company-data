import { Actor, log } from 'apify';
import { crawlDomain } from './crawler.js';
import { getRegistrableDomain, normalizeUrl } from './utils/url-utils.js';

/**
 * Point d'entrée principal de l'Actor
 * 
 * Note: Le schéma du dataset doit être défini dans .actor/dataset-schema.json
 * et référencé dans .actor/actor.json. La définition programmatique échoue
 * à cause des permissions LIMITED_PERMISSIONS.
 */
await Actor.init();

const input = await Actor.getInput();
const {
  startUrls,
  timeoutSecs = 30,
  usePlaywrightFallback = true,
  includeCompany = true,
  includeContacts = true,
  includeSocials = true,
  keyPaths = []
} = input;

// Normalise les startUrls (peut être array ou string multi-ligne)
let urls = [];
if (Array.isArray(startUrls)) {
  urls = startUrls.map(item => typeof item === 'string' ? item : item.url);
} else if (typeof startUrls === 'string') {
  urls = startUrls.split('\n').map(line => line.trim()).filter(Boolean);
}

if (urls.length === 0) {
  throw new Error('No start URLs provided');
}

// Groupe les URLs par domaine enregistrable (canonicalisation)
const domainsMap = new Map();

for (const url of urls) {
  try {
    const normalizedUrl = normalizeUrl(url);
    const domain = getRegistrableDomain(normalizedUrl);
    
    if (!domain) {
      log.warning(`Invalid URL or domain: ${url}`);
      continue;
    }
    
    // Si le domaine existe déjà, garde la première URL (ou la plus courte)
    if (!domainsMap.has(domain)) {
      domainsMap.set(domain, normalizedUrl);
    } else {
      const existingUrl = domainsMap.get(domain);
      // Préfère les URLs sans www si possible
      if (normalizedUrl.includes('://www.') && !existingUrl.includes('://www.')) {
        // Garde l'existant (sans www)
      } else if (!normalizedUrl.includes('://www.') && existingUrl.includes('://www.')) {
        domainsMap.set(domain, normalizedUrl);
      } else if (normalizedUrl.length < existingUrl.length) {
        domainsMap.set(domain, normalizedUrl);
      }
    }
  } catch (error) {
    log.warning(`Error processing URL ${url}: ${error.message}`);
  }
}

const uniqueDomains = Array.from(domainsMap.values());
log.info(`Processing ${uniqueDomains.length} unique domains`);

// Traite chaque domaine (un seul pushData par domaine)
const results = [];

for (const url of uniqueDomains) {
  const domain = getRegistrableDomain(url);
  
  try {
    log.info(`Crawling domain: ${domain} (${url})`);
    
    const domainData = await crawlDomain(url, {
      timeoutSecs,
      usePlaywrightFallback,
      includeCompany,
      includeContacts,
      includeSocials,
      keyPaths
    });
    
    // Construit le record final (un seul par domaine)
    const record = {
      domain: domainData.domain,
      finalUrl: domainData.finalUrl || url,
      keyPages: domainData.keyPages,
      pagesVisited: domainData.pagesVisited,
      errors: domainData.errors.length > 0 ? domainData.errors : undefined
    };
    
    // Ajoute les données selon les options
    if (includeCompany && domainData.company) {
      record.company = domainData.company;
    }
    
    if (includeContacts) {
      record.emails = domainData.emails;
      record.phones = domainData.phones;
      
      // Ajoute les primary séparément pour faciliter l'accès
      const primaryEmail = domainData.emails.find(e => e.priority === 'primary');
      const primaryPhone = domainData.phones.find(p => p.priority === 'primary');
      
      if (primaryEmail) record.primaryEmail = primaryEmail.value;
      if (primaryPhone) record.primaryPhone = primaryPhone.valueE164 || primaryPhone.valueRaw;
    }
    
    if (includeSocials) {
      // Nettoie les socials vides
      const socials = {};
      for (const [platform, links] of Object.entries(domainData.socials)) {
        if (links.length > 0) {
          socials[platform] = links;
        }
      }
      if (Object.keys(socials).length > 0) {
        record.socials = socials;
      }
    }
    
    // UN SEUL pushData par domaine (pay per result)
    await Actor.pushData(record);
    results.push({ domain, status: 'success' });
    
  } catch (error) {
    log.error(`Error crawling domain ${domain}: ${error.message}`);
    
    // Push quand même un record avec l'erreur
    const errorRecord = {
      domain,
      finalUrl: url,
      errors: [{ url, error: error.message }]
    };
    
    await Actor.pushData(errorRecord);
    results.push({ domain, status: 'error', error: error.message });
  }
}

log.info(`Completed: ${results.filter(r => r.status === 'success').length} successful, ${results.filter(r => r.status === 'error').length} errors`);

await Actor.exit();
