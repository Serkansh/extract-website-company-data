import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { EMAIL_FILTERS, EMAIL_TYPE_PATTERNS } from '../constants.js';

/**
 * Normalise un email (lowercase, trim, strip ponctuation finale)
 */
export function normalizeEmail(email) {
  if (!email) return null;
  
  let normalized = email.trim().toLowerCase();
  
  // Supprime la ponctuation finale (.,;:)
  normalized = normalized.replace(/[.,;:]$/, '');
  
  // Nettoie les préfixes numériques collés (ex: "00hotel@operaliege.com" -> "hotel@operaliege.com")
  // Ces préfixes viennent souvent de numéros de téléphone collés au texte
  // Pattern: un ou plusieurs digits au début, suivis directement d'une lettre
  normalized = normalized.replace(/^\d+([a-z])/, '$1');
  
  return normalized;
}

/**
 * Vérifie si un email doit être filtré
 */
export function shouldFilterEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return true;
  
  return EMAIL_FILTERS.some(filter => normalized.includes(filter));
}

/**
 * Extrait les digits uniquement d'un numéro de téléphone
 */
export function digitsOnly(phone) {
  return phone.replace(/\D/g, '');
}

/**
 * Nettoie un snippet pour l'output (JSON stable et lisible)
 * - supprime les caractères de contrôle
 * - remplace les retours ligne / tabs par des espaces
 * - compacte les espaces
 */
