import * as cheerio from 'cheerio';
import { getRegistrableDomain, normalizeUrl, isSameDomain, isAsset, resolveUrl } from './utils/url-utils.js';
import { DEFAULT_KEY_PATHS, CRAWL_TIERS, USER_AGENT } from './constants.js';
import { extractEmails } from './extractors/emails.js';
import { extractPhones } from './extractors/phones.js';
import { extractSocials } from './extractors/socials.js';
import { extractCompany } from './extractors/company.js';
import { extractTeam } from './extractors/team.js';
import { deduplicateEmails, deduplicatePhones, deduplicateTeam } from './utils/deduplication.js';

/**
 * Détecte les pages clés depuis la homepage
 */
function detectKeyPages(html, baseUrl) {
  const keyPages = {
    contact: null,
    about: null,
    team: null,
    legal: null,
    privacy: null
  };
  
  const $ = cheerio.load(html);
  const domain = getRegistrableDomain(baseUrl);
  
  // Cherche les liens internes correspondant aux chemins clés
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    
    const resolvedUrl = resolveUrl(baseUrl, href);
    if (!resolvedUrl || !isSameDomain(resolvedUrl, baseUrl) || isAsset(resolvedUrl)) {
      return;
    }
    
    const urlLower = resolvedUrl.toLowerCase();
    const pathname = new URL(resolvedUrl).pathname.toLowerCase();
    
    // Vérifie chaque type de page clé
    for (const [type, paths] of Object.entries(DEFAULT_KEY_PATHS)) {
      if (!keyPages[type]) {
        const matches = paths.some(path => 
          pathname === path || pathname.includes(path) || urlLower.includes(path)
        );
        
        if (matches) {
          keyPages[type] = resolvedUrl;
        }
      }
    }
  });
  
  return keyPages;
}

/**
 * Détermine si le mode "deep" doit être activé
 */
function shouldUseDeepCrawl(keyPages, pagesVisited, usedPlaywright) {
  // 1. Page team détectée mais non visitée dans les 8 premières pages
  if (keyPages.team && !pagesVisited.includes(keyPages.team)) {
    return true;
  }
  
  // 2. Site fortement structuré (plusieurs pages clés pertinentes)
  const keyPagesCount = Object.values(keyPages).filter(Boolean).length;
  if (keyPagesCount >= 4) {
    return true;
  }
  
  // 3. Fallback Playwright requis
  if (usedPlaywright) {
    return true;
  }
  
  return false;
}

/**
 * Sélectionne l'email primary et met à jour la priorité
 */
function selectPrimaryEmail(emails, domain) {
  if (emails.length === 0) return null;
  
  // Marque tous comme secondary d'abord
  emails.forEach(e => e.priority = 'secondary');
  
  // 1. Same-domain
  const sameDomain = emails.filter(e => e.signals.includes('same_domain'));
  if (sameDomain.length > 0) {
    const mailto = sameDomain.find(e => e.signals.includes('mailto'));
    if (mailto) {
      mailto.priority = 'primary';
      return mailto;
    }
    
    const contact = sameDomain.find(e => 
      e.sourceUrl.includes('/contact') || e.sourceUrl.includes('/legal')
    );
    if (contact) {
      contact.priority = 'primary';
      return contact;
    }
    
    const general = sameDomain.find(e => e.type === 'general');
    if (general) {
      general.priority = 'primary';
      return general;
    }
    
    sameDomain[0].priority = 'primary';
    return sameDomain[0];
  }
  
  // 2. Mailto
  const mailto = emails.find(e => e.signals.includes('mailto'));
  if (mailto) {
    mailto.priority = 'primary';
    return mailto;
  }
  
  // 3. Contact page
  const contact = emails.find(e => 
    e.sourceUrl.includes('/contact') || e.sourceUrl.includes('/legal')
  );
  if (contact) {
    contact.priority = 'primary';
    return contact;
  }
  
  // 4. Fallback: premier valide
  const general = emails.find(e => e.type === 'general') || emails[0];
  if (general) {
    general.priority = 'primary';
    return general;
  }
  
  return null;
}

/**
 * Sélectionne le phone primary et met à jour la priorité
 */
