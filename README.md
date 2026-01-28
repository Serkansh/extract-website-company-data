# Extract Website Company Data – Email, Phone, Social & Team

Actor Apify pour extraire les données d'entreprise depuis des sites web : profil entreprise, contacts (emails, téléphones), réseaux sociaux et équipe.

## Description

Cet Actor traite une liste de domaines (1 à 200) et extrait automatiquement :

1. **Informations entreprise** : nom, raison sociale, adresse, pays, horaires
2. **Contacts** : emails et téléphones avec normalisation et déduplication
3. **Réseaux sociaux** : LinkedIn, Facebook, Instagram, Twitter/X, TikTok, YouTube, Pinterest, Google Maps
4. **Équipe** : membres d'équipe avec nom, rôle, email, LinkedIn (si page équipe disponible)

## Caractéristiques

- ✅ **Rapide et économique** : Utilise Cheerio/HTTP par défaut, Playwright uniquement en fallback
- ✅ **Déterministe** : Résultats stables et traçables (sourceUrl + snippet)
- ✅ **Déduplication** : Emails et phones dédupliqués automatiquement
- ✅ **Sélection intelligente** : Email et phone "primary" sélectionnés selon des règles précises
- ✅ **Pay per result** : 1 résultat = 1 domaine traité (facturation unique)

## Input

### Paramètres requis

- **startUrls** (array ou string) : Liste des URLs à traiter. Format array `[{ url: "https://example.com" }]` ou texte multi-ligne (une URL par ligne).

### Paramètres optionnels

- **maxDepth** (number, default: 2) : Profondeur maximale de crawl depuis la homepage
- **timeoutSecs** (number, default: 30) : Timeout par requête en secondes (5-120)
- **usePlaywrightFallback** (boolean, default: true) : Utiliser Playwright pour les pages dynamiques si HTTP échoue
- **includeCompany** (boolean, default: true) : Extraire les informations entreprise
- **includeContacts** (boolean, default: true) : Extraire emails et téléphones
- **includeSocials** (boolean, default: true) : Extraire les réseaux sociaux
- **includeTeam** (boolean, default: true) : Extraire les membres d'équipe
- **keyPaths** (array, default: []) : Chemins personnalisés pour surcharger les chemins clés par défaut

### Exemple d'input

```json
{
  "startUrls": [
    { "url": "https://example.com" },
    { "url": "https://another-domain.com" }
  ],
  "maxDepth": 2,
  "timeoutSecs": 30,
  "includeCompany": true,
  "includeContacts": true,
  "includeSocials": true,
  "includeTeam": true
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
    "team": null,
    "legal": "https://example.com/legal",
    "privacy": null
  },
  "pagesVisited": [
    "https://example.com",
    "https://example.com/contact",
    "https://example.com/about"
  ],
  "company": {
    "name": "Example Company",
    "legalName": "Example Company SAS",
    "country": "FR",
    "address": {
      "street": "123 Rue Example",
      "postalCode": "75001",
      "city": "Paris",
      "country": "FR"
    },
    "openingHours": null
  },
  "emails": [
    {
      "value": "contact@example.com",
      "type": "general",
      "priority": "primary",
      "signals": ["mailto", "same_domain", "found_on_contact_page"],
      "sourceUrl": "https://example.com/contact",
      "snippet": "Contact us",
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
        "url": "https://linkedin.com/company/example",
        "handle": "example",
        "sourceUrl": "https://example.com"
      }
    ],
    "facebook": [
      {
        "url": "https://facebook.com/example",
        "handle": "example",
        "sourceUrl": "https://example.com"
      }
    ]
  },
  "team": [
    {
      "name": "John Doe",
      "role": "CEO",
      "email": "john@example.com",
      "linkedin": "https://linkedin.com/in/johndoe",
      "sourceUrl": "https://example.com/team",
      "signals": ["has_image", "has_email", "has_linkedin", "has_role"]
    }
  ],
  "errors": []
}
```

### Champs principaux

