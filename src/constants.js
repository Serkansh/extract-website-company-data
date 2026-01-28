// Chemins clés par défaut pour chaque type de page
export const DEFAULT_KEY_PATHS = {
  contact: ['/contact', '/contact-us', '/nous-contacter', '/contactez-nous'],
  about: ['/about', '/about-us', '/a-propos', '/qui-sommes-nous'],
  team: ['/team', '/our-team', '/equipe', '/staff', '/leadership', '/direction', '/qui-sommes-nous/equipe'],
  legal: ['/legal', '/mentions-legales', '/imprint', '/mentions', '/legal-notice'],
  privacy: ['/privacy', '/politique-de-confidentialite', '/confidentialite', '/privacy-policy']
};

// Patterns regex pour emails
export const EMAIL_REGEX = /[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Emails à filtrer
export const EMAIL_FILTERS = [
  'noreply', 'donotreply', 'no-reply', 'no_reply',
  'example', 'test', 'test@', '@example', 'sample',
  'mailer-daemon', 'postmaster', 'abuse', 'webmaster'
];

// Types d'emails possibles
export const EMAIL_TYPES = {
  GENERAL: 'general',
  SALES: 'sales',
  SUPPORT: 'support',
  BOOKING: 'booking',
  PRESS: 'press',
  BILLING: 'billing',
  OTHER: 'other'
};

// Patterns pour détecter le type d'email
export const EMAIL_TYPE_PATTERNS = {
  sales: ['sales', 'commercial', 'vente', 'business'],
  support: ['support', 'help', 'aide', 'assistance'],
  booking: ['booking', 'reservation', 'reserve'],
  press: ['press', 'media', 'presse', 'communication'],
  billing: ['billing', 'facturation', 'compta', 'accounting']
};

// Patterns regex pour phones (international + FR)
export const PHONE_REGEX = /(?:\+?\d{1,4}[\s.-]?)?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,4}/g;

// Patterns pour exclure (SIRET, TVA, etc.)
export const PHONE_EXCLUSIONS = [
  /^\d{9}$/, // SIRET 9 chiffres
  /^FR\d{2}/, // TVA française
  /^\d{14}$/ // SIRET complet
];

// Réseaux sociaux à extraire
export const SOCIAL_PLATFORMS = {
  linkedin: ['linkedin.com/company/', 'linkedin.com/company/'],
  facebook: ['facebook.com/', 'fb.com/'],
  instagram: ['instagram.com/'],
  twitter: ['twitter.com/', 'x.com/'],
  tiktok: ['tiktok.com/@'],
  youtube: ['youtube.com/', 'youtu.be/'],
  pinterest: ['pinterest.com/'],
  google: ['google.com/maps', 'maps.google.com']
};

// Patterns pour détecter les liens de partage (à exclure)
export const SOCIAL_SHARE_PATTERNS = [
  /\/share\//,
  /\/sharer\.php/,
  /share\.php/,
  /\/intent\//
];

// Patterns pour détecter les membres d'équipe
export const TEAM_PATTERNS = {
  name: /(?:name|nom|fullname|full-name)[\s:=]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
  role: /(?:role|title|position|fonction|poste)[\s:=]+([^,\n]+)/i
};

// User agents
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Assets à ignorer
export const ASSET_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.css', '.js', '.json', '.xml',
  '.zip', '.tar', '.gz', '.rar',
  '.mp4', '.mp3', '.avi', '.mov'
];

// Tiers de crawl (interne, non exposé)
export const CRAWL_TIERS = {
  STANDARD: {
    name: 'standard',
    maxPages: 8
  },
  DEEP: {
    name: 'deep',
    maxPages: 15
  }
};
