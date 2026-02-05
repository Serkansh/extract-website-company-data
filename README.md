# Extract Website Contact Data – Email, Phone, Social

Apify Actor to extract contact data from websites: emails, phone numbers, and social media profiles.

## Description

This Actor processes a list of domains and automatically extracts:

1. ✅ **Emails**: Detection from mailto links, raw text, and JSON-LD schemas. Automatic normalization, filtering, and deduplication.
2. ✅ **Phone Numbers**: Extraction from tel: links and raw text. E.164 normalization with automatic country detection.
3. ✅ **Social Media**: LinkedIn, Facebook, Instagram, Twitter/X, TikTok, YouTube, Pinterest, Google Maps. Filtering of share links and service links.

## Features

- ✅ **Intelligent Crawling**: Automatic detection of key pages (contact, about, legal, privacy). Adaptive crawl (8-15 pages depending on site structure)
- ✅ **Fast and Efficient**: Uses Cheerio/HTTP by default, Playwright only as fallback for dynamic pages
- ✅ **Deterministic**: Stable and traceable results (sourceUrl + snippet for each extraction)
- ✅ **Deduplication**: Emails and phones automatically deduplicated
- ✅ **Smart Selection**: Primary email and phone selected according to precise rules
- ✅ **E.164 Normalization**: Phone numbers normalized to international format with automatic country detection
- ✅ **Smart Filtering**: Automatic exclusion of test emails, public authorities, invalid numbers
- ✅ **Resilience**: Automatic error handling, retry on timeout, attempts on URL variants (http/https, www/non-www)

## Input

### Required Parameters

- **startUrls** (array or string): List of URLs to process. Array format `[{ url: "https://example.com" }]` or multi-line text (one URL per line).

### Optional Parameters

- **timeoutSecs** (number, default: 30): Request timeout in seconds (5-120)
- **usePlaywrightFallback** (boolean, default: true): Use Playwright for dynamic pages if HTTP fails
- **includeContacts** (boolean, default: true): Extract emails and phones
- **includeSocials** (boolean, default: true): Extract social media links
- **keyPaths** (array, default: []): Custom paths to override default key paths

### Input Example

```json
{
  "startUrls": [
    { "url": "https://example.com" },
    { "url": "https://another-domain.com" }
  ],
  "timeoutSecs": 30,
  "includeContacts": true,
  "includeSocials": true
}
```

## Output

A single JSON record per domain in the default dataset.

### Record Structure

```json
{
  "domain": "example.com",
  "finalUrl": "https://example.com",
  "keyPages": {
    "contact": "https://example.com/contact",
    "about": "https://example.com/about",
    "legal": "https://example.com/legal",
    "privacy": "https://example.com/privacy"
  },
  "pagesVisited": [
    "https://example.com",
    "https://example.com/contact",
    "https://example.com/about"
  ],
  "emails": [
    {
      "value": "contact@example.com",
      "type": "general",
      "priority": "primary",
      "signals": ["mailto", "same_domain"],
      "sourceUrl": "https://example.com/contact",
      "snippet": "Contact us at contact@example.com",
      "foundIn": "mailto"
    }
  ],
  "primaryEmail": "contact@example.com",
  "phones": [
    {
      "valueRaw": "+33 1 23 45 67 89",
      "valueE164": "+33123456789",
      "priority": "primary",
      "signals": ["tel", "footer_or_contact"],
      "sourceUrl": "https://example.com/contact",
      "snippet": "Call us: +33 1 23 45 67 89"
    }
  ],
  "primaryPhone": "+33123456789",
  "socials": {
    "linkedin": [
      {
        "url": "https://www.linkedin.com/company/example-corp",
        "handle": "example-corp",
        "sourceUrl": "https://example.com"
      }
    ],
    "facebook": [
      {
        "url": "https://www.facebook.com/examplecorp",
        "handle": "examplecorp",
        "sourceUrl": "https://example.com"
      }
    ]
  },
  "errors": []
}
```

### Main Fields

- **domain**: Registrable domain (e.g., "example.com")
- **finalUrl**: Final URL after redirects
- **keyPages**: Detected key pages (contact, about, legal, privacy)
- **pagesVisited**: List of crawled pages for this domain
- **emails**: List of extracted emails with metadata
- **primaryEmail**: Primary email selected (same-domain > mailto > contact page)
- **phones**: List of extracted phones with E.164 normalization
- **primaryPhone**: Primary phone selected (footer/contact > tel: > E.164)
- **socials**: Social media by platform
- **errors**: Errors encountered during crawl (if present)

## Crawl Strategy

### Priority Key Pages

The Actor automatically detects and visits the following key pages:

- **Contact**: `/contact`, `/contact-us`, `/nous-contacter`
- **About**: `/about`, `/about-us`, `/a-propos`
- **Legal**: `/legal`, `/mentions-legales`, `/imprint`
- **Privacy**: `/privacy`, `/politique-de-confidentialite`

### Crawl Tiers (Internal)

The Actor uses two internal crawl tiers (non-configurable):

- **Standard**: Maximum 8 pages per domain (default)
- **Deep**: Maximum 15 pages per domain (automatic activation)

Deep mode is automatically activated if:
- The site is highly structured (4+ relevant key pages)
- A Playwright fallback is required for dynamic pages

**Important**: Tier change does not affect output. A single record is always produced per domain.

## Extraction

### Emails

- **Detection**: `mailto:` links, raw text (regex), JSON-LD schema.org
- **Normalization**: Lowercase, trim, final punctuation removal
- **Filtering**: Excludes noreply, donotreply, example, test, public authorities (agpd.es, cnil.fr, etc.), test emails (mail.com, example.com, etc.)
- **Deduplication**: On normalized email (lowercase)
- **Primary selection**: Same-domain > mailto > contact page > first valid
- **Validation**: Exclusion of emails concatenated with phone numbers

### Phone Numbers

- **Detection**: `tel:` links, raw text (international regex)
- **Normalization**: `valueRaw` (original) + `valueE164` (if possible via libphonenumber-js)
- **Country detection**: Automatic from URL (TLD, subdomain) and context
- **Filtering**: Excludes SIRET, VAT, non-phone numbers, fax, GPS coordinates, dates
- **Deduplication**: On `valueE164` if available, otherwise `digitsOnly(valueRaw)`
- **Primary selection**: Footer/contact > tel: > E.164 > first valid
- **Validation**: Exclusion of invalid numbers (>15 digits, incorrect formats)

### Social Media

- **Platforms**: LinkedIn (company), Facebook, Instagram, Twitter/X, TikTok, YouTube, Pinterest, Google Maps
- **Filtering**: Excludes share links, settings/policies, services (Wix, Dropbox, Google Drive, OneDrive)
- **Deduplication**: By normalized URL and handle
- **Validation**: Exclusion of individual Instagram posts, internal links

## Error Handling

- **Retry**: Automatic attempts on timeout/network/429/5xx only
- **No retry**: On 404 (page not found)
- **Timeout**: Per request (`timeoutSecs`), no global timeout per domain
- **Resilience**: Errors are recorded in `errors[]` without blocking processing
- **URL Variants**: Automatic attempts on variants (http/https, www/non-www, hyphens)

## Limitations

- Maximum 200 domains per execution
- No proxy (direct crawl)
- No configurable robots.txt respect
- No OCR or image scraping
- Single result per domain (www/non-www canonicalization)
