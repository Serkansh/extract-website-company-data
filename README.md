# Extract Website Contact Data – Email, Phone, Social

Actor Apify pour extraire les données de contact depuis des sites web : emails, téléphones et réseaux sociaux.

## Description

Cet Actor traite une liste de domaines et extrait automatiquement :

1. **Contacts** : emails et téléphones avec normalisation et déduplication
2. **Réseaux sociaux** : LinkedIn, Facebook, Instagram, Twitter/X, TikTok, YouTube, Pinterest, Google Maps

## Caractéristiques

- ✅ **Rapide et économique** : Utilise Cheerio/HTTP par défaut, Playwright uniquement en fallback
- ✅ **Déterministe** : Résultats stables et traçables (sourceUrl + snippet)
- ✅ **Déduplication** : Emails et phones dédupliqués automatiquement
- ✅ **Sélection intelligente** : Email et phone "primary" sélectionnés selon des règles précises
- ✅ **Pay per result** : 1 résultat = 1 domaine traité (facturation unique)
- ✅ **Normalisation E.164** : Téléphones normalisés au format international
- ✅ **Filtrage intelligent** : Exclusion automatique des emails de test, autorités publiques, numéros invalides

## Input

### Paramètres requis

- **startUrls** (array ou string) : Liste des URLs à traiter. Format array `[{ url: "https://example.com" }]` ou texte multi-ligne (une URL par ligne).

### Paramètres optionnels

- **timeoutSecs** (number, default: 30) : Timeout par requête en secondes (5-120)
- **usePlaywrightFallback** (boolean, default: true) : Utiliser Playwright pour les pages dynamiques si HTTP échoue
- **includeContacts** (boolean, default: true) : Extraire emails et téléphones
- **includeSocials** (boolean, default: true) : Extraire les réseaux sociaux
- **keyPaths** (array, default: []) : Chemins personnalisés pour surcharger les chemins clés par défaut

### Exemple d'input

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

Un seul record JSON par domaine dans le dataset par défaut.

### Structure du record

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

### Champs principaux

- **domain** : Domaine enregistrable (ex: "example.com")
- **finalUrl** : URL finale après redirections
- **keyPages** : Pages clés détectées (contact, about, legal, privacy)
- **pagesVisited** : Liste des pages crawlées pour ce domaine
- **emails** : Liste des emails extraits avec métadonnées
- **primaryEmail** : Email principal sélectionné (same-domain > mailto > contact page)
- **phones** : Liste des téléphones extraits avec normalisation E.164
- **primaryPhone** : Téléphone principal sélectionné (tel: > footer/contact > E.164)
- **socials** : Réseaux sociaux par plateforme
- **errors** : Erreurs rencontrées lors du crawl (si présentes)

## Stratégie de crawl

### Pages clés prioritaires

L'Actor détecte et visite automatiquement les pages clés suivantes :

- **Contact** : `/contact`, `/contact-us`, `/nous-contacter`
- **About** : `/about`, `/about-us`, `/a-propos`
- **Legal** : `/legal`, `/mentions-legales`, `/imprint`
- **Privacy** : `/privacy`, `/politique-de-confidentialite`

### Tiers de crawl (interne)

L'Actor utilise deux tiers de crawl internes (non configurables) :

- **Standard** : Maximum 8 pages par domaine (défaut)
- **Deep** : Maximum 15 pages par domaine (activation automatique)

Le mode "deep" est activé automatiquement si :
- Le site est fortement structuré (4+ pages clés pertinentes)
- Un fallback Playwright est requis pour pages dynamiques

**Important** : Le changement de tier n'affecte pas l'output. Un seul record est toujours produit par domaine.

## Extraction

### Emails

- **Détection** : Liens `mailto:`, texte brut (regex), JSON-LD schema.org
- **Normalisation** : Lowercase, trim, suppression ponctuation finale
- **Filtrage** : Exclut noreply, donotreply, example, test, autorités publiques (agpd.es, cnil.fr, etc.), emails de test (mail.com, example.com, etc.)
- **Déduplication** : Sur email normalisé (lowercase)
- **Sélection primary** : Same-domain > mailto > contact page > premier valide
- **Validation** : Exclusion des emails concaténés avec numéros de téléphone

### Téléphones

- **Détection** : Liens `tel:`, texte brut (regex international)
- **Normalisation** : `valueRaw` (original) + `valueE164` (si possible via libphonenumber-js)
- **Détection pays** : Automatique depuis URL (TLD, sous-domaine) et contexte
- **Filtrage** : Exclut SIRET, TVA, numéros non téléphones, fax, coordonnées GPS, dates
- **Déduplication** : Sur `valueE164` si disponible, sinon `digitsOnly(valueRaw)`
- **Sélection primary** : Footer/contact > tel: > E.164 > premier valide
- **Validation** : Exclusion des numéros invalides (>15 chiffres, formats incorrects)

### Réseaux sociaux

- **Plateformes** : LinkedIn (company), Facebook, Instagram, Twitter/X, TikTok, YouTube, Pinterest, Google Maps
- **Filtrage** : Exclut les liens de partage, paramètres/policies, services (Wix, Dropbox, Google Drive, OneDrive)
- **Déduplication** : Par URL normalisée et handle
- **Validation** : Exclusion des posts individuels Instagram, liens internes

## Gestion des erreurs

- **Retry** : Tentatives automatiques sur timeout/network/429/5xx uniquement
- **Pas de retry** : Sur 404 (page non trouvée)
- **Timeout** : Par requête (`timeoutSecs`), pas de timeout global par domaine
- **Résilience** : Les erreurs sont enregistrées dans `errors[]` sans bloquer le traitement
- **Variantes d'URL** : Tentatives automatiques sur variantes (http/https, www/non-www, tirets)

## Limitations

- Maximum 200 domaines par exécution
- Pas de proxy (crawl direct)
- Pas de respect robots.txt configurable
- Pas d'OCR ni scraping d'images
- Un seul résultat par domaine (canonicalisation www/non-www)

## Installation locale

```bash
npm install
```

## Exécution locale

```bash
npm start
```

## Dépendances

- `apify` : SDK Apify
- `cheerio` : Parser HTML côté serveur
- `playwright` : Navigateur headless (fallback)
- `libphonenumber-js` : Normalisation téléphones E.164
- `tldts` : Extraction domaine enregistrable

## Support

Pour toute question ou problème, consultez la documentation Apify ou contactez le support.