function selectPrimaryPhone(phones) {
  if (phones.length === 0) return null;
  
  // Marque tous comme secondary d'abord
  phones.forEach(p => p.priority = 'secondary');
  
  // 1. tel: link
  const tel = phones.find(p => p.signals.includes('tel'));
  if (tel) {
    tel.priority = 'primary';
    return tel;
  }
  
  // 2. Footer/contact
  const footer = phones.find(p => p.signals.includes('footer_or_contact'));
  if (footer) {
    footer.priority = 'primary';
    return footer;
  }
  
  // 3. E.164
  const e164 = phones.find(p => p.valueE164);
  if (e164) {
    e164.priority = 'primary';
    return e164;
  }
  
  // 4. Fallback: premier
  phones[0].priority = 'primary';
  return phones[0];
}

/**
 * Crawl un domaine complet
 */
export async function crawlDomain(startUrl, options) {
  const {
    maxDepth = 2,
    timeoutSecs = 30,
    usePlaywrightFallback = true,
    includeCompany = true,
    includeContacts = true,
    includeSocials = true,
    includeTeam = true,
    keyPaths = []
  } = options;
  
  const domain = getRegistrableDomain(startUrl);
  if (!domain) {
    throw new Error(`Invalid domain: ${startUrl}`);
  }
  
  // Données agrégées pour ce domaine
  const domainData = {
    domain,
    finalUrl: null,
    keyPages: {},
    pagesVisited: [],
    errors: [],
    emails: [],
    phones: [],
    socials: {
      linkedin: [],
      facebook: [],
      instagram: [],
      x: [],
      tiktok: [],
      youtube: [],
      pinterest: [],
      google: []
    },
    company: null,
    team: []
  };
  
  // Tier de crawl (commence en standard)
  let crawlTier = CRAWL_TIERS.STANDARD;
  let usedPlaywright = false;
  let keyPagesDetected = {};
  
  // Fonction pour fetch une page
  async function fetchPage(url, usePlaywright = false) {
    try {
      if (usePlaywright && usePlaywrightFallback) {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutSecs * 1000 });
        const html = await page.content();
        const finalUrl = page.url();
        await browser.close();
        usedPlaywright = true;
        return { html, finalUrl };
      } else {
        const response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(timeoutSecs * 1000),
          redirect: 'follow'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        const finalUrl = response.url;
        return { html, finalUrl };
      }
    } catch (error) {
      // Retry avec Playwright si HTTP échoue
      if (!usePlaywright && usePlaywrightFallback && 
          (error.name === 'TimeoutError' || error.message.includes('fetch'))) {
        return fetchPage(url, true);
      }
      throw error;
    }
  }
  
  // 1. Fetch homepage
  let homepageHtml;
  try {
    const result = await fetchPage(startUrl);
    homepageHtml = result.html;
    domainData.finalUrl = result.finalUrl || startUrl;
  } catch (error) {
    domainData.errors.push({ url: startUrl, error: error.message });
    throw error;
  }
  
  // 2. Détecte les pages clés
  keyPagesDetected = detectKeyPages(homepageHtml, startUrl);
  domainData.keyPages = { ...keyPagesDetected };
  
  // 3. Détermine le tier initial (commence toujours en STANDARD)
  // Le passage en DEEP sera vérifié après avoir crawlé les premières pages
  crawlTier = CRAWL_TIERS.STANDARD;
  
  // 4. Liste des URLs à crawler (homepage + pages clés + pages internes)
  const urlsToCrawl = new Set([normalizeUrl(startUrl)]);
  
  // Ajoute les pages clés détectées
  Object.values(keyPagesDetected).forEach(url => {
    if (url) urlsToCrawl.add(normalizeUrl(url));
  });
  
  // Ajoute des pages internes depuis la homepage (jusqu'à maxPages)
  const $ = cheerio.load(homepageHtml);
  const internalLinks = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const resolvedUrl = resolveUrl(startUrl, href);
    
    if (resolvedUrl && 
        isSameDomain(resolvedUrl, startUrl) && 
        !isAsset(resolvedUrl) &&
        !urlsToCrawl.has(normalizeUrl(resolvedUrl))) {
      internalLinks.push(resolvedUrl);
    }
  });
  
  // Limite le nombre de pages internes selon le tier STANDARD initial
  const maxInternalPages = CRAWL_TIERS.STANDARD.maxPages - urlsToCrawl.size;
  internalLinks.slice(0, maxInternalPages).forEach(url => {
    urlsToCrawl.add(normalizeUrl(url));
  });
  
  // 5. Crawl toutes les pages (commence avec STANDARD, peut passer en DEEP)
  let pagesToCrawl = Array.from(urlsToCrawl).slice(0, CRAWL_TIERS.STANDARD.maxPages);
  
  // Fonction pour crawler une page
  async function crawlPage(url) {
    let html;
    let finalUrl = url;
    let retries = 2;
    
    while (retries >= 0) {
      try {
        const result = await fetchPage(url);
        html = result.html;
        finalUrl = result.finalUrl || url;
        break;
      } catch (error) {
        // Retry uniquement sur timeout/network/429/5xx
        const shouldRetry = 
          error.name === 'TimeoutError' ||
          error.message.includes('fetch') ||
          error.message.includes('429') ||
          error.message.includes('5');
        
        if (shouldRetry && retries > 0) {
          retries--;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
          continue;
        }
        
        domainData.errors.push({ url, error: error.message });
        break;
      }
    }
    
    if (!html) return false;
    
    domainData.pagesVisited.push(finalUrl);
    
    // Extraction selon les options
    if (includeContacts) {
      const emails = extractEmails(html, url);
      const phones = extractPhones(html, url);
      domainData.emails.push(...emails);
      domainData.phones.push(...phones);
    }
    
    if (includeSocials) {
      const socials = extractSocials(html, url);
      // Merge socials (évite doublons)
      for (const [platform, links] of Object.entries(socials)) {
        if (links.length > 0) {
          domainData.socials[platform].push(...links);
        }
      }
    }
    
    if (includeCompany) {
      const company = extractCompany(html, url);
      if (!domainData.company) domainData.company = { name: null, legalName: null, country: null, address: null, openingHours: null };

      // Merge: on ne remplace que les champs manquants (homepage + mentions légales se complètent)
      if (!domainData.company.name && company.name) domainData.company.name = company.name;
      if (!domainData.company.legalName && company.legalName) domainData.company.legalName = company.legalName;
      if (!domainData.company.country && company.country) domainData.company.country = company.country;
      if (!domainData.company.address && company.address) domainData.company.address = company.address;
      if (!domainData.company.openingHours && company.openingHours) domainData.company.openingHours = company.openingHours;
    }
    
    if (includeTeam && (url.includes('/team') || url.includes('/equipe') || url.includes('/staff'))) {
      const team = extractTeam(html, url);
      domainData.team.push(...team);
    }
    
    return true;
  }
  
  // Crawl les premières pages (tier STANDARD)
  for (const url of pagesToCrawl) {
    await crawlPage(url);
  }
  
  // Vérifie si on doit passer en mode DEEP après avoir crawlé les premières pages
  if (shouldUseDeepCrawl(keyPagesDetected, domainData.pagesVisited, usedPlaywright)) {
    crawlTier = CRAWL_TIERS.DEEP;
    
    // Ajoute des pages supplémentaires pour atteindre le max du tier DEEP
    const alreadyCrawled = domainData.pagesVisited.length;
    const remainingPages = CRAWL_TIERS.DEEP.maxPages - alreadyCrawled;
    
    if (remainingPages > 0) {
      // Ajoute plus de pages internes si nécessaire
      const additionalLinks = internalLinks.filter(link => {
        const normalized = normalizeUrl(link);
        return !urlsToCrawl.has(normalized) && 
               !domainData.pagesVisited.some(visited => normalizeUrl(visited) === normalized);
      });
      
      const pagesToAdd = additionalLinks.slice(0, remainingPages);
      
      for (const url of pagesToAdd) {
        if (domainData.pagesVisited.length >= CRAWL_TIERS.DEEP.maxPages) break;
        await crawlPage(url);
      }
    }
  }
  
  // 6. Déduplication
  if (includeContacts) {
    domainData.emails = deduplicateEmails(domainData.emails);
    domainData.phones = deduplicatePhones(domainData.phones);
    
    // Sélection primary
    const primaryEmail = selectPrimaryEmail(domainData.emails, domain);
    const primaryPhone = selectPrimaryPhone(domainData.phones);
  }
  
  if (includeTeam) {
    domainData.team = deduplicateTeam(domainData.team);
  }
  
  // 7. Déduplique les socials
  if (includeSocials) {
    for (const [platform, links] of Object.entries(domainData.socials)) {
      const seen = new Set();
      domainData.socials[platform] = links.filter(link => {
        const key = link.url;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }
  
  return domainData;
}
