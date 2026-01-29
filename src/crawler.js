import * as cheerio from 'cheerio';
import { Actor, log } from 'apify';
import { getRegistrableDomain, normalizeUrl, isSameDomain, isAsset, resolveUrl } from './utils/url-utils.js';
import { DEFAULT_KEY_PATHS, CRAWL_TIERS, USER_AGENT } from './constants.js';
import { extractEmails } from './extractors/emails.js';
import { extractPhones } from './extractors/phones.js';
import { extractSocials } from './extractors/socials.js';
import { extractCompany } from './extractors/company.js';
import { extractTeam } from './extractors/team.js';
import { deduplicateEmails, deduplicatePhones, deduplicateTeam } from './utils/deduplication.js';
import { extractWithOpenAI } from './utils/openai-extractor.js';

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
 * Extrait des liens internes "pertinents" depuis une page (header/footer/nav priorisés)
 */
function extractInternalLinks(html, baseUrl) {
  const links = [];
  const $ = cheerio.load(html);

  // On ignore scripts/styles
  $('script, style, noscript').remove();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const resolvedUrl = resolveUrl(baseUrl, href);
    if (!resolvedUrl) return;
    if (!isSameDomain(resolvedUrl, baseUrl)) return;
    if (isAsset(resolvedUrl)) return;

    const urlObj = new URL(resolvedUrl);
    const pathname = urlObj.pathname.toLowerCase();
    const text = ($(el).text() || '').toLowerCase().trim();

    // Évite pagination & ancres inutiles
    if (/[?&](page|p)=\d+/i.test(urlObj.search)) return;
    if (/(\/page\/\d+\/?$)/i.test(pathname)) return;

    let score = 0;

    // Priorité header/footer/nav
    const inHeaderNavFooter = $(el).closest('header, nav, footer, .header, .nav, .footer').length > 0;
    if (inHeaderNavFooter) score += 50;

    // Bonus par type de page clé
    const combined = `${pathname} ${text}`;
    const has = (arr) => arr.some((p) => combined.includes(p.replace(/^\//, '')));

    if (has(DEFAULT_KEY_PATHS.contact)) score += 120;
    if (has(DEFAULT_KEY_PATHS.legal)) score += 110;
    if (has(DEFAULT_KEY_PATHS.privacy)) score += 90;
    if (has(DEFAULT_KEY_PATHS.about)) score += 80;
    if (has(DEFAULT_KEY_PATHS.team)) score += 100;

    // Fallback keywords (ex: "legal notice", "imprint", "mentions légales")
    if (/(legal|imprint|mentions|privacy|cookies|contact|about|team|leadership|careers)/i.test(combined)) {
      score += 40;
    }

    links.push({ url: normalizeUrl(resolvedUrl), score });
  });

  // Dédup par URL en gardant le meilleur score
  const best = new Map();
  for (const l of links) {
    const prev = best.get(l.url);
    if (!prev || l.score > prev.score) best.set(l.url, l);
  }

  return Array.from(best.values()).sort((a, b) => b.score - a.score);
}

/**
 * Détermine si le mode "deep" doit être activé
 */
function shouldUseDeepCrawl({ keyPages, pagesVisited, usedPlaywright, includeContacts, includeCompany, includeTeam, emailsCount, phonesCount, teamCount, company }) {
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

  // 4. Manque de données critiques -> on pousse en DEEP
  if (includeContacts && emailsCount === 0 && phonesCount === 0) return true;
  if (includeTeam && teamCount === 0 && keyPages.team) return true;
  if (includeCompany) {
    const missingLegal = !company?.legalName;
    const missingAddr = !company?.address;
    if (missingLegal || missingAddr) return true;
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
    timeoutSecs = 30,
    usePlaywrightFallback = true,
    includeCompany = true,
    includeContacts = true,
    includeSocials = true,
    includeTeam = true,
    keyPaths = [],
    useOpenAI = false,
    openAIModel = 'gpt-4o-mini'
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
  
  // Pool de liens candidats (priorisés)
  const candidateLinks = [];
  const candidateSeen = new Set(urlsToCrawl);

  // Ajoute des liens internes depuis la homepage (header/footer prioritaires)
  for (const l of extractInternalLinks(homepageHtml, startUrl)) {
    if (!candidateSeen.has(l.url)) {
      candidateSeen.add(l.url);
      candidateLinks.push(l);
    }
  }
  
  // Limite le nombre de pages internes selon le tier STANDARD initial
  const maxInternalPages = CRAWL_TIERS.STANDARD.maxPages - urlsToCrawl.size;
  candidateLinks.slice(0, Math.max(0, maxInternalPages)).forEach(l => urlsToCrawl.add(l.url));
  
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

    // Détecte si cette page est une "key page" et met à jour domainData.keyPages
    const urlLower = finalUrl.toLowerCase();
    const pathname = new URL(finalUrl).pathname.toLowerCase();
    
    // Patterns étendus pour chaque type
    const extendedPatterns = {
      legal: ['legal', 'disclaimer', 'mentions', 'imprint', 'legal-notice', 'legal-notice'],
      about: ['about', 'story', 'a-propos', 'qui-sommes', 'our-story'],
      contact: ['contact', 'contact-us', 'nous-contacter', 'contactez'],
      team: ['team', 'equipe', 'staff', 'leadership', 'direction'],
      privacy: ['privacy', 'confidentialite', 'politique-de-confidentialite', 'cookies']
    };
    
    for (const [type, paths] of Object.entries(DEFAULT_KEY_PATHS)) {
      if (!domainData.keyPages[type]) {
        const baseMatches = paths.some(path => 
          pathname === path || pathname.includes(path) || urlLower.includes(path)
        );
        const extendedMatches = extendedPatterns[type]?.some(pattern => 
          pathname.includes(pattern) || urlLower.includes(pattern)
        );
        if (baseMatches || extendedMatches) {
          domainData.keyPages[type] = finalUrl;
        }
      }
    }

    // Découverte de liens supplémentaires (sert au mode DEEP)
    for (const l of extractInternalLinks(html, finalUrl)) {
      if (!candidateSeen.has(l.url)) {
        candidateSeen.add(l.url);
        candidateLinks.push(l);
      }
    }
    
    // Extraction selon les options
    if (includeContacts) {
      const emails = extractEmails(html, url);
      const phones = extractPhones(html, url);
      domainData.emails.push(...emails);
      domainData.phones.push(...phones);
      
      // Si OpenAI est activé et page contact avec plusieurs téléphones, essaie d'associer les téléphones aux bureaux
      if (useOpenAI && phones.length > 1 && (url.includes('/contact') || url.includes('/about'))) {
        try {
          const openAIData = await extractWithOpenAI(html, finalUrl, 'phones', openAIModel);
          
          if (openAIData?.phones && Array.isArray(openAIData.phones)) {
            // Enrichit les téléphones existants avec les informations de localisation
            for (const phoneData of domainData.phones) {
              // Cherche un match dans les données OpenAI
              const phoneE164 = phoneData.valueE164 || phoneData.valueRaw;
              if (phoneE164) {
                const match = openAIData.phones.find(p => 
                  p.phone === phoneE164 || 
                  phoneE164.includes(p.phone?.replace(/[^0-9+]/g, '')) ||
                  p.phone?.replace(/[^0-9+]/g, '') === phoneE164.replace(/[^0-9+]/g, '')
                );
                
                if (match) {
                  // Enrichit avec les informations de localisation
                  phoneData.location = match.location || null;
                  phoneData.city = match.city || null;
                  phoneData.country = match.country || null;
                  phoneData.countryName = match.countryName || null;
                  
                  // Met à jour le snippet avec la localisation si disponible
                  if (match.location && phoneData.snippet) {
                    phoneData.snippet = `${phoneData.snippet} (${match.location})`;
                  }
                }
              }
            }
          }
        } catch (error) {
          log.warning(`OpenAI phone location extraction failed for ${finalUrl}: ${error.message}`);
        }
      }
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
      if (!domainData.company) domainData.company = { name: null, legalName: null, country: null, countryName: null, address: null, openingHours: null };

      // Merge: on ne remplace que les champs manquants (homepage + mentions légales se complètent)
      if (!domainData.company.name && company.name) domainData.company.name = company.name;
      if (!domainData.company.legalName && company.legalName) domainData.company.legalName = company.legalName;
      if (!domainData.company.country && company.country) domainData.company.country = company.country;
      if (!domainData.company.countryName && company.countryName) domainData.company.countryName = company.countryName;
      if (!domainData.company.address && company.address) domainData.company.address = company.address;
      if (!domainData.company.openingHours && company.openingHours) domainData.company.openingHours = company.openingHours;
      
      // Si OpenAI est activé et données manquantes, utilise OpenAI
      // Utilise OpenAI si: legalName manquant, address manquant, ou country manquant
      const needsOpenAI = useOpenAI && (
        !domainData.company.legalName || 
        !domainData.company.address || 
        !domainData.company.address?.country || 
        !domainData.company.country
      );
      
      if (needsOpenAI) {
        // Détermine le type de page pour le prompt OpenAI
        const urlLower = finalUrl.toLowerCase();
        const pathname = new URL(finalUrl).pathname.toLowerCase();
        let pageType = 'general';
        
        if (pathname.includes('/legal') || pathname.includes('/mentions') || pathname.includes('/imprint') || 
            urlLower.includes('legal') || urlLower.includes('mentions')) {
          pageType = 'legal';
        } else if (pathname.includes('/contact') || urlLower.includes('contact')) {
          pageType = 'contact';
        }
        
        try {
          const openAIData = await extractWithOpenAI(html, finalUrl, pageType, openAIModel);
          
          if (openAIData?.company) {
            // Merge les données OpenAI avec les données existantes
            if (!domainData.company.name && openAIData.company.name) {
              domainData.company.name = openAIData.company.name;
            }
            if (!domainData.company.legalName && openAIData.company.legalName) {
              domainData.company.legalName = openAIData.company.legalName;
            }
            if (!domainData.company.address && openAIData.company.address) {
              domainData.company.address = openAIData.company.address;
            } else if (domainData.company.address && openAIData.company.address) {
              // Merge partiel de l'adresse
              if (!domainData.company.address.street && openAIData.company.address.street) {
                domainData.company.address.street = openAIData.company.address.street;
              }
              if (!domainData.company.address.postalCode && openAIData.company.address.postalCode) {
                domainData.company.address.postalCode = openAIData.company.address.postalCode;
              }
              if (!domainData.company.address.city && openAIData.company.address.city) {
                domainData.company.address.city = openAIData.company.address.city;
              }
              if (!domainData.company.address.country && openAIData.company.address.country) {
                domainData.company.address.country = openAIData.company.address.country;
                domainData.company.address.countryName = openAIData.company.address.countryName;
              }
            }
            
            // Propagation du pays depuis l'adresse OpenAI
            if (openAIData.company.address?.country && !domainData.company.country) {
              domainData.company.country = openAIData.company.address.country;
              domainData.company.countryName = openAIData.company.address.countryName;
            }
          }
        } catch (error) {
          // Continue avec les données classiques si OpenAI échoue
          log.warning(`OpenAI extraction failed for ${finalUrl}: ${error.message}`);
        }
      }
      
      // Propagation bidirectionnelle country/countryName (après merge)
      if (domainData.company.address) {
        if (domainData.company.country && !domainData.company.address.country) {
          domainData.company.address.country = domainData.company.country;
          domainData.company.address.countryName = domainData.company.countryName;
        } else if (domainData.company.address.country && !domainData.company.country) {
          domainData.company.country = domainData.company.address.country;
          domainData.company.countryName = domainData.company.address.countryName;
        }
      }
    }
    
    if (includeTeam) {
      // Extraction classique
      const team = extractTeam(html, url);
      
      // Si OpenAI est activé, utilise toujours OpenAI pour la team (mieux filtrer les faux positifs)
      if (useOpenAI && (url.includes('/team') || url.includes('/equipe') || url.includes('/staff') || url.includes('/leadership') || url.includes('/about'))) {
        try {
          const openAIData = await extractWithOpenAI(html, finalUrl, 'team', openAIModel);
          
          if (openAIData?.team && Array.isArray(openAIData.team)) {
            // Ajoute les membres trouvés par OpenAI
            for (const member of openAIData.team) {
              if (member.name) {
                // Vérifie si le membre n'existe pas déjà
                const exists = domainData.team.some(t => 
                  t.name.toLowerCase() === member.name.toLowerCase()
                );
                
                if (!exists) {
                  domainData.team.push({
                    name: member.name,
                    role: member.role || null,
                    email: null,
                    linkedin: member.linkedin || null,
                    sourceUrl: finalUrl,
                    signals: ['openai_extraction', member.linkedin ? 'has_linkedin' : null, member.role ? 'has_role' : null].filter(Boolean)
                  });
                }
              }
            }
          }
        } catch (error) {
          // Continue avec les données classiques si OpenAI échoue
          log.warning(`OpenAI team extraction failed for ${finalUrl}: ${error.message}`);
          // En cas d'erreur OpenAI, utilise la team classique filtrée
          const filteredClassicTeam = team.filter(member => {
            const nameLower = member.name.toLowerCase();
            const falsePositives = ['send message', 'horizon extend', 'contact us', 'view profile', 'our team', 'meet the team', 'about us'];
            return !falsePositives.some(fp => nameLower.includes(fp));
          });
          domainData.team.push(...filteredClassicTeam);
        }
      } else {
        // Pas d'OpenAI : utilise la team classique avec filtrage basique
        const filteredClassicTeam = team.filter(member => {
          const nameLower = member.name.toLowerCase();
          const falsePositives = ['send message', 'horizon extend', 'contact us', 'view profile', 'our team', 'meet the team', 'about us'];
          return !falsePositives.some(fp => nameLower.includes(fp));
        });
        domainData.team.push(...filteredClassicTeam);
      }
    }
    
    return true;
  }
  
  // Crawl les premières pages (tier STANDARD)
  for (const url of pagesToCrawl) {
    await crawlPage(url);
  }
  
  // Vérifie si on doit passer en mode DEEP après avoir crawlé les premières pages
  if (shouldUseDeepCrawl({
    keyPages: keyPagesDetected,
    pagesVisited: domainData.pagesVisited,
    usedPlaywright,
    includeContacts,
    includeCompany,
    includeTeam,
    emailsCount: domainData.emails.length,
    phonesCount: domainData.phones.length,
    teamCount: domainData.team.length,
    company: domainData.company,
  })) {
    crawlTier = CRAWL_TIERS.DEEP;
    
    // Ajoute des pages supplémentaires pour atteindre le max du tier DEEP
    const alreadyCrawled = domainData.pagesVisited.length;
    const remainingPages = CRAWL_TIERS.DEEP.maxPages - alreadyCrawled;
    
    if (remainingPages > 0) {
      // Ajoute plus de pages internes si nécessaire (pool priorisé, alimenté par la découverte)
      candidateLinks.sort((a, b) => b.score - a.score);
      const pagesToAdd = candidateLinks
        .map(l => l.url)
        .filter(u => !domainData.pagesVisited.some(v => normalizeUrl(v) === u))
        .slice(0, remainingPages);

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
