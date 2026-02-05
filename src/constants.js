// Chemins clés par défaut pour chaque type de page
export const DEFAULT_KEY_PATHS = {
  contact: ['/contact', '/contact-us', '/nous-contacter', '/contactez-nous'],
  about: ['/about', '/about-us', '/a-propos', '/qui-sommes-nous'],
  legal: ['/legal', '/mentions-legales', '/imprint', '/mentions', '/legal-notice'],
  privacy: ['/privacy', '/politique-de-confidentialite', '/confidentialite', '/privacy-policy']
};

// Patterns regex pour emails
// - Ajoute une borne de fin pour éviter les concaténations type "contact@domain.frDirecteur"
// - TLD limité à 2..24 caractères (suffisant pour la majorité des cas)
export const EMAIL_REGEX = /[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}(?![a-zA-Z])/g;

// Emails à filtrer
export const EMAIL_FILTERS = [
  'noreply', 'donotreply', 'no-reply', 'no_reply',
  'example', 'test', 'test@', '@example', 'sample',
  'mailer-daemon', 'postmaster', 'abuse', 'webmaster'
];

// Domaines d'autorités publiques et de test à exclure
export const EMAIL_EXCLUDED_DOMAINS = [
  'agpd.es',           // Autorité espagnole de protection des données
  'cnil.fr',           // Commission française de protection des données
  'ico.org.uk',        // Information Commissioner's Office (UK)
  'mail.com',          // Emails de test/exemple
  'example.com',       // Emails d'exemple
  'test.com',          // Emails de test
  'mailservice.com'    // Emails de test (comme dans olalahomes.com)
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

// Patterns regex pour phones (heuristique)
// On préfère filtrer ensuite par "nombre de digits" pour éviter de capturer des dates.
export const PHONE_REGEX = /\+?\d[\d\s().-]{6,}\d/g;

// Patterns pour exclure (TVA, SIRET, etc.)
// Note: ne pas exclure sur "9 digits" (peut être un vrai téléphone dans certains pays).
export const PHONE_EXCLUSIONS = [
  /^FR\d{2}/i, // TVA française (format texte)
  /^\d{14}$/   // SIRET complet (14 digits)
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
