import { ApifyClient } from 'apify-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULTS_FILE = path.join(__dirname, 'test-results-fast.json');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = process.env.ACTOR_ID || 'smart-digital/extract-website-company-data-email-phone-social';

if (!APIFY_TOKEN) {
  console.error('❌ APIFY_TOKEN environment variable is required');
  process.exit(1);
}

const TEST_SITES = [
  'http://www.hotel-opera-liege-paris.com/',
  'https://www.orchidees-hotel.com/',
  'https://www.vacancesbleues.fr/fr/hendaye/hotel-residence-orhoitza',
  'https://www.hotel-origami.com',
  'http://www.hotelorizonte.com',
  'http://www.orlysuperior.com/',
  'http://www.ormelune.com',
  'https://www.orsohotels.com/hotel-orphee',
  'https://www.hotel-ostella.com/',
];

async function runTest(client, url, index, total) {
  const domain = new URL(url).hostname.replace(/^www\./, '');
  console.log(`\n[${index + 1}/${total}] 📤 Test de: ${domain}`);
  const startTime = Date.now();
  
  try {
    const run = await client.actor(ACTOR_ID).start({
      startUrls: [{ url }],
      timeoutSecs: 60,
      usePlaywrightFallback: true,
      includeCompany: true,
      includeContacts: true,
      includeSocials: true,
    });

    console.log(`   ⏳ Run lancé: ${run.id}`);
    
    // Attente avec timeout réduit (2 minutes max par run)
    const finishedRun = await client.run(run.id).waitForFinish({ waitSecs: 120 });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (finishedRun.status !== 'SUCCEEDED') {
      console.log(`   ❌ Échec après ${duration}s: ${finishedRun.status}`);
      return { url, status: 'failed', error: `Run failed with status: ${finishedRun.status}`, duration };
    }

    const { items } = await client.dataset(finishedRun.defaultDatasetId).listItems();
    const data = items[0] || null;

    const issues = [];
    
    // Vérifie que address et openingHours ne sont PAS présents
    if (data?.company?.address) {
      issues.push({ severity: 'high', type: 'address_present', message: 'Le champ address ne devrait pas être présent' });
    }
    if (data?.company?.openingHours) {
      issues.push({ severity: 'high', type: 'openingHours_present', message: 'Le champ openingHours ne devrait pas être présent' });
    }
    
    // Vérifie les données essentielles
    if (!data || !data.company?.name) {
      issues.push({ severity: 'medium', type: 'missing_company_name', message: 'Nom entreprise manquant' });
    }
    if (!data?.company?.country) {
      issues.push({ severity: 'medium', type: 'missing_country', message: 'Pays manquant' });
    }
    if (data?.company?.country && !data?.company?.countryName) {
      issues.push({ severity: 'low', type: 'missing_countryName', message: 'Nom du pays manquant' });
    }
    
    // Vérifie les contacts
    if (!data?.emails || data.emails.length === 0) {
      issues.push({ severity: 'medium', type: 'missing_emails', message: 'Aucun email trouvé' });
    }
    if (!data?.phones || data.phones.length === 0) {
      issues.push({ severity: 'medium', type: 'missing_phones', message: 'Aucun téléphone trouvé' });
    }

    const statusEmoji = issues.length === 0 ? '✅' : '⚠️';
    console.log(`   ${statusEmoji} Terminé en ${duration}s - ${issues.length} problème(s)`);

    return { url, status: 'success', data, issues, duration };

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   ❌ Erreur après ${duration}s: ${error.message}`);
    return { url, status: 'error', error: error.message, duration };
  }
}

async function main() {
  const client = new ApifyClient({ token: APIFY_TOKEN });
  const allResults = [];

  console.log('🚀 Démarrage des tests sur les sites d\'hôtels (sans address/openingHours)...');
  console.log(`📋 ${TEST_SITES.length} site(s) à tester`);
  console.log('⚡ Mode parallèle activé (tous les runs lancés simultanément)\n');

  const startTime = Date.now();

  // Lance tous les tests en parallèle
  const promises = TEST_SITES.map((url, index) => 
    runTest(client, url, index, TEST_SITES.length)
  );

  const results = await Promise.all(promises);
  allResults.push(...results);

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));

  console.log('\n================================================================================');
  console.log('📊 RÉSUMÉ DES TESTS');
  console.log('================================================================================');
  console.log(`⏱️  Durée totale: ${totalDuration}s\n`);

  const successful = allResults.filter(r => r.status === 'success' && r.issues.length === 0).length;
  const minorIssues = allResults.filter(r => r.status === 'success' && r.issues.length > 0).length;
  const failed = allResults.filter(r => r.status === 'failed' || r.status === 'error').length;

  console.log(`✅ Sites sans problème: ${successful}/${TEST_SITES.length}`);
  console.log(`⚠️  Sites avec problèmes: ${minorIssues}/${TEST_SITES.length}`);
  console.log(`❌ Sites en échec: ${failed}/${TEST_SITES.length}`);

  console.log('\n--------------------------------------------------------------------------------');
  console.log('DÉTAILS PAR SITE:');
  console.log('--------------------------------------------------------------------------------');

  for (const result of allResults) {
    const domain = new URL(result.url).hostname.replace(/^www\./, '');
    console.log(`\n🌐 ${domain}`);
    console.log(`   URL: ${result.url}`);
    if (result.duration) {
      console.log(`   ⏱️  Durée: ${result.duration}s`);
    }
    
    if (result.status === 'success') {
      if (result.issues.length === 0) {
        console.log('   ✅ Aucun problème détecté');
      } else {
        console.log(`   ⚠️  ${result.issues.length} problème(s) détecté(s):`);
        result.issues.forEach((issue, idx) => {
          const emoji = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
          console.log(`      ${idx + 1}. ${emoji} [${issue.severity?.toUpperCase() || 'UNKNOWN'}] ${issue.message}`);
        });
      }
      console.log('   📋 Données extraites:');
      if (result.data?.company) {
        console.log(`      - Company: ${result.data.company.name || 'N/A'}`);
        console.log(`      - Legal Name: ${result.data.company.legalName || 'N/A'}`);
        console.log(`      - Country: ${result.data.company.country || 'N/A'} (${result.data.company.countryName || 'N/A'})`);
        if (result.data.company.address) {
          console.log(`      - ⚠️  ADDRESS PRÉSENT (ne devrait pas l'être): ${JSON.stringify(result.data.company.address)}`);
        }
        if (result.data.company.openingHours) {
          console.log(`      - ⚠️  OPENINGHOURS PRÉSENT (ne devrait pas l'être): ${JSON.stringify(result.data.company.openingHours)}`);
        }
      } else {
        console.log('      - Company data: N/A');
      }
      console.log(`      - Emails: ${result.data?.emails?.length || 0}`);
      console.log(`      - Phones: ${result.data?.phones?.length || 0}`);
      console.log(`      - Socials: ${Object.values(result.data?.socials || {}).flat().length || 0}`);
      console.log(`      - Pages visitées: ${result.data?.pagesVisited?.length || 0}`);
    } else {
      console.log(`   ❌ Échec du test: ${result.error}`);
    }
  }

  console.log('\n================================================================================');
  console.log(`\n💾 Résultats sauvegardés dans: ${RESULTS_FILE}`);
}

main().catch(console.error);
