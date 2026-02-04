import { ApifyClient } from 'apify-client';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Configuration
const APIFY_TOKEN = process.env.APIFY_TOKEN;

if (!APIFY_TOKEN) {
  console.error('❌ APIFY_TOKEN environment variable is required');
  process.exit(1);
}
const ACTOR_ID = process.env.ACTOR_ID || 'smart-digital/extract-website-company-data-email-phone-social';
const TEST_SITES = [
  'http://www.hotel-opera-liege-paris.com/',
  'https://www.orchidees-hotel.com/',
  'https://www.vacancesbleues.fr/fr/hendaye/hotel-residence-orhoitza',
  'https://www.hotel-origami.com',
  'http://www.orlysuperior.com/',
  'http://www.ormelune.com',
  'https://www.orsohotels.com/hotel-orphee',
  'https://www.hotel-ostella.com/'
];
const MAX_ITERATIONS = 15;

let iterationCount = 0;

/**
 * Analyse les résultats et identifie les problèmes d'adresses
 */
function analyzeResults(results) {
  const issues = [];
  
  for (const result of results) {
    if (result.status !== 'success' || !result.data?.company) continue;
    
    const { company } = result.data;
    const { address } = company || {};
    
    if (address?.street) {
      // Problème 1: Adresse contient du texte parasite
      const parasiticPatterns = [
        /^(?:est\s+situé|siège\s+social|représentée\s+par|et\s+dont)/i,
        /\d{8,}(?:\s+et\s+dont|,\s+représentée)/i,
        /EUROS?\s+et\s+dont/i,
        /Président\.?\s*Siège\s+social/i
      ];
      
      for (const pattern of parasiticPatterns) {
        if (pattern.test(address.street)) {
          issues.push({
            type: 'parasitic_text_in_street',
            domain: result.data.domain,
            street: address.street,
            pattern: pattern.toString(),
            severity: 'high'
          });
          break;
        }
      }
      
      // Problème 2: Adresse ne commence pas par un numéro
      if (!/^\d+/.test(address.street.trim())) {
        issues.push({
          type: 'street_not_starting_with_number',
          domain: result.data.domain,
          street: address.street,
          severity: 'high'
        });
      }
    }
    
    // Problème 3: Pays manquant pour une ville française
    if (address?.city && !company.country) {
      const frenchCities = ['verdun', 'bastia', 'hendaye', 'athis', 'paris', 'marseille', 'strasbourg'];
      const isFrenchCity = frenchCities.some(city => 
        address.city.toLowerCase().includes(city.toLowerCase())
      );
      
      if (isFrenchCity) {
        issues.push({
          type: 'missing_country_for_french_city',
          domain: result.data.domain,
          city: address.city,
          severity: 'high'
        });
      }
    }
  }
  
  return issues;
}

/**
 * Corrige le code en fonction des problèmes détectés
 */
function fixCode(issues) {
  const companyExtractorPath = path.join(ROOT_DIR, 'src/extractors/company.js');
  let code = fs.readFileSync(companyExtractorPath, 'utf-8');
  let modified = false;
  const fixes = [];
  
  for (const issue of issues) {
    if (issue.type === 'parasitic_text_in_street' || issue.type === 'street_not_starting_with_number') {
      // Améliore le nettoyage des adresses
      if (!code.includes('Nettoie encore une fois pour enlever les restes de phrases parasites')) {
        // Le code existe déjà, on peut l'améliorer
      }
      
      // Ajoute plus de patterns de nettoyage si nécessaire
      if (issue.street.includes('représentée par son Président')) {
        if (!code.includes('représentée\\s+par\\s+son\\s+Président')) {
          // Le pattern existe déjà
        }
      }
    }
    
    if (issue.type === 'missing_country_for_french_city') {
      // Vérifie que la détection des villes françaises inclut toutes les villes
      if (!code.includes('bastia') && issue.city.toLowerCase().includes('bastia')) {
        // Ajoute 'bastia' à la liste si pas présent
        const cityListMatch = code.match(/(const frenchCities = \[[^\]]+)/);
        if (cityListMatch && !cityListMatch[1].includes('bastia')) {
          code = code.replace(
            /(const frenchCities = \[[^\]]+)/,
            "$1, 'bastia'"
          );
          modified = true;
          fixes.push('Ajouté bastia à la liste des villes françaises');
        }
      }
    }
  }
  
  if (modified) {
    fs.writeFileSync(companyExtractorPath, code, 'utf-8');
    console.log(`✅ Code modifié avec ${fixes.length} correction(s):`);
    fixes.forEach(fix => console.log(`   - ${fix}`));
    return true;
  }
  
  return false;
}

/**
 * Lance un run Apify pour tous les sites et récupère les résultats
 */
