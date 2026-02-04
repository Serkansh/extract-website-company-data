import { ApifyClient } from 'apify-client';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = process.env.ACTOR_ID || 'smart-digital/extract-website-company-data-email-phone-social';

if (!APIFY_TOKEN) {
  console.error('❌ APIFY_TOKEN environment variable is required');
  process.exit(1);
}

// Sites à tester
const TEST_SITES = [
  'http://www.hotel-opera-liege-paris.com/',
  'https://www.orchidees-hotel.com/',
  'https://www.vacancesbleues.fr/fr/hendaye/hotel-residence-orhoitza',
  'https://www.hotel-origami.com',
  'http://www.hotelorizonte.com',
  'http://www.orlysuperior.com/',
  'http://www.ormelune.com',
  'https://www.orsohotels.com/hotel-orphee',
  'https://www.hotel-ostella.com/'
];

/**
 * Lance un run Apify et récupère les résultats
 */
async function runAndGetResults(client, url) {
  console.log(`\n📤 Test de: ${url}`);
  
  try {
    // Lance le run
    const run = await client.actor(ACTOR_ID).start({
      startUrls: [{ url }],
      timeoutSecs: 30,
      usePlaywrightFallback: true,
      includeCompany: true,
      includeContacts: true,
      includeSocials: true
    });
    
    console.log(`   ⏳ Run lancé: ${run.id}`);
    
    // Attend la fin (max 5 minutes)
    const finishedRun = await client.run(run.id).waitForFinish({ waitSecs: 300 });
    
    if (finishedRun.status !== 'SUCCEEDED') {
      return {
        url,
        status: 'failed',
        error: `Run failed with status: ${finishedRun.status}`,
        data: null
      };
    }
    
    // Récupère les résultats
    const { items } = await client.dataset(finishedRun.defaultDatasetId).listItems();
    
    return {
      url,
      status: 'success',
      error: null,
      data: items[0] || null
    };
  } catch (error) {
    return {
      url,
      status: 'error',
      error: error.message,
      data: null
    };
  }
}

/**
 * Analyse les résultats d'un site
 */
function analyzeResult(result) {
  const issues = [];
  const { url, status, data } = result;
  
  if (status !== 'success' || !data) {
    issues.push({
      severity: 'high',
      type: 'no_data',
      message: `Aucune donnée extraite: ${result.error || 'Unknown error'}`
    });
    return issues;
  }
  
  // Vérifie les données de base
  if (!data.domain) {
    issues.push({ severity: 'high', type: 'missing_domain', message: 'Domain manquant' });
  }
  
  if (!data.finalUrl) {
    issues.push({ severity: 'medium', type: 'missing_finalUrl', message: 'FinalUrl manquant' });
  }
  
  // Vérifie company
  if (data.company) {
    const { company } = data;
    
    if (!company.name && !company.legalName) {
      issues.push({ severity: 'medium', type: 'missing_company_name', message: 'Nom d\'entreprise manquant' });
    }
    
    if (company.address) {
      if (!company.address.street && !company.address.postalCode) {
        issues.push({ severity: 'low', type: 'incomplete_address', message: 'Adresse incomplète' });
      }
      
      // Vérifie la cohérence country
      if (company.address.country && company.country && company.address.country !== company.country) {
        issues.push({
          severity: 'high',
          type: 'country_mismatch',
          message: `Incohérence pays: company.country=${company.country}, address.country=${company.address.country}`
        });
      }
    }
  } else {
    issues.push({ severity: 'medium', type: 'missing_company', message: 'Données entreprise manquantes' });
  }
  
  // Vérifie contacts
  if (data.emails && data.emails.length === 0) {
    issues.push({ severity: 'low', type: 'no_emails', message: 'Aucun email trouvé' });
  }
  
  if (data.phones && data.phones.length === 0) {
    issues.push({ severity: 'low', type: 'no_phones', message: 'Aucun téléphone trouvé' });
  }
  
  // Vérifie socials
  if (data.socials) {
    const hasSocials = Object.values(data.socials).some(arr => Array.isArray(arr) && arr.length > 0);
    if (!hasSocials) {
      issues.push({ severity: 'low', type: 'no_socials', message: 'Aucun réseau social trouvé' });
    }
  }
  
  return issues;
}