- **domain** : Domaine enregistrable (ex: "example.com")
- **finalUrl** : URL finale après redirections
- **keyPages** : Pages clés détectées (contact, about, team, legal, privacy)
- **pagesVisited** : Liste des pages crawlées pour ce domaine
- **company** : Informations entreprise (si `includeCompany: true`)
- **emails** : Liste des emails extraits avec métadonnées
- **primaryEmail** : Email principal sélectionné (same-domain > mailto > contact page)
- **phones** : Liste des téléphones extraits avec normalisation E.164
- **primaryPhone** : Téléphone principal sélectionné (tel: > footer/contact > E.164)
- **socials** : Réseaux sociaux par plateforme
- **team** : Membres d'équipe (si `includeTeam: true` et page équipe trouvée)
- **errors** : Erreurs rencontrées lors du crawl (si présentes)

## Stratégie de crawl

### Pages clés prioritaires

L'Actor détecte et visite automatiquement les pages clés suivantes :

- **Contact** : `/contact`, `/contact-us`, `/nous-contacter`
- **About** : `/about`, `/about-us`, `/a-propos`
- **Team** : `/team`, `/our-team`, `/equipe`, `/staff`, `/leadership`
- **Legal** : `/legal`, `/mentions-legales`, `/imprint`
- **Privacy** : `/privacy`, `/politique-de-confidentialite`

### Tiers de crawl (interne)

L'Actor utilise deux tiers de crawl internes (non configurables) :

- **Standard** : Maximum 8 pages par domaine (défaut)
- **Deep** : Maximum 15 pages par domaine (activation automatique)

Le mode "deep" est activé automatiquement si :
- Une page team est détectée mais non trouvée dans les 8 premières pages
- Le site est fortement structuré (4+ pages clés pertinentes)
- Un fallback Playwright est requis pour pages dynamiques

**Important** : Le changement de tier n'affecte pas l'output. Un seul record est toujours produit par domaine.

## Extraction

### Emails

- **Détection** : Liens `mailto:`, texte brut (regex), JSON-LD schema.org
- **Normalisation** : Lowercase, trim, suppression ponctuation finale
- **Filtrage** : Exclut noreply, donotreply, example, test, etc.
- **Déduplication** : Sur email normalisé (lowercase)
- **Sélection primary** : Same-domain > mailto > contact page > premier valide

### Téléphones

- **Détection** : Liens `tel:`, texte brut (regex international + FR)
- **Normalisation** : `valueRaw` (original) + `valueE164` (si possible via libphonenumber-js)
- **Filtrage** : Exclut SIRET, TVA, numéros non téléphones
- **Déduplication** : Sur `valueE164` si disponible, sinon `digitsOnly(valueRaw)`
- **Sélection primary** : tel: > footer/contact > E.164 > premier valide

### Réseaux sociaux

- **Plateformes** : LinkedIn (company), Facebook, Instagram, Twitter/X, TikTok, YouTube, Pinterest, Google Maps
- **Filtrage** : Exclut les liens de partage
- **Déduplication** : Par URL

### Équipe

- **Détection** : Pages contenant `/team`, `/equipe`, `/staff`, `/leadership`
- **Extraction** : Nom, rôle, email (mailto proche), LinkedIn personnel (`/in/`)
- **Déduplication** : Par (name + role + linkedin)

## Gestion des erreurs

- **Retry** : 2 tentatives automatiques sur timeout/network/429/5xx uniquement
- **Pas de retry** : Sur 404 (page non trouvée)
- **Timeout** : Par requête (`timeoutSecs`), pas de timeout global par domaine
- **Résilience** : Les erreurs sont enregistrées dans `errors[]` sans bloquer le traitement

## Limitations

- Maximum 200 domaines par exécution
- Pas de proxy (crawl direct)
- Pas de respect robots.txt configurable
- Pas d'OCR ni scraping d'images
- Pas de score de fiabilité
- Un seul résultat par domaine (canonicalisation www/non-www)

## Prix

**Modèle de pricing : Pay per result**

- **1 résultat = 1 domaine traité**
- Prix : $20 / 1 000 résultats
- Facturation unique par domaine, indépendante du nombre de pages crawlées

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
- `crawlee` : Framework de scraping
- `cheerio` : Parser HTML côté serveur
- `playwright` : Navigateur headless (fallback)
- `libphonenumber-js` : Normalisation téléphones E.164
- `tldts` : Extraction domaine enregistrable

## Support

Pour toute question ou problème, consultez la documentation Apify ou contactez le support.
