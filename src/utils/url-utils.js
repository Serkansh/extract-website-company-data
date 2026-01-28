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