export function cleanSnippet(snippet, maxLen = 240) {
  if (!snippet) return null;
  const cleaned = String(snippet)
    .replace(/[\u0000-\u001F\u007F]/g, ' ') // contrôle ASCII
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

/**
 * Mapping indicatifs téléphoniques internationaux -> code pays ISO
 */
const COUNTRY_CALLING_CODES = {
  '1': 'US', // US/Canada (on détectera via contexte si besoin)
  '7': 'RU',
  '20': 'EG',
  '27': 'ZA',
  '30': 'GR',
  '31': 'NL',
  '32': 'BE',
  '33': 'FR',
  '34': 'ES',
  '36': 'HU',
  '39': 'IT',
  '40': 'RO',
  '41': 'CH',
  '43': 'AT',
  '44': 'UK',
  '45': 'DK',
  '46': 'SE',
  '47': 'NO',
  '48': 'PL',
  '49': 'DE',
  '51': 'PE',
  '52': 'MX',
  '53': 'CU',
  '54': 'AR',
  '55': 'BR',
  '56': 'CL',
  '57': 'CO',
  '58': 'VE',
  '60': 'MY',
  '61': 'AU',
  '62': 'ID',
  '63': 'PH',
  '64': 'NZ',
  '65': 'SG',
  '66': 'TH',
  '81': 'JP',
  '82': 'KR',
  '84': 'VN',
  '86': 'CN',
  '90': 'TR',
  '91': 'IN',
  '92': 'PK',
  '93': 'AF',
  '94': 'LK',
  '95': 'MM',
  '98': 'IR',
  '212': 'MA',
  '213': 'DZ',
  '216': 'TN',
  '218': 'LY',
  '220': 'GM',
  '221': 'SN',
  '222': 'MR',
  '223': 'ML',
  '224': 'GN',
  '225': 'CI',
  '226': 'BF',
  '227': 'NE',
  '228': 'TG',
  '229': 'BJ',
  '230': 'MU',
  '231': 'LR',
  '232': 'SL',
  '233': 'GH',
  '234': 'NG',
  '235': 'TD',
  '236': 'CF',
  '237': 'CM',
  '238': 'CV',
  '239': 'ST',
  '240': 'GQ',
  '241': 'GA',
  '242': 'CG',
  '243': 'CD',
  '244': 'AO',
  '245': 'GW',
  '246': 'IO',
  '248': 'SC',
  '249': 'SD',
  '250': 'RW',
  '251': 'ET',
  '252': 'SO',
  '253': 'DJ',
  '254': 'KE',
  '255': 'TZ',
  '256': 'UG',
  '257': 'BI',
  '258': 'MZ',
  '260': 'ZM',
  '261': 'MG',
  '262': 'RE',
  '263': 'ZW',
  '264': 'NA',
  '265': 'MW',
  '266': 'LS',
  '267': 'BW',
  '268': 'SZ',
  '269': 'KM',
  '290': 'SH',
  '291': 'ER',
  '297': 'AW',
  '298': 'FO',
  '299': 'GL',
  '350': 'GI',
  '351': 'PT',
  '352': 'LU',
  '353': 'IE',
  '354': 'IS',
  '355': 'AL',
  '356': 'MT',
  '357': 'CY',
  '358': 'FI',
  '359': 'BG',
  '370': 'LT',
  '371': 'LV',
  '372': 'EE',
  '373': 'MD',
  '374': 'AM',
  '375': 'BY',
  '376': 'AD',
  '377': 'MC',
  '378': 'SM',
  '380': 'UA',
  '381': 'RS',
  '382': 'ME',
  '383': 'XK',
  '385': 'HR',
  '386': 'SI',
  '387': 'BA',
  '389': 'MK',
  '420': 'CZ',
  '421': 'SK',
  '423': 'LI',
  '500': 'FK',
  '501': 'BZ',
  '502': 'GT',
  '503': 'SV',
  '504': 'HN',
  '505': 'NI',
  '506': 'CR',
  '507': 'PA',
  '508': 'PM',
  '509': 'HT',
  '590': 'GP',
  '591': 'BO',
  '592': 'GY',
  '593': 'EC',
  '594': 'GF',
  '595': 'PY',
  '596': 'MQ',
  '597': 'SR',
  '598': 'UY',
  '599': 'CW',
  '670': 'TL',
  '672': 'NF',
  '673': 'BN',
  '674': 'NR',
  '675': 'PG',
  '676': 'TO',
  '677': 'SB',
  '678': 'VU',
  '679': 'FJ',
  '680': 'PW',
  '681': 'WF',
  '682': 'CK',
  '683': 'NU',
  '685': 'WS',
  '686': 'KI',
  '687': 'NC',
  '688': 'TV',
  '689': 'PF',
  '690': 'TK',
  '691': 'FM',
  '692': 'MH',
  '850': 'KP',
  '852': 'HK',
  '853': 'MO',
  '855': 'KH',
  '856': 'LA',
  '880': 'BD',
  '886': 'TW',
  '960': 'MV',
  '961': 'LB',
  '962': 'JO',
  '963': 'SY',
  '964': 'IQ',
  '965': 'KW',
  '966': 'SA',
  '967': 'YE',
  '968': 'OM',
  '970': 'PS',
  '971': 'AE',
  '972': 'IL',
  '973': 'BH',
  '974': 'QA',
  '975': 'BT',
  '976': 'MN',
  '977': 'NP',
  '992': 'TJ',
  '993': 'TM',
  '994': 'AZ',
  '995': 'GE',
  '996': 'KG',
  '998': 'UZ',
};

/**
 * Détecte l'indicatif pays au début d'un numéro et retourne le code pays ISO
 * @param {string} phone - Le numéro de téléphone (digits uniquement)
 * @returns {string|null} Code pays ISO ou null
 */
function detectCountryFromCallingCode(phone) {
  if (!phone) return null;
  
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return null; // Trop court pour être un numéro international
  
  // Essaie les indicatifs de 1 à 3 chiffres (du plus long au plus court)
  for (let len = 3; len >= 1; len--) {
    const code = digits.substring(0, len);
    if (COUNTRY_CALLING_CODES[code]) {
      return COUNTRY_CALLING_CODES[code];
    }
  }
  
  return null;
}

/**
 * Normalise un numéro de téléphone
 * Retourne { valueRaw, valueE164 }
 * @param {string} phoneRaw - Le numéro de téléphone à normaliser
 * @param {string|null} countryCodeFromUrl - Code pays ISO détecté depuis l'URL (ex: 'FR', 'UK', 'DE') ou null
 * @param {string|null} countryCodeFromContext - Code pays ISO détecté depuis le contexte (snippet) ou null
 */
export function normalizePhone(phoneRaw, countryCodeFromUrl = null, countryCodeFromContext = null) {
  if (!phoneRaw) return { valueRaw: null, valueE164: null };
  
  let cleaned = phoneRaw.trim();
  let valueE164 = null;
  
  // Priorité : contexte > URL (le contexte est plus fiable car spécifique au numéro)
  const countryCode = countryCodeFromContext || countryCodeFromUrl;
  
  try {
    // Normalisation CONSERVATRICE pour éviter de transformer des IDs en numéros (ex: appId/ovh)
    // 1) Si ça commence par "+", on parse tel quel (format international explicite)
    if (cleaned.startsWith('+')) {
      const phoneNumber = parsePhoneNumber(cleaned);
      if (phoneNumber?.number && isValidPhoneNumber(phoneNumber.number)) valueE164 = phoneNumber.number;
    } else {
      // 2) Si ça commence par "00", on convertit en "+"
      if (/^00\d/.test(cleaned)) {
        cleaned = `+${cleaned.slice(2)}`;
      } else {
        // 3) Détecte si le numéro commence par un indicatif pays (sans + ni 00)
        // Ex: "441483276699" (UK), "33123456789" (FR), "49123456789" (DE)
        const digitsOnly = cleaned.replace(/\D/g, '');
        const detectedCountry = detectCountryFromCallingCode(digitsOnly);
        
        if (detectedCountry) {
          // Le numéro commence par un indicatif pays, on ajoute le +
          // On garde les digits uniquement pour éviter les problèmes de formatage
          cleaned = `+${digitsOnly}`;
        }
      }

      if (cleaned.startsWith('+')) {
        const phoneNumber = parsePhoneNumber(cleaned);
        if (phoneNumber?.number && isValidPhoneNumber(phoneNumber.number)) valueE164 = phoneNumber.number;
      } else {
        // 4) Si on a un code pays (depuis contexte ou URL), on l'utilise
        if (countryCode) {
          const phoneNumber = parsePhoneNumber(cleaned, countryCode);
          if (phoneNumber?.number && isValidPhoneNumber(phoneNumber.number)) valueE164 = phoneNumber.number;
        }
        // 5) Si pas de code pays, on ne normalise PAS (on garde le numéro tel quel avec le 0)
        // Cela évite de transformer un numéro local d'un autre pays en numéro français
      }
    }
  } catch {
    // Ignore les erreurs de parsing
  }
  
  return {
    valueRaw: cleaned,
    valueE164
  };
}

/**
 * Détecte le type d'email depuis sa valeur ou son contexte
 */
export function detectEmailType(email, context = '') {
  const lowerEmail = email.toLowerCase();
  const lowerContext = context.toLowerCase();
  
  const combined = `${lowerEmail} ${lowerContext}`;
  
  for (const [type, patterns] of Object.entries(EMAIL_TYPE_PATTERNS)) {
    if (patterns.some(pattern => combined.includes(pattern))) {
      return type;
    }
  }
  
  return 'general';
}