/**
 * Affiche un résumé des résultats
 */
function displaySummary(results) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 RÉSUMÉ DES TESTS');
  console.log('='.repeat(80));
  
  const successful = results.filter(r => r.status === 'success' && r.issues.length === 0).length;
  const withIssues = results.filter(r => r.status === 'success' && r.issues.length > 0).length;
  const failed = results.filter(r => r.status !== 'success').length;
  
  console.log(`\n✅ Sites sans problème: ${successful}/${results.length}`);
  console.log(`⚠️  Sites avec problèmes mineurs: ${withIssues}/${results.length}`);
  console.log(`❌ Sites en échec: ${failed}/${results.length}`);
  
  console.log('\n' + '-'.repeat(80));
  console.log('DÉTAILS PAR SITE:');
  console.log('-'.repeat(80));
  
  for (const result of results) {
    const { url, status, issues, data } = result;
    const domain = data?.domain || url;
    
    console.log(`\n🌐 ${domain}`);
    console.log(`   URL: ${url}`);
    
    if (status !== 'success') {
      console.log(`   ❌ Échec: ${result.error || 'Unknown error'}`);
      continue;
    }
    
    if (issues.length === 0) {
      console.log(`   ✅ Aucun problème détecté`);
    } else {
      console.log(`   ⚠️  ${issues.length} problème(s) détecté(s):`);
      issues.forEach((issue, idx) => {
        const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
        console.log(`      ${idx + 1}. ${icon} [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.message}`);
      });
    }
    
    // Affiche un résumé des données extraites
    if (data) {
      console.log(`   📋 Données extraites:`);
      if (data.company) {
        console.log(`      - Company: ${data.company.name || data.company.legalName || 'N/A'}`);
        console.log(`      - Legal Name: ${data.company.legalName || 'N/A'}`);
        console.log(`      - Country: ${data.company.country || 'N/A'} (${data.company.countryName || 'N/A'})`);
        if (data.company.address) {
          const addr = data.company.address;
          console.log(`      - Address: ${addr.street || 'N/A'}, ${addr.postalCode || ''} ${addr.city || ''}`);
        }
      }
      console.log(`      - Emails: ${data.emails?.length || 0}`);
      console.log(`      - Phones: ${data.phones?.length || 0}`);
      const socialsCount = data.socials ? Object.values(data.socials).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0) : 0;
      console.log(`      - Socials: ${socialsCount}`);
      console.log(`      - Pages visitées: ${data.pagesVisited?.length || 0}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
}

/**
 * Fonction principale
 */
async function testSites() {
  console.log('🚀 Démarrage des tests sur les sites d\'hôtels...');
  console.log(`📋 ${TEST_SITES.length} site(s) à tester\n`);
  
  const client = new ApifyClient({ token: APIFY_TOKEN });
  const results = [];
  
  for (let i = 0; i < TEST_SITES.length; i++) {
    const url = TEST_SITES[i];
    console.log(`\n[${i + 1}/${TEST_SITES.length}]`);
    
    const result = await runAndGetResults(client, url);
    const issues = analyzeResult(result);
    
    results.push({
      ...result,
      issues
    });
    
    // Petite pause entre les tests
    if (i < TEST_SITES.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Affiche le résumé
  displaySummary(results);
  
  // Sauvegarde les résultats dans un fichier JSON
  const outputPath = path.join(__dirname, 'test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Résultats sauvegardés dans: ${outputPath}`);
  
  return results;
}

// Lance les tests
testSites().catch(error => {
  console.error(`\n💥 Erreur fatale: ${error.message}`);
  process.exit(1);
});