async function runAndGetResults(client) {
  console.log(`\n🔄 Itération ${iterationCount + 1}/${MAX_ITERATIONS}`);
  console.log(`📤 Lancement des runs pour ${TEST_SITES.length} sites...`);
  
  const results = [];
  
  for (let i = 0; i < TEST_SITES.length; i++) {
    const url = TEST_SITES[i];
    console.log(`\n[${i + 1}/${TEST_SITES.length}] ${url}`);
    
    try {
      const run = await client.actor(ACTOR_ID).start({
        startUrls: [{ url }],
        timeoutSecs: 30,
        usePlaywrightFallback: true,
        includeCompany: true,
        includeContacts: true,
        includeSocials: true
      });
      
      console.log(`   ⏳ Run lancé: ${run.id}`);
      const finishedRun = await client.run(run.id).waitForFinish({ waitSecs: 300 });
      
      if (finishedRun.status !== 'SUCCEEDED') {
        results.push({ url, status: 'failed', error: finishedRun.status, data: null });
        continue;
      }
      
      const { items } = await client.dataset(finishedRun.defaultDatasetId).listItems();
      results.push({ url, status: 'success', error: null, data: items[0] || null });
      
      // Petite pause entre les runs
      if (i < TEST_SITES.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      results.push({ url, status: 'error', error: error.message, data: null });
    }
  }
  
  return results;
}

/**
 * Fonction principale d'optimisation automatique
 */
async function autoOptimize() {
  if (iterationCount >= MAX_ITERATIONS) {
    console.log(`\n⚠️  Limite de ${MAX_ITERATIONS} itérations atteinte. Arrêt.`);
    return;
  }
  
  iterationCount++;
  
  try {
    const client = new ApifyClient({ token: APIFY_TOKEN });
    
    // 1. Lance les runs et récupère les résultats
    const results = await runAndGetResults(client);
    
    // 2. Analyse les résultats
    console.log(`\n🔍 Analyse des résultats...`);
    const issues = analyzeResults(results);
    
    if (issues.length === 0) {
      console.log(`\n✅ Aucun problème détecté ! Toutes les adresses sont propres.`);
      console.log(`\n📋 Résumé des résultats:`);
      results.forEach((result, idx) => {
        if (result.data?.company?.address) {
          const addr = result.data.company.address;
          console.log(`   ${idx + 1}. ${result.data.domain}: ${addr.street || 'N/A'}, ${addr.postalCode || ''} ${addr.city || ''}`);
        }
      });
      return;
    }
    
    // 3. Affiche les problèmes
    console.log(`\n❌ ${issues.length} problème(s) détecté(s):`);
    issues.forEach((issue, idx) => {
      console.log(`   ${idx + 1}. [${issue.severity?.toUpperCase() || 'UNKNOWN'}] ${issue.type}`);
      console.log(`      - Domain: ${issue.domain || 'N/A'}`);
      if (issue.street) console.log(`      - Street: ${issue.street}`);
      if (issue.city) console.log(`      - City: ${issue.city}`);
    });
    
    // 4. Corrige le code
    console.log(`\n🔧 Correction du code...`);
    const codeModified = fixCode(issues);
    
    if (!codeModified) {
      console.log(`⚠️  Aucune correction automatique possible.`);
      return;
    }
    
    // 5. Commit et push
    console.log(`\n📤 Commit et push des corrections...`);
    execSync('git add src/extractors/company.js', { cwd: ROOT_DIR, stdio: 'inherit' });
    execSync(`git commit -m "fix: auto-optimize addresses iteration ${iterationCount}"`, { 
      cwd: ROOT_DIR, 
      stdio: 'inherit' 
    });
    execSync('git push', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log(`✅ Code commité et poussé`);
    
    // 6. Attend le build Apify
    console.log(`\n⏳ Attente du build Apify (90 secondes)...`);
    await new Promise(resolve => setTimeout(resolve, 90000));
    
    // 7. Répète
    console.log(`\n🔄 Nouvelle itération...\n`);
    await autoOptimize();
    
  } catch (error) {
    console.error(`\n❌ Erreur dans l'itération ${iterationCount}:`);
    console.error(error);
    throw error;
  }
}

// Lance l'optimisation automatique
console.log('🚀 Démarrage de l\'optimisation automatique des adresses...');
console.log(`📋 Configuration:`);
console.log(`   - Actor ID: ${ACTOR_ID}`);
console.log(`   - Test sites: ${TEST_SITES.length}`);
console.log(`   - Max iterations: ${MAX_ITERATIONS}`);
console.log(`\n`);

autoOptimize().catch(error => {
  console.error(`\n💥 Erreur fatale: ${error.message}`);
  process.exit(1);
});
